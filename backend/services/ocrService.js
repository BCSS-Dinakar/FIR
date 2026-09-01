const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { stripModelReasoning } = require('../helpers/llmUtils');

/**
 * OCR service — PaddleOCR-VL via the OCR gateway.
 *
 * Routing:
 *   Images (PNG, JPEG, WEBP, TIFF, BMP) → /v1/chat/completions (image_url + OCR: prompt)
 *   Documents (PDF, DOCX, DOC)        → /v1/ocr/extract or /v1/ocr/extract/json
 *     (gateway renders pages / extracts text; Paddle accepts images only on raw vLLM)
 *
 * Plain-text files and PDFs with an embedded text layer skip this service (see firPipeline).
 *
 * Profiles tune chat-completions prompts for images only:
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

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.doc']);

const MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/tiff': '.tif',
  'image/bmp': '.bmp'
};

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
      'to enable image and scanned-document text extraction.'
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

const ocrRootUrl = () => OCR_BASE_URL.replace(/\/$/, '');

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

const extensionFromName = (filename = '') => path.extname(String(filename)).toLowerCase();

const ensureExtension = (filename, ext) => {
  const base = String(filename || '').trim() || `document${ext}`;
  return extensionFromName(base) ? path.basename(base) : `${path.basename(base)}${ext}`;
};

const bufferStartsWith = (buffer, asciiPrefix) =>
  buffer.length >= asciiPrefix.length
  && buffer.toString('ascii', 0, asciiPrefix.length) === asciiPrefix;

const sniffFormatFromBuffer = (buffer) => {
  if (!buffer?.length) return null;
  if (bufferStartsWith(buffer, '%PDF')) return 'pdf';
  if (bufferStartsWith(buffer, 'PK')) return 'docx';
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return 'doc';
  }
  return null;
};

const sniffFormatFromBase64 = (base64Data) => {
  try {
    const sample = Buffer.from(String(base64Data).slice(0, 64), 'base64');
    return sniffFormatFromBuffer(sample);
  } catch {
    return null;
  }
};

const formatToFilename = (format) => {
  if (format === 'pdf') return 'document.pdf';
  if (format === 'docx') return 'document.docx';
  if (format === 'doc') return 'document.doc';
  return 'document.bin';
};

const isImageFormat = (mimeType, filename = '') => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(extensionFromName(filename));
};

const isDocumentFormat = (mimeType, filename = '', bufferOrBase64 = null) => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return true;
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return true;
  if (DOCUMENT_EXTENSIONS.has(extensionFromName(filename))) return true;

  if (Buffer.isBuffer(bufferOrBase64)) {
    return Boolean(sniffFormatFromBuffer(bufferOrBase64));
  }
  if (typeof bufferOrBase64 === 'string' && bufferOrBase64.length > 0) {
    return Boolean(sniffFormatFromBase64(bufferOrBase64));
  }
  return false;
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

const resolveFilename = (mimeType, filename, sniffedFormat = null) => {
  const name = String(filename || '').trim();
  if (name && extensionFromName(name)) return path.basename(name);
  if (name && sniffedFormat) return ensureExtension(name, `.${sniffedFormat}`);
  const ext = MIME_TO_EXT[String(mimeType || '').toLowerCase()]
    || (sniffedFormat ? `.${sniffedFormat}` : '.bin');
  return name ? ensureExtension(name, ext) : `document${ext}`;
};

const normalizeOcrOutput = (text) => {
  let cleaned = stripModelReasoning(String(text || ''));
  cleaned = cleaned
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return cleaned;
};

const parseDocumentOcrResponse = (payload) => {
  const text = normalizeOcrOutput(
    payload?.text
    || (Array.isArray(payload?.pages)
      ? payload.pages.map((p) => p?.text || '').filter(Boolean).join('\n\n')
      : '')
  );
  if (!text) {
    throw new Error('Document OCR returned empty text.');
  }
  return text;
};

const authHeaders = () => ({
  Authorization: `Bearer ${OCR_API_KEY}`
});

/**
 * PDF / DOCX / DOC via gateway document OCR (JSON base64).
 */
