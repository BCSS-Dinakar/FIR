const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE || '0.1');
const GEMINI_MAX_OUTPUT_TOKENS = parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '800', 10);
const GEMINI_MAX_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10);
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const GEMINI_EMBEDDING_DIMENSIONS = parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS || '768', 10);
// batchEmbedContents has no documented hard cap, but the free tier enforces ~100
// embed_content requests/minute — each item in a batch counts individually — so
// keep batches small and paced (see EMBEDDING_BATCH_PACE_MS below).
const EMBEDDING_BATCH_SIZE = 10;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// A per-day quota (e.g. "EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier")
// cannot recover within a request's retry window no matter how long we wait — unlike
// a per-minute burst limit, which genuinely can clear in seconds. Gemini's RetryInfo
// hint ("Please retry in 5s") is generic boilerplate and does NOT reflect this
// distinction, so without this check a daily-exhausted quota gets retried for minutes
// before failing anyway. Detect it from the structured QuotaFailure detail instead.
const isDailyQuotaExhausted = (error) => {
  const details = error.response?.data?.error?.details;
  if (!Array.isArray(details)) return false;
  return details.some((d) =>
    d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' &&
    (d.violations || []).some((v) => /PerDay/i.test(v.quotaId || ''))
  );
};

const isRetryableError = (error) => {
  if (isDailyQuotaExhausted(error)) return false;
  const status = error.response?.status;
  const message = JSON.stringify(error.response?.data || error.message).toLowerCase();
  return status === 429 || status === 503 || message.includes('unavailable') ||
    message.includes('high demand') || message.includes('resource_exhausted');
};

