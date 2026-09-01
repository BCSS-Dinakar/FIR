const OpenAI = require('openai');
const { stripModelReasoning } = require('../helpers/llmUtils');

/**
 * Provider-neutral text generation service backed by an OpenAI-compatible vLLM endpoint.
 *
 * Callers depend on generateText(). OCR and embeddings live in separate services.
 */

const VLLM_BASE_URL = process.env.VLLM_BASE_URL;
const VLLM_API_KEY = process.env.VLLM_API_KEY;
const TEXT_MODEL = process.env.VLLM_MODEL || 'qwen3:14b-awq';
const FALLBACK_TEXT_MODEL = process.env.VLLM_FALLBACK_MODEL || '';
const TEMPERATURE = parseFloat(process.env.VLLM_TEMPERATURE || '0.1');
const MAX_OUTPUT_TOKENS = parseInt(process.env.VLLM_MAX_OUTPUT_TOKENS || '800', 10);
const MAX_RETRIES = parseInt(process.env.VLLM_MAX_RETRIES || '3', 10);
const DISABLE_THINKING = process.env.VLLM_DISABLE_THINKING !== 'false';

const SYSTEM_PROMPTS = {
  default: 'You are a precise legal assistant for Indian police petition processing. Follow instructions exactly.',
  plain: 'You are a precise assistant. Output only what is requested. No reasoning, no preamble, no markdown unless asked.',
  json: 'You are a precise assistant. Return ONLY valid JSON exactly as specified. No reasoning, no markdown fences, no commentary, no extra keys.'
};

let client = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getClient = () => {
  if (!VLLM_BASE_URL) {
    throw new Error('VLLM_BASE_URL is missing. Add it to backend/.env.');
  }
  if (!VLLM_API_KEY) {
    throw new Error('VLLM_API_KEY is missing. Add it to backend/.env.');
  }
  if (!client) {
    client = new OpenAI({
      baseURL: VLLM_BASE_URL,
      apiKey: VLLM_API_KEY
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

const retryDelayMs = (error, attempt) => {
  const header = error?.headers?.['retry-after'];
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000 + 500;
  return 1000 * Math.pow(2, attempt);
};

const withRetries = async (label, fn, { failFastOnRateLimit = false } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (failFastOnRateLimit && error?.status === 429) {
        throw new Error(`vLLM ${label} rate limited: ${errorMessage(error)}`);
      }
      if (!isRetryable(error)) throw new Error(`vLLM ${label} error: ${errorMessage(error)}`);
      if (attempt < MAX_RETRIES) await sleep(retryDelayMs(error, attempt));
    }
  }
  throw new Error(`vLLM ${label} error after retries: ${errorMessage(lastError)}`);
};

const buildUserContent = (prompt, options = {}) => {
  if (DISABLE_THINKING && options.mode !== 'json' && !options.jsonMode) {
    return `/no_think\n${prompt}`;
  }
  return prompt;
};

const buildRequestBody = (model, messages, maxTokens, options = {}) => {
  const body = {
    model,
    messages,
    temperature: options.temperature ?? TEMPERATURE,
    max_tokens: maxTokens
  };

  if (DISABLE_THINKING) {
    body.extra_body = { chat_template_kwargs: { enable_thinking: false } };
  }

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  return body;
};

/**
 * Sends a text prompt and returns cleaned completion text.
 * @param {string} prompt
 * @param {number} [maxTokens]
 * @param {{ mode?: 'default'|'plain'|'json', jsonMode?: boolean, temperature?: number }} [options]
 * @returns {Promise<string>}
 */
const generateText = async (prompt, maxTokens = MAX_OUTPUT_TOKENS, options = {}) => {
  const mode = options.mode || (options.jsonMode ? 'json' : 'default');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.default },
    { role: 'user', content: buildUserContent(prompt, options) }
  ];

  const call = (model) => async () => {
    const response = await getClient().chat.completions.create(
      buildRequestBody(model, messages, maxTokens, options)
    );
    const text = response.choices?.[0]?.message?.content;
    if (!text) throw new Error('vLLM returned an empty response.');
    return stripModelReasoning(text);
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

module.exports = {
  generateText
};
