/**
 * 5W+1H extraction — CopWriter-style pipeline:
 *   1. EXTRACT  — LLM fills structured fields (system/user separation)
 *   2. VALIDATE — deterministic rules; failures trigger targeted re-extract
 *   3. DERIVE   — valid / missing_fields computed in JS, not by the model
 *
 * Adapted from AI-CopWriter backend/fir_audit.py (read-only reference).
 */

const { generateChat } = require('./aiService');
const {
  augmentSystemPrompt,
  wrapUntrustedBlock,
  sanitizeLlmDict,
  prepareUntrustedText
} = require('../helpers/promptGuard');
const {
  CORE_MISSING_FIELDS,
  parseJsonFromLlm,
  sanitizePetitionText,
  isBlank
} = require('../helpers/llmUtils');

const UNKNOWN_ACCUSED = 'Unknown Accused';
const COMPLAINANT_IS_VICTIM = 'Complainant/Victim';

/** Internal extraction keys returned by the LLM. */
const EXTRACTION_KEYS = [
  'who',
  'what',
  'when',
  'where',
  'why',
  'how',
  'complainantName',
  'accusedName',
  'victimName',
  'incidentTime'
];

/** Map internal key → blocker label shown in the UI. */
const KEY_TO_BLOCKER = {
  who: 'Who',
  what: 'What',
  when: 'When',
  where: 'Where',
  why: 'Why',
  how: 'How'
};

const FIELD_LABELS = {
  who: 'Who (parties involved)',
  what: 'What (nature of offence)',
  when: 'When (date/time of incident)',
  where: 'Where (place of occurrence)',
  why: 'Why (motive/reason)',
  how: 'How (modus operandi)',
  complainantName: 'Complainant Name',
  accusedName: 'Accused Name',
  victimName: 'Victim Name',
  incidentTime: 'Time of Incident'
};

const NULLISH = new Set([
  '',
  'n/a',
  'na',
  'none',
  'null',
  'not mentioned',
  'not specified',
  'unknown',
  'not available',
  'nil',
  '-',
  'not stated',
  'no'
]);

const SECTION_PATTERN =
  /\b(ipc|bns|bnss|crpc|cr\.?p\.?c|sec(?:tion)?\.?|u\/s|under section)\b\s*\.?\s*\d+|\bsection\s+\d+|\b\d{2,3}\s*(?:ipc|bns)\b/i;

const wordCount = (text) =>
  String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const buildExtractionSystem = (currentYear) =>
  augmentSystemPrompt(
    [
      'You are the Lead Investigative & Procedural Auditor (IPA) for a police department.',
      'Extract structured 5W+1H facts from the criminal complaint in the user message for FIR registration.',
      'Use ONLY facts present in the complaint — never invent details or add legal advice.',
      '',
      'Return a JSON object with EXACTLY these keys (all values must be strings; use "" when genuinely absent):',
      '',
      '"who" [WHO — parties involved]:',
      '  Complainant, victim, accused, and/or witnesses as stated.',
      '  Include anonymous/unidentified descriptions (e.g. "two men on a motorcycle", "unknown person").',
      `  If accused is unidentified, set accusedName to exactly "${UNKNOWN_ACCUSED}" — never leave accusedName empty.`,
      '',
      '"what" [WHAT — the incident]:',
      '  One plain sentence describing WHAT ACTUALLY HAPPENED — conduct, loss, injury, or damage.',
      '  CRITICAL: Never put IPC/BNS/CrPC section numbers here — describe events, not law.',
      '  GOOD: "The accused snatched the complainant\'s mobile phone and fled on a motorcycle."',
      '  BAD: "IPC 302", "BNS 303", "Section 379 theft".',
      '',
      '"when" [WHEN — date/time]:',
      '  Date and/or time of the incident as stated (e.g. "15 March 2026 at 9 PM", "2026-03-15").',
      `  If no year is stated, assume ${currentYear}. Relative phrases count if anchored ("yesterday" with context).`,
      '',
      '"where" [WHERE]:',
      '  Specific place, address, landmark, platform, or jurisdiction where the incident occurred.',
      '',
      '"why" [WHY — motive]:',
      '  Reason or motive. Capture hedged motives — "I believe", "I suspect", "may be due to" all count.',
      '',
      '"how" [HOW — modus operandi]:',
      '  Step-by-step account of HOW the incident unfolded: actions, method, weapon, tool, or vehicle.',
      '  2 to 4 sentences focusing on ACTIONS, not motive.',
      '',
      '"complainantName": person making the complaint; "" if absent.',
      `"victimName": harmed person; if complainant IS the victim use exactly "${COMPLAINANT_IS_VICTIM}".`,
      `"accusedName": offender name(s); MUST be "${UNKNOWN_ACCUSED}" when unidentified — never "".`,
      '"incidentTime": time portion only if separately stated (e.g. "9 PM"); "" if rolled into when.',
      '',
      'STRICT RULES:',
      '1. Return ONLY the JSON object — no markdown, no code fences, no commentary.',
      '2. Never invent facts.',
      '3. Keep proper nouns exactly as written.',
      `4. accusedName must never be "" — use "${UNKNOWN_ACCUSED}" when unidentified.`
    ].join('\n')
  );

