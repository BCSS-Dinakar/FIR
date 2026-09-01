const OpenAI = require('openai');

/**
 * Embedding service — separate from vLLM chat/text generation.
 *
 * The Qwen chat model must NOT receive embedding requests. Configure a dedicated
 * OpenAI-compatible embedding endpoint via EMBEDDING_BASE_URL + EMBEDDING_MODEL.
 */

const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL?.trim();
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || '';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL?.trim();
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || '50', 10);
const EMBEDDING_BATCH_PACE_MS = parseInt(process.env.EMBEDDING_BATCH_PACE_MS || '500', 10);
const MAX_RETRIES = parseInt(process.env.EMBEDDING_MAX_RETRIES || process.env.VLLM_MAX_RETRIES || '3', 10);

let client = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class EmbeddingNotConfiguredError extends Error {
  constructor() {
    super(
      'Embedding service is not configured. Set EMBEDDING_BASE_URL and EMBEDDING_MODEL ' +
      'to an OpenAI-compatible embedding endpoint, then run "node scripts/ingestLawEmbeddings.js".'
    );
    this.name = 'EmbeddingNotConfiguredError';
  }
}

const requireEmbeddingConfig = () => {
  if (!EMBEDDING_BASE_URL || !EMBEDDING_MODEL) {
    throw new EmbeddingNotConfiguredError();
  }
};

const getClient = () => {
  requireEmbeddingConfig();
  if (!client) {
    client = new OpenAI({
      baseURL: EMBEDDING_BASE_URL,
      apiKey: EMBEDDING_API_KEY || 'not-needed'
    });
  }
  return client;
};

const errorMessage = (error) =>
  error?.error?.message ||
  error?.message ||
  String(error);

const isRetryable = (error) => {
  const status = error?.status || error?.response?.status;
  return status === 429 || (status >= 500 && status < 600) || !status;
};

const withRetries = async (label, fn) => {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw new Error(`Embedding ${label} error: ${errorMessage(error)}`);
      if (attempt < MAX_RETRIES) await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error(`Embedding ${label} error after retries: ${errorMessage(lastError)}`);
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
 * Embeds many texts via an OpenAI-compatible /embeddings endpoint.
 * @param {string[]} texts
 * @param {(batchVectors: number[][], batchStartIndex: number) => void} [onBatchComplete]
 * @returns {Promise<number[][]>}
 */
const generateEmbeddingsBatch = async (texts, onBatchComplete) => {
  const results = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const batchVectors = await withRetries('batch', async () => {
      const response = await getClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch
      });
      const data = response.data;
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error(`Embedding API returned ${data?.length} vectors for ${batch.length} inputs.`);
      }
      return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    });

    results.push(...batchVectors);
    if (onBatchComplete) onBatchComplete(batchVectors, i);
    if (i + EMBEDDING_BATCH_SIZE < texts.length) await sleep(EMBEDDING_BATCH_PACE_MS);
  }
  return results;
};

const getEmbeddingModelId = () => EMBEDDING_MODEL || null;

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  getEmbeddingModelId,
  EmbeddingNotConfiguredError
};