const extractViaDocumentOcrJson = async (base64Data, filename, maxTokens) => {
  const response = await fetch(`${ocrRootUrl()}/ocr/extract/json`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data_base64: base64Data,
      filename: resolveFilename(null, filename),
      max_tokens: maxTokens
    })
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Document OCR returned non-JSON (${response.status}): ${raw.slice(0, 300)}`);
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.error?.message || raw;
    throw new Error(`Document OCR failed (${response.status}): ${String(detail).slice(0, 300)}`);
  }

  return parseDocumentOcrResponse(payload);
};

/**
 * PDF / DOCX / DOC via gateway document OCR (multipart upload).
 */
const extractViaDocumentOcrUpload = async (filePath, filename, maxTokens) => {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), resolveFilename(null, filename));
  form.append('max_tokens', String(maxTokens));

  const response = await fetch(`${ocrRootUrl()}/ocr/extract`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Document OCR returned non-JSON (${response.status}): ${raw.slice(0, 300)}`);
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.error?.message || raw;
    throw new Error(`Document OCR failed (${response.status}): ${String(detail).slice(0, 300)}`);
  }

  return parseDocumentOcrResponse(payload);
};

/**
 * Single-page images via chat completions (PaddleOCR-VL image_url + prompt).
 */
const extractViaChatCompletion = async (base64Data, mimeType, options = {}) => {
  if (isDocumentFormat(mimeType, options.filename, base64Data)) {
    throw new Error(
      'Refusing to send PDF/Word to image OCR. Use extractTextFromFilePath() or pass filename with .pdf/.docx/.doc.'
    );
  }

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

/**
 * Extract text from a file on disk. Prefers multipart upload for documents.
 * @param {string} filePath
 * @param {string} mimeType
 * @param {{ profile?: string, filename?: string }} [options]
 */
const extractTextFromFilePath = async (filePath, mimeType, options = {}) => {
  if (!OCR_BASE_URL || !OCR_API_KEY) throw new OcrNotConfiguredError();

  const filename = options.filename || path.basename(filePath);
  const maxTokens = resolveMaxTokens(OCR_MODEL);
  const buffer = fs.readFileSync(filePath);
  const sniffed = sniffFormatFromBuffer(buffer);

  if (isDocumentFormat(mimeType, filename, buffer)) {
    const uploadName = resolveFilename(mimeType, filename, sniffed);
    return withRetries(() => extractViaDocumentOcrUpload(filePath, uploadName, maxTokens));
  }

  const base64Data = buffer.toString('base64');
  return extractTextFromDocument(base64Data, mimeType, { ...options, filename });
};

/**
 * Extract text from a document (image, PDF, or Word) via the OCR gateway.
 * @param {string} base64Data - Base64 file contents (no data: prefix).
 * @param {string} mimeType - e.g. 'application/pdf', 'image/jpeg'.
 * @param {{ profile?: 'petition'|'form'|'table', filename?: string }} [options]
 * @returns {Promise<string>} Extracted text.
 */
const extractTextFromDocument = async (base64Data, mimeType, options = {}) => {
  if (!OCR_BASE_URL || !OCR_API_KEY) throw new OcrNotConfiguredError();

  const filename = options.filename;
  const maxTokens = resolveMaxTokens(OCR_MODEL);
  const sniffed = sniffFormatFromBase64(base64Data);

  if (isDocumentFormat(mimeType, filename, base64Data)) {
    const docName = resolveFilename(mimeType, filename, sniffed);
    return withRetries(() => extractViaDocumentOcrJson(base64Data, docName, maxTokens));
  }

  if (!isImageFormat(mimeType, filename)) {
    throw new Error(
      `Unsupported OCR format (${mimeType || 'unknown'}). ` +
      'Supported: PNG, JPEG, WEBP, TIFF, BMP, PDF, DOCX, DOC.'
    );
  }

  return extractViaChatCompletion(base64Data, mimeType, options);
};

module.exports = {
  extractTextFromDocument,
  extractTextFromFilePath,
  resolveOcrPrompt,
  resolveMaxTokens,
  getModelFamily,
  isImageFormat,
  isDocumentFormat,
  OcrNotConfiguredError,
  VALID_PROFILES
};