const buildExtractionUser = (text) =>
  `Extract 5W+1H structured fields from this complaint.\n${wrapUntrustedBlock(text, 'COMPLAINT')}`;

const buildReextractionSystem = (issues) => {
  const lines = Object.entries(issues).map(
    ([key, reason]) => `  "${key}" (${FIELD_LABELS[key] || key}) — failed because: ${reason}`
  );
  return augmentSystemPrompt(
    [
      'You are re-checking a police complaint audit. A first pass produced unusable values for the fields below.',
      'Read the complaint in the user message again CAREFULLY and extract ONLY the listed fields.',
      '',
      'FIELDS TO RE-EXTRACT:',
      ...lines,
      '',
      'GUIDANCE:',
      '  - what must describe the INCIDENT in plain words, never a legal section number.',
      `  - accusedName must be "${UNKNOWN_ACCUSED}" when the offender is unidentified — never empty.`,
      `  - victimName must be "${COMPLAINANT_IS_VICTIM}" when the complainant is the victim.`,
      '  - why counts even when hedged ("I believe", "I suspect").',
      '  - how must be a sequential account of actions, at least 2 sentences.',
      '  - Search the whole complaint again before concluding a fact is truly absent.',
      '',
      'Return ONLY a JSON object containing exactly the keys listed above, all values strings.'
    ].join('\n')
  );
};

const buildReextractionUser = (text) =>
  `Re-extract the failing 5W+1H fields from this complaint.\n${wrapUntrustedBlock(text, 'COMPLAINT')}`;

const normaliseFields = (raw) => {
  const data = sanitizeLlmDict(raw || {}, EXTRACTION_KEYS);
  for (const key of EXTRACTION_KEYS) {
    if (NULLISH.has(data[key].toLowerCase())) {
      data[key] = '';
    }
  }
  return data;
};

const isEmptyField = (value) => {
  const s = String(value || '').trim();
  return !s || s === '[object Object]' || NULLISH.has(s.toLowerCase());
};

