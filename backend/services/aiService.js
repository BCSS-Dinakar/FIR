const axios = require('axios');

/**
 * Provider-neutral AI service, currently backed by Mistral.
 *
 * Deliberately named for the role it plays rather than the vendor behind it —
 * the previous vendor-named module meant a provider switch touched every caller.
 * Callers depend only on generateText / extractTextFromDocument /
 * generateEmbedding / generateEmbeddingsBatch.
 */

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_BASE = 'https://api.mistral.ai/v1';

const TEXT_MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';
const FALLBACK_TEXT_MODEL = process.env.MISTRAL_FALLBACK_MODEL || 'mistral-small-latest';
const OCR_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';
const EMBEDDING_MODEL = process.env.MISTRAL_EMBEDDING_MODEL || 'mistral-embed';

const TEMPERATURE = parseFloat(process.env.MISTRAL_TEMPERATURE || '0.1');
const MAX_OUTPUT_TOKENS = parseInt(process.env.MISTRAL_MAX_OUTPUT_TOKENS || '800', 10);
const MAX_RETRIES = parseInt(process.env.MISTRAL_MAX_RETRIES || '3', 10);

// Mistral's embeddings endpoint takes an array of inputs per call, so a "batch"
// is one HTTP request rather than N — far cheaper than the previous provider's
// per-item quota accounting. Kept modest so one failure doesn't lose much work.
const EMBEDDING_BATCH_SIZE = parseInt(process.env.MISTRAL_EMBEDDING_BATCH_SIZE || '50', 10);
const EMBEDDING_BATCH_PACE_MS = parseInt(process.env.MISTRAL_EMBEDDING_BATCH_PACE_MS || '500', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const authHeaders = () => ({
  Authorization: `Bearer ${MISTRAL_API_KEY}`,
  'Content-Type': 'application/json'
});

const requireKey = () => {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is missing. Add it to backend/.env.');
  }
};

const errorMessage = (error) =>
  error.response?.data?.message ||
  error.response?.data?.error?.message ||
  error.message;

/**
 * 429 (rate limited) and 5xx are worth retrying. 401/403 (bad key, blocked
 * account) and 422 (malformed request) are not — retrying those just stalls the
 * caller before failing anyway.
 */
const isRetryable = (error) => {
  const status = error.response?.status;
  return status === 429 || (status >= 500 && status < 600) || !status; // no status = network blip
};

const retryDelayMs = (error, attempt) => {
  const header = error.response?.headers?.['retry-after'];
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000 + 500;
  return 1000 * Math.pow(2, attempt); // 1s, 2s, 4s...
};

/**
 * Runs an API call with retry/backoff.
 * @param {string} label - Used in error messages.
 * @param {Function} fn - The call to run.
 * @param {{failFastOnRateLimit?: boolean}} [opts] - When a fallback model is
 *   available, a 429 on the primary is better spent switching models immediately
 *   (separate rate-limit bucket) than burning seconds of backoff on the model
 *   that's already throttled.
 */
const withRetries = async (label, fn, { failFastOnRateLimit = false } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (failFastOnRateLimit && error.response?.status === 429) {
        throw new Error(`Mistral ${label} rate limited: ${errorMessage(error)}`);
      }
      if (!isRetryable(error)) throw new Error(`Mistral ${label} error: ${errorMessage(error)}`);
      if (attempt < MAX_RETRIES) await sleep(retryDelayMs(error, attempt));
    }
  }
  throw new Error(`Mistral ${label} error after retries: ${errorMessage(lastError)}`);
};

/**
 * Sends a text prompt and returns the completion text.
 * @param {string} prompt
 * @param {number} [maxTokens] - Overrides MISTRAL_MAX_OUTPUT_TOKENS for this call.
 * @returns {Promise<string>}
 */
const generateText = async (prompt, maxTokens = MAX_OUTPUT_TOKENS) => {
  requireKey();

  const call = (model) => async () => {
    const response = await axios.post(
      `${MISTRAL_API_BASE}/chat/completions`,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: TEMPERATURE,
        max_tokens: maxTokens
      },
      { headers: authHeaders() }
    );
    const text = response.data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Mistral returned an empty response.');
    return text.trim();
  };

  const hasFallback = FALLBACK_TEXT_MODEL && FALLBACK_TEXT_MODEL !== TEXT_MODEL;

  try {
    return await withRetries('text', call(TEXT_MODEL), { failFastOnRateLimit: hasFallback });
  } catch (primaryError) {
    if (!hasFallback) throw primaryError;
    console.warn(`Primary model ${TEXT_MODEL} unavailable (${primaryError.message}); using ${FALLBACK_TEXT_MODEL}.`);
    return withRetries('text (fallback)', call(FALLBACK_TEXT_MODEL));
  }
};

/**
 * Extracts text from a document (image or PDF, including scanned/image-only PDFs)
 * using Mistral's dedicated OCR endpoint — purpose-built for this, rather than
 * asking a general vision model to transcribe.
 * @param {string} base64Data - Base64 file contents (no data: prefix).
 * @param {string} mimeType - e.g. 'application/pdf', 'image/jpeg'.
 * @returns {Promise<string>} Extracted text, pages joined in order.
 */
const extractTextFromDocument = async (base64Data, mimeType) => {
  requireKey();

  const isPdf = mimeType === 'application/pdf';
  const dataUri = `data:${mimeType};base64,${base64Data}`;
  const document = isPdf
    ? { type: 'document_url', document_url: dataUri }
    : { type: 'image_url', image_url: dataUri };

  return withRetries('OCR', async () => {
    const response = await axios.post(
      `${MISTRAL_API_BASE}/ocr`,
      { model: OCR_MODEL, document },
      { headers: authHeaders() }
    );
    const pages = response.data.pages;
    if (!Array.isArray(pages)) throw new Error('Mistral OCR returned no pages.');
    return pages.map((p) => p.markdown || '').join('\n\n').trim();
  });
};

/**
 * Embeds a single text.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
const generateEmbedding = async (text) => {
  const [vector] = await generateEmbeddingsBatch([text]);
  return vector;
};

/**
 * Embeds many texts. Mistral accepts an array per request, so each HTTP call
 * covers EMBEDDING_BATCH_SIZE texts.
 * @param {string[]} texts
 * @param {(batchVectors: number[][], batchStartIndex: number) => void} [onBatchComplete]
 *   Called after each chunk succeeds so long-running callers can persist progress.
 * @returns {Promise<number[][]>} Embeddings in the same order as the input texts.
 */
const generateEmbeddingsBatch = async (texts, onBatchComplete) => {
  requireKey();

  const results = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const batchVectors = await withRetries('embedding', async () => {
      const response = await axios.post(
        `${MISTRAL_API_BASE}/embeddings`,
        { model: EMBEDDING_MODEL, input: batch },
        { headers: authHeaders() }
      );
      const data = response.data.data;
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error(`Mistral returned ${data?.length} embeddings for ${batch.length} inputs.`);
      }
      // Sort by index defensively — the API returns an index per item and order
      // is not contractually guaranteed to match the input array.
      return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    });

    results.push(...batchVectors);
    if (onBatchComplete) onBatchComplete(batchVectors, i);
    if (i + EMBEDDING_BATCH_SIZE < texts.length) await sleep(EMBEDDING_BATCH_PACE_MS);
  }
  return results;
};

module.exports = {
  generateText,
  extractTextFromDocument,
  generateEmbedding,
  generateEmbeddingsBatch
};