const dailyQuotaError = (error) => {
  const metric = error.response?.data?.error?.details
    ?.find((d) => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure')
    ?.violations?.[0]?.quotaMetric || 'a Gemini API';
  return new Error(`Gemini daily quota exhausted (${metric}). This will not recover by retrying — wait for the daily reset or upgrade the API plan.`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Free-tier embedding quota is far stricter (requests/minute) than the text/vision
// endpoints, so embedding calls get their own retry budget and honor the server's
// suggested retry delay instead of a short fixed backoff.
const EMBEDDING_MAX_RETRIES = parseInt(process.env.GEMINI_EMBEDDING_MAX_RETRIES || '6', 10);
const EMBEDDING_BATCH_PACE_MS = parseInt(process.env.GEMINI_EMBEDDING_BATCH_PACE_MS || '7000', 10);

const getRetryDelayMs = (error, fallbackMs) => {
  const message = error.response?.data?.error?.message || error.message || '';
  const match = message.match(/retry in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 1000;
  return fallbackMs;
};

/**
 * Calls Gemini's generateContent endpoint, retrying across the primary and
 * fallback models on transient errors.
 * @param {Array<Object>} parts - Gemini content parts (text and/or inlineData).
 * @returns {Promise<string>}
 */
const callGemini = async (parts, maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS) => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Add it to backend/.env.');
  }

  const modelsToTry = [GEMINI_MODEL];
  if (GEMINI_FALLBACK_MODEL && !modelsToTry.includes(GEMINI_FALLBACK_MODEL)) {
    modelsToTry.push(GEMINI_FALLBACK_MODEL);
  }

  const isInvalidArgument = (error) => error.response?.status === 400 &&
    error.response?.data?.error?.status === 'INVALID_ARGUMENT';

  const postGenerate = (model, includeThinkingConfig) => {
    const generationConfig = { temperature: GEMINI_TEMPERATURE, maxOutputTokens };
    if (includeThinkingConfig) {
      // Deterministic extraction/translation tasks don't benefit from extended
      // reasoning, and thinking tokens would otherwise eat into maxOutputTokens.
      // Not every model accepts this field (e.g. gemini-3.5-flash-lite rejects it
      // with INVALID_ARGUMENT), so callers fall back to omitting it below.
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    return axios.post(
      `${GEMINI_API_BASE}/${model}:generateContent`,
      { contents: [{ parts }], generationConfig },
      { headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' } }
    );
  };

  let lastError;
  for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
    const model = modelsToTry[modelIndex];
    const isLastModel = modelIndex === modelsToTry.length - 1;

    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      try {
        let response;
        try {
          response = await postGenerate(model, true);
        } catch (thinkingError) {
          if (!isInvalidArgument(thinkingError)) throw thinkingError;
          response = await postGenerate(model, false);
        }

        const text = response.data.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
        if (!text) {
          throw new Error('Gemini returned an empty response.');
        }
        return text.trim();
      } catch (error) {
        lastError = error;
        // A model-specific failure (daily quota exhausted for THIS model, a config
        // error THIS model rejects, etc.) shouldn't give up on the whole call if
        // there's still a fallback model to try — only throw once every model has
        // been exhausted. isDailyQuotaExhausted specifically means "this exact
        // error will not clear no matter how long we wait", so skip straight past
        // retries for it, but still let the next model (different quota bucket) try.
        if (!isRetryableError(error)) {
          if (isLastModel) {
            throw isDailyQuotaExhausted(error) ? dailyQuotaError(error) : new Error(`Gemini API error: ${error.response?.data?.error?.message || error.message}`);
          }
          break; // move on to the next model immediately, no point retrying this one
        }
        if (attempt < GEMINI_MAX_RETRIES) {
          await sleep(1500 * (attempt + 1));
        }
      }
    }
  }

  throw isDailyQuotaExhausted(lastError) ? dailyQuotaError(lastError) : new Error(`Gemini API error after retries: ${lastError.response?.data?.error?.message || lastError.message}`);
};

/**
 * Sends a text-only prompt to Gemini.
 * @param {string} prompt
 * @param {number} [maxOutputTokens] - Overrides GEMINI_MAX_OUTPUT_TOKENS for this call.
 * @returns {Promise<string>}
 */
const generateGeminiText = async (prompt, maxOutputTokens) => {
  return callGemini([{ text: prompt }], maxOutputTokens);
};

/**
 * Sends a prompt with one or more base64-encoded images to Gemini for vision tasks.
 * @param {string} prompt
 * @param {Array<string>} imagesBase64 - Base64-encoded image data (no data: URI prefix).
 * @param {string} [mimeType] - Mime type shared by all images.
 * @param {number} [maxOutputTokens] - Overrides GEMINI_MAX_OUTPUT_TOKENS for this call.
 * @returns {Promise<string>}
 */
const generateGeminiVision = async (prompt, imagesBase64, mimeType = 'image/jpeg', maxOutputTokens) => {
  const parts = [
    { text: prompt },
    ...imagesBase64.map((data) => ({ inlineData: { mimeType, data } }))
  ];
  return callGemini(parts, maxOutputTokens);
};

/**
 * Embeds a single text with Gemini. taskType should be 'RETRIEVAL_DOCUMENT' when
 * indexing a corpus and 'RETRIEVAL_QUERY' when embedding a search query — the
 * embedding model is asymmetric and quality drops if these are mixed up.
 * @param {string} text
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<number[]>}
 */
const generateGeminiEmbedding = async (text, taskType = 'RETRIEVAL_QUERY') => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Add it to backend/.env.');
  }

  let lastError;
  for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_BASE}/${GEMINI_EMBEDDING_MODEL}:embedContent`,
        {
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS
        },
        { headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' } }
      );
      const values = response.data.embedding?.values;
      if (!values) throw new Error('Gemini returned no embedding values.');
      return values;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) {
        throw isDailyQuotaExhausted(error) ? dailyQuotaError(error) : new Error(`Gemini embedding error: ${error.response?.data?.error?.message || error.message}`);
      }
      if (attempt < EMBEDDING_MAX_RETRIES) await sleep(getRetryDelayMs(error, 3000 * (attempt + 1)));
    }
  }
  throw isDailyQuotaExhausted(lastError) ? dailyQuotaError(lastError) : new Error(`Gemini embedding error after retries: ${lastError.response?.data?.error?.message || lastError.message}`);
};

/**
 * Embeds many texts in batched batchEmbedContents calls. Returns embeddings in the
 * same order as the input texts.
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @param {(batchVectors: number[][], batchStartIndex: number) => void} [onBatchComplete]
 *   Called after each chunk succeeds, so long-running callers (e.g. embedding an
 *   ~700-document catalog against a daily free-tier quota) can persist progress
 *   incrementally instead of losing everything if a later chunk hits the quota wall.
 * @returns {Promise<number[][]>}
 */
const generateGeminiEmbeddingsBatch = async (texts, taskType = 'RETRIEVAL_DOCUMENT', onBatchComplete) => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Add it to backend/.env.');
  }

  const results = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const requests = batch.map((text) => ({
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS
    }));

    let lastError;
    let done = false;
    for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES && !done; attempt++) {
      try {
        const response = await axios.post(
          `${GEMINI_API_BASE}/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
          { requests },
          { headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' } }
        );
        const embeddings = response.data.embeddings;
        if (!embeddings || embeddings.length !== batch.length) {
          throw new Error('Gemini returned an unexpected number of embeddings.');
        }
        const batchVectors = embeddings.map((e) => e.values);
        results.push(...batchVectors);
        if (onBatchComplete) onBatchComplete(batchVectors, i);
        done = true;
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error)) {
          throw isDailyQuotaExhausted(error) ? dailyQuotaError(error) : new Error(`Gemini batch embedding error: ${error.response?.data?.error?.message || error.message}`);
        }
        if (attempt < EMBEDDING_MAX_RETRIES) await sleep(getRetryDelayMs(error, 3000 * (attempt + 1)));
        else throw isDailyQuotaExhausted(lastError) ? dailyQuotaError(lastError) : new Error(`Gemini batch embedding error after retries: ${lastError.response?.data?.error?.message || lastError.message}`);
      }
    }

    // Proactively pace requests to stay under the free-tier requests/minute quota
    // rather than only reacting to 429s after the fact.
    if (i + EMBEDDING_BATCH_SIZE < texts.length) await sleep(EMBEDDING_BATCH_PACE_MS);
  }
  return results;
};

module.exports = {
  generateGeminiText,
  generateGeminiVision,
  generateGeminiEmbedding,
  generateGeminiEmbeddingsBatch
};