const applyFallbacks = (data) => {
  const out = { ...data };
  if (!out.accusedName) {
    out.accusedName = UNKNOWN_ACCUSED;
  }
  if (!out.victimName && out.complainantName) {
    out.victimName = COMPLAINANT_IS_VICTIM;
  } else if (
    out.victimName &&
    out.complainantName &&
    out.victimName.toLowerCase() === out.complainantName.toLowerCase()
  ) {
    out.victimName = COMPLAINANT_IS_VICTIM;
  }
  const partyParts = [out.complainantName, out.victimName, out.accusedName]
    .filter((p) => p && !isEmptyField(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);
  if (partyParts.length) {
    out.who = partyParts.join('; ');
  } else if (isEmptyField(out.who) && out.accusedName) {
    out.who = out.accusedName;
  }
  return out;
};

/**
 * Deterministic validation — returns { internalKey: reason } for fields needing re-extract.
 */
const validateFields = (data) => {
  const issues = {};

  const what = data.what || '';
  if (!what) {
    issues.what = 'field was empty';
  } else if (SECTION_PATTERN.test(what)) {
    issues.what = 'it contained a legal section instead of describing the incident';
  } else if (wordCount(what) < 3) {
    issues.what = 'too short to describe the offence';
  }

  const who = data.who || '';
  if (isEmptyField(who) && isEmptyField(data.accusedName) && isEmptyField(data.complainantName)) {
    issues.who = 'no parties identified';
  }

  if (!data.when) {
    issues.when = 'no date or time of incident found';
  }

  if (!data.where) {
    issues.where = 'no place of occurrence found';
  }

  if (!data.why) {
    issues.why = 'no reason/motive found — hedged motives ("I suspect") also count';
  }

  const how = data.how || '';
  if (!how) {
    issues.how = 'no modus operandi found';
  } else if (wordCount(how) < 8) {
    issues.how = 'too brief — needs a sequential account of the accused\'s actions';
  }

  return issues;
};

const mergeRetry = (base, retry, targetKeys) => {
  const merged = { ...base };
  const clean = normaliseFields(retry);
  for (const key of targetKeys) {
    const newVal = clean[key];
    if (!newVal) continue;
    if (key === 'what' && SECTION_PATTERN.test(newVal)) continue;
    merged[key] = newVal;
  }
  return merged;
};

const issuesToMissingFields = (issues) =>
  [...new Set(Object.keys(issues).map((k) => KEY_TO_BLOCKER[k]).filter(Boolean))].sort(
    (a, b) => CORE_MISSING_FIELDS.indexOf(a) - CORE_MISSING_FIELDS.indexOf(b)
  );

const callExtractLlm = async (system, user) => {
  const raw = await generateChat({
    system,
    user,
    maxTokens: 1200,
    mode: 'json',
    jsonMode: true
  });
  return parseJsonFromLlm(raw, { fallback: {}, label: '5W+1H extract' });
};

/**
 * CopWriter-style canonical extract + validate + optional re-extract.
 * @returns {{ fields, reExtracted, initialIssues }}
 */
const canonicalExtract = async (text) => {
  const safeText = prepareUntrustedText(sanitizePetitionText(text));
  const year = new Date().getFullYear();

  const firstRaw = await callExtractLlm(buildExtractionSystem(year), buildExtractionUser(safeText));
  let data = applyFallbacks(normaliseFields(firstRaw));
  let issues = validateFields(data);
  let reExtracted = false;

  if (Object.keys(issues).length > 0) {
    reExtracted = true;
    const retryRaw = await callExtractLlm(
      buildReextractionSystem(issues),
      buildReextractionUser(safeText)
    );
    data = applyFallbacks(mergeRetry(data, retryRaw, Object.keys(issues)));
    issues = validateFields(data);
  }

  return { fields: data, reExtracted, initialIssues: issues };
};

/**
 * Derive pipeline validation result from extracted fields.
 */
const buildValidationResult = ({ fields, reExtracted, initialIssues, emptyInput = false }) => {
  if (emptyInput) {
    return {
      valid: false,
      missing_fields: [...CORE_MISSING_FIELDS],
      reason: 'Petition text is empty or unreadable after extraction.',
      fields: {},
      reExtracted: false
    };
  }

  const issues = validateFields(fields);
  const missing_fields = issuesToMissingFields(issues);
  const valid = missing_fields.length === 0;

  const reason = valid
    ? 'Petition covers Who, What, When, Where, Why, and How.'
    : missing_fields.length
      ? `Missing required details: ${missing_fields.join(', ')}.`
      : 'Could not establish all 5W+1H elements from the petition.';

  return {
    valid,
    missing_fields,
    reason,
    fields,
    reExtracted,
    initialIssues: Object.keys(initialIssues || {})
  };
};

/**
 * Full 5W+1H audit for a translated petition (replaces boolean validateFir).
 */
const extractAndValidate5W1H = async (content) => {
  const petition = sanitizePetitionText(content);
  if (isBlank(petition)) {
    return buildValidationResult({ emptyInput: true });
  }

  try {
    const extracted = await canonicalExtract(petition);
    return buildValidationResult(extracted);
  } catch (error) {
    console.error('[fiveWOneHService] extraction failed:', error.message);
    return {
      valid: false,
      missing_fields: [...CORE_MISSING_FIELDS],
      reason: `5W+1H extraction failed: ${error.message}`,
      fields: {},
      reExtracted: false
    };
  }
};

/** Pull complainant/accused for metadata from extracted fields. */
const partiesFromFields = (fields = {}) => ({
  complainant: fields.complainantName?.trim() || 'Unknown',
  accused: fields.accusedName?.trim() || fields.who?.trim() || UNKNOWN_ACCUSED
});

module.exports = {
  extractAndValidate5W1H,
  canonicalExtract,
  validateFields,
  partiesFromFields,
  UNKNOWN_ACCUSED,
  COMPLAINANT_IS_VICTIM
};
