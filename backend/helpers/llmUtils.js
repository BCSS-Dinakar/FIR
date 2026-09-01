const CORE_MISSING_FIELDS = ['Who', 'What', 'When', 'Where', 'Why', 'How'];

/**
 * Remove model reasoning / thinking blocks (e.g. Qwen3) before parsing output.
 */
const stripModelReasoning = (text) => {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  const removeTaggedBlocks = (open, close) => {
    let idx = cleaned.indexOf(open);
    while (idx !== -1) {
      const end = cleaned.indexOf(close, idx + open.length);
      if (end === -1) {
        cleaned = cleaned.slice(0, idx).trim();
        break;
      }
      cleaned = (cleaned.slice(0, idx) + cleaned.slice(end + close.length)).trim();
      idx = cleaned.indexOf(open);
    }
  };

  const thinkOpen = '<' + 'think' + '>';
  const thinkClose = '</' + 'think' + '>';
  removeTaggedBlocks(thinkOpen, thinkClose);
  removeTaggedBlocks('<think>', '</think>');
  cleaned = cleaned.replace(/```thinking[\s\S]*?```/gi, '');

  return cleaned.trim();
};

/**
 * Normalize petition text before sending to the LLM (whitespace, length, control chars).
 */
const sanitizePetitionText = (text, { maxChars = 48000 } = {}) => {
  if (text == null) return '';
  let normalized = String(text)
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (normalized.length > maxChars) {
    normalized = `${normalized.slice(0, maxChars)}\n\n[TRUNCATED — petition exceeded ${maxChars} characters]`;
  }
  return normalized;
};

const isBlank = (text) => !sanitizePetitionText(text);

/**
 * Extract the first JSON object or array from model output.
 */
const parseJsonFromLlm = (raw, { fallback = null, label = 'LLM JSON' } = {}) => {
  const cleaned = stripModelReasoning(raw);
  if (!cleaned) {
    if (fallback !== null) return fallback;
    throw new Error(`${label}: empty response after cleaning.`);
  }

  const attempts = [cleaned];
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.unshift(fenced[1].trim());
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) attempts.push(objectMatch[0]);
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) attempts.push(arrayMatch[0]);

  const seen = new Set();
  for (const candidate of attempts) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  if (fallback !== null) return fallback;
  throw new Error(`${label}: could not parse JSON from model response.`);
};

const normalizeMissingFields = (fields) => {
  if (!Array.isArray(fields)) return [];
  const allowed = new Set(CORE_MISSING_FIELDS);
  return [...new Set(
    fields
      .map((f) => String(f || '').trim())
      .filter((f) => allowed.has(f))
  )];
};

/**
 * Coerce and validate the 5W+1H validation payload from the model.
 */
const normalizeValidationResult = (parsed, { emptyInput = false } = {}) => {
  if (emptyInput) {
    return {
      valid: false,
      missing_fields: [...CORE_MISSING_FIELDS],
      reason: 'Petition text is empty or unreadable after extraction.'
    };
  }

  let missing_fields = normalizeMissingFields(parsed?.missing_fields);
  let valid = Boolean(parsed?.valid);

  if (missing_fields.length > 0) valid = false;
  if (!valid && missing_fields.length === 0) {
    missing_fields = [...CORE_MISSING_FIELDS];
  }

  const reason = String(parsed?.reason || '').trim()
    || (valid
      ? 'Petition covers Who, What, When, Where, Why, and How.'
      : `Missing required details: ${missing_fields.join(', ')}.`);

  return { valid, missing_fields, reason };
};

const normalizeMetadataResult = (parsed) => {
  const complainant = String(parsed?.complainant || '').trim() || 'Unknown';
  const accused = String(parsed?.accused || '').trim() || 'Unknown';
  return { complainant, accused };
};

const clampConfidence = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
};

const normalizeRerankSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((s) => s && typeof s.code === 'string' && s.code.trim())
    .map((s) => ({
      code: s.code.trim(),
      law: s.law || null,
      title: s.title || '',
      confidence: clampConfidence(s.confidence),
      matchedFacts: Array.isArray(s.matchedFacts)
        ? s.matchedFacts.map((f) => String(f).trim()).filter(Boolean)
        : [],
      reason: String(s.reason || '').trim()
    }))
    .filter((s) => s.confidence >= 0.5);
};

module.exports = {
  CORE_MISSING_FIELDS,
  stripModelReasoning,
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm,
  normalizeMissingFields,
  normalizeValidationResult,
  normalizeMetadataResult,
  clampConfidence,
  normalizeRerankSections
};
