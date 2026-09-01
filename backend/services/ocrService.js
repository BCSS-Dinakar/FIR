const OpenAI = require('openai');
const { stripModelReasoning } = require('../helpers/llmUtils');

/**
 * OCR service — vision models via OpenAI-compatible chat completions.
 * Separate from vLLM Qwen text generation.
 *
 * Plain-text files and PDFs with an embedded text layer do not use this service.
 *
 * Profiles are tuned for the petition → translate → validate → RAG pipeline:
 *   petition (default) — narrative complaints, handwritten/typed scans
 *   form             — structured FIR/police forms with labeled fields
 *   table            — tabular annexures, charge sheets, property lists
 */

const OCR_BASE_URL = process.env.OCR_BASE_URL?.trim();
const OCR_API_KEY = process.env.OCR_API_KEY || '';
const OCR_MODEL = process.env.OCR_MODEL || 'paddleocr-vl:0.9b';
const OCR_PROFILE = (process.env.OCR_PROFILE || 'petition').trim().toLowerCase();
const OCR_PROMPT = process.env.OCR_PROMPT?.trim() || '';
const OCR_MAX_RETRIES = parseInt(process.env.OCR_MAX_RETRIES || '3', 10);

/** Paddle: 4096 ctx; gateway reserves ~2048 vision tokens — keep output ≤ 2048 (default 1024). */
const PADDLEOCR_DEFAULT_MAX_TOKENS = 1024;
const PADDLEOCR_MAX_TOKENS_CAP = 2048;
/** Qwen-VL and similar: 8192 ctx — more headroom for long petition pages. */
const VLM_DEFAULT_MAX_TOKENS = 4096;

const VALID_PROFILES = new Set(['petition', 'form', 'table']);

/** PaddleOCR-VL task prefixes (short, model-trained). */
const PADDLEOCR_PROMPTS = {
  petition: 'OCR:',
  form: 'OCR:',
  table: 'Table Recognition:'
};

/** General VLMs (Qwen-VL, etc.) — explicit rules for downstream translation/RAG. */
const VLM_PROMPTS = {
  petition: `Extract all visible text from this police petition, complaint, or FIR-related document.

Rules:
- Reading order: top to bottom; if columns exist, left column fully then right column.
- Include handwritten and printed text. Preserve the original language (do NOT translate).
- Copy names, dates, times, phone numbers, addresses, ID numbers, and IPC/BNS/BNSS section references exactly as written.
- Preserve line breaks and paragraph structure where visible.
- Mark truly illegible words as [illegible]; never guess or invent missing text.
- Output plain text only — no markdown, headings, or commentary.`,

  form: `Extract all visible text from this police or FIR form (typed or handwritten fields).

Rules:
- Preserve every field label and its value (e.g. "Complainant Name:", "Date of Incident:").
- Reading order: top to bottom, left to right across columns.
- Copy names, dates, times, phone numbers, addresses, and section numbers exactly.
- Preserve the original language (do NOT translate).
- Mark illegible field values as [illegible]; do not invent content.
- Output plain text only — one field per line where possible, no markdown or commentary.`,

  table: `Extract all visible text from this tabular police document (property list, charge sheet table, annexure, etc.).

Rules:
- Preserve row and column structure using tabs between columns and newlines between rows.
- Include column headers and every cell value; preserve original language (do NOT translate).
- Copy numbers, dates, amounts, and identifiers exactly.
- Mark illegible cells as [illegible]; do not invent data.
- Output plain text only — no markdown tables or commentary.`
};

let client = null;

class OcrNotConfiguredError extends Error {
  constructor() {
    super(
      'OCR service is not configured. Set OCR_BASE_URL and OCR_API_KEY in backend/.env ' +
      'to enable image and scanned-PDF text extraction.'
    );
    this.name = 'OcrNotConfiguredError';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getClient = () => {
  if (!OCR_BASE_URL) throw new OcrNotConfiguredError();
  if (!OCR_API_KEY) {
    throw new Error('OCR_API_KEY is missing. Add it to backend/.env.');
  }
  if (!client) {
    client = new OpenAI({
      baseURL: OCR_BASE_URL,
      apiKey: OCR_API_KEY
    });
  }
  return client;
};

const isRetryable = (error) => {
  const status = error?.status || error?.response?.status;
  return status === 429 || (status >= 500 && status < 600) || !status;
};

const withRetries = async (fn) => {
  let lastError;
  for (let attempt = 0; attempt <= OCR_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
      if (attempt < OCR_MAX_RETRIES) await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw lastError;
};

const getModelFamily = (model = OCR_MODEL) => {
  const name = String(model).toLowerCase();
  if (name.includes('paddleocr')) return 'paddleocr';
  return 'vlm';
};

/**
 * Model-aware max_tokens. Paddle is capped to avoid 400/OOM; VLM allows larger output.
 * OCR_MAX_TOKENS env overrides the family default but Paddle is still clamped to 2048.
 */
const resolveMaxTokens = (model = OCR_MODEL) => {
  const family = getModelFamily(model);
  const envValue = parseInt(process.env.OCR_MAX_TOKENS || '', 10);
  if (family === 'paddleocr') {
    const requested = Number.isFinite(envValue) ? envValue : PADDLEOCR_DEFAULT_MAX_TOKENS;
    return Math.min(requested, PADDLEOCR_MAX_TOKENS_CAP);
  }
  return Number.isFinite(envValue) ? envValue : VLM_DEFAULT_MAX_TOKENS;
};

const normalizeProfile = (profile) => {
  const key = String(profile || OCR_PROFILE).trim().toLowerCase();
  return VALID_PROFILES.has(key) ? key : 'petition';
};

/**
 * Resolve the vision prompt for a document profile and model family.
 * Priority: OCR_PROMPT env → OCR_PROMPT_<PROFILE> env → built-in profile defaults.
 */
const resolveOcrPrompt = ({ profile, model } = {}) => {
  if (OCR_PROMPT) return OCR_PROMPT;

  const key = normalizeProfile(profile);
  const envOverride = process.env[`OCR_PROMPT_${key.toUpperCase()}`]?.trim();
  if (envOverride) return envOverride;

  const family = getModelFamily(model);
  if (family === 'paddleocr') {
    return PADDLEOCR_PROMPTS[key] || PADDLEOCR_PROMPTS.petition;
  }
  return VLM_PROMPTS[key] || VLM_PROMPTS.petition;
};

const normalizeOcrOutput = (text) => {
  let cleaned = stripModelReasoning(String(text || ''));
  cleaned = cleaned
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return cleaned;
};

/**
 * Extract text from a document (image or PDF) via the configured vision model.
 * @param {string} base64Data - Base64 file contents (no data: prefix).
 * @param {string} mimeType - e.g. 'application/pdf', 'image/jpeg'.
 * @param {{ profile?: 'petition'|'form'|'table' }} [options]
 * @returns {Promise<string>} Extracted text.
 */
const extractTextFromDocument = async (base64Data, mimeType, options = {}) => {
  const profile = normalizeProfile(options.profile);
  const prompt = resolveOcrPrompt({ profile, model: OCR_MODEL });
  const maxTokens = resolveMaxTokens(OCR_MODEL);
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const text = await withRetries(async () => {
    const response = await getClient().chat.completions.create({
      model: OCR_MODEL,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    });
    const content = normalizeOcrOutput(response.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error('OCR returned empty text.');
    }
    return content;
  });

  return text;
};

module.exports = {
  extractTextFromDocument,
  resolveOcrPrompt,
  resolveMaxTokens,
  getModelFamily,
  OcrNotConfiguredError,
  VALID_PROFILES
};
