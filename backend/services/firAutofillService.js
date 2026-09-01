const { generateChat } = require('./aiService');
const {
  augmentSystemPrompt,
  wrapUntrustedBlock
} = require('../helpers/promptGuard');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm
} = require('../helpers/llmUtils');

/**
 * FIR field schema — the single source of truth for LLM extraction.
 *
 * This mirrors ONLY the fields on fir-audit/src/pages/FIRDocument.js that a
 * petition's own text could plausibly state. Deliberately excluded: pure
 * station/procedural fields (district, policeStation, year, firNo/Date/Time,
 * receivedDate/Time, gdEntryNo/DateTime, typeOfInformation, distanceDirection,
 * beatNo, outsideLimitPSName/District, priorToTimePeriod, inquestReport,
 * actionTaken, officerName/Rank/No, refusedInvestigationDueTo,
 * transferredPS/District, dispatchDateTime) — these are decided by the
 * station/officer at filing time, not facts a complainant would narrate, so
 * asking an LLM to fill them would always return null at the cost of tokens.
 *
 * Also excluded: incidentFacts — FIRDocument.js intentionally uses the full
 * officer-verified petition text there, not an AI summary (summarizing a
 * legal document body risks silently dropping facts).
 *
 * Update this file if FIRDocument.js's field list changes.
 */
const COMPLAINANT_FIELDS = {
  complainantName: 'Full name of the complainant/informant filing this petition. Petitions are normally written in the first person, so the complainant is whoever is saying "I submit that..." — usually named right after that "I" (e.g. "I, Ramesh Kumar, S/o ..." or "while I, S. Ashok, SIP, was present"). OCR often mangles that comma, so "I.S. Ashok" / "IS Ashok" means the complainant is "S. Ashok" — take the name and drop the leading "I". A police officer filing a suo-moto report is still the complainant.',
  complainantRelative: 'Father\'s/husband\'s/mother\'s NAME ONLY — no "S/o"/"D/o"/"W/o"/"husband of" prefix (the field label already states the relationship), e.g. "Ramesh" not "S/o Ramesh".',
  complainantDob: 'Date of birth, YYYY-MM-DD, ONLY if an explicit birth date (not age) is stated.',
  complainantAge: 'Age in years, digits only, ONLY if explicitly stated. Never derive from date of birth.',
  complainantNationality: 'Nationality, ONLY if explicitly stated — never assume, never infer from location.',
  complainantCaste: 'Caste/community, ONLY if explicitly stated — never infer from name.',
  complainantPassport: 'Passport number, ONLY if explicitly stated.',
  complainantPassportIssueDate: 'Passport issue date, YYYY-MM-DD, ONLY if explicitly stated.',
  complainantPassportIssuePlace: 'Passport issue place, ONLY if explicitly stated.',
  complainantOccupation: 'Job/profession, ONLY if explicitly stated — never infer from context.',
  complainantMobile: 'Phone/mobile number, digits only, ONLY if explicitly stated.',
  complainantAddress: 'Residential address, ONLY if explicitly stated.'
};

const OCCURRENCE_FIELDS = {
  occurrenceDay: 'Day of week the incident occurred, ONLY if explicitly named (e.g. "Monday").',
  occurrenceDateFrom: 'Date of the PRIMARY incident (the actual subject of this complaint — usually the most serious offence, e.g. the theft/assault itself, not a preceding unrelated event), YYYY-MM-DD. Absolute calendar date only — never infer from "yesterday"/"last week" unless the text anchors it to a specific date.',
  occurrenceTimeFrom: 'Start time of that SAME primary incident, 24h HH:MM, ONLY if explicitly stated for that specific incident — do not reuse a time mentioned for a different incident/date.',
  occurrenceDateTo: 'End date of that SAME primary incident, YYYY-MM-DD, ONLY if the text explicitly describes ONE incident as continuing across multiple dates. If the petition instead narrates two or more separate incidents on different dates, this is null — do not use another incident\'s date here.',
  occurrenceTimeTo: 'End time of that SAME primary incident, 24h HH:MM, ONLY if it explicitly spans a time range. Null if this would just be a different incident\'s time.',
  occurrenceAddress: 'Specific place/address/landmark/platform where the incident occurred, ONLY if stated.'
};

const CASE_FIELDS = {
  reasonsForDelay: 'Reason given for any delay in filing this complaint, ONLY if explicitly stated.',
  propertiesStolen: 'Free-text description of property stolen/damaged/involved (items, quantities), ONLY if stated.',
  totalValueStolen: 'Total monetary value of stolen/damaged property, keep currency/format as written. ONLY if an explicit amount is stated — if property is mentioned but no value is given, this is null. Never write "not specified", "unknown", or similar placeholder text.'
};

const ACCUSED_CORE_FIELDS = {
  name: 'Name if stated, otherwise a short descriptive phrase from the text (e.g. "two unknown men on a motorcycle") — never invent a name.',
  relative: 'Father\'s/husband\'s NAME ONLY, no "S/o"/"D/o"/"W/o" prefix, ONLY if stated.',
  occupation: 'Occupation, ONLY if stated.',
  caste: 'Caste/community, ONLY if stated — never infer from name.',
  gender: '"Male", "Female", or "Transgender" — ONLY if the text makes this clear; never infer from name.',
  age: 'Age in years, digits only, ONLY if stated.',
  nationality: 'Nationality, ONLY if stated.'
};

const ACCUSED_ADDRESS_FIELDS = {
  houseNo: 'House/door number, ONLY if the address is broken down that precisely.',
  street: 'Street/village, ONLY if stated.',
  area: 'Area/mandal, ONLY if stated.',
  city: 'City/district, ONLY if stated.',
  state: 'State, ONLY if stated.',
  pin: 'PIN code, ONLY if stated.',
  phoneOff: 'Office phone, ONLY if stated.',
  phoneResi: 'Residence phone, ONLY if stated.',
  cellNo: 'Mobile/cell number, ONLY if stated.',
  email: 'Email address, ONLY if stated.'
};

const ACCUSED_PHYSICAL_FIELDS = {
  dob: 'Date of birth, ONLY if stated.',
  build: 'Physical build (e.g. "thin", "heavy"), ONLY if stated.',
  height: 'Height, ONLY if stated.',
  complexion: 'Complexion, ONLY if stated.',
  idMarks: 'Identification marks, ONLY if stated.',
  deformities: 'Deformities/peculiarities, ONLY if stated.',
  teeth: 'Notable teeth features, ONLY if stated.',
  hair: 'Hair description, ONLY if stated.',
  eyes: 'Eye description, ONLY if stated.',
  habits: 'Notable habits, ONLY if stated.',
  dressHabits: 'Dress habits, ONLY if stated.',
  languages: 'Languages/dialect spoken, ONLY if stated.',
  burnMark: 'Burn mark location, ONLY if stated.',
  leucoderma: 'Leucoderma location, ONLY if stated.',
  mole: 'Mole location, ONLY if stated.',
  scar: 'Scar location, ONLY if stated.',
  tattoo: 'Tattoo location/description, ONLY if stated.'
};

const ACCUSED_FIELDS = {
  ...ACCUSED_CORE_FIELDS,
  ...ACCUSED_ADDRESS_FIELDS,
  ...ACCUSED_PHYSICAL_FIELDS
};

const SCALAR_FIELD_GROUPS = {
  'Complainant / Informant': COMPLAINANT_FIELDS,
  'Occurrence': OCCURRENCE_FIELDS,
  'Case Details': CASE_FIELDS
};

const SCALAR_FIELD_KEYS = [
  ...Object.keys(COMPLAINANT_FIELDS),
  ...Object.keys(OCCURRENCE_FIELDS),
  ...Object.keys(CASE_FIELDS)
];

const ACCUSED_FIELD_KEYS = Object.keys(ACCUSED_FIELDS);

const FIR_AUTOFILL_SCHEMA = {
  ...Object.fromEntries(SCALAR_FIELD_KEYS.map((k) => [k, null])),
  accusedList: []
};

/** Builds the compact field guide + JSON shape shown to the model. */
const buildFieldGuideText = () => {
  const lines = [];
  for (const [group, fields] of Object.entries(SCALAR_FIELD_GROUPS)) {
    lines.push(`${group}:`);
    for (const [key, desc] of Object.entries(fields)) {
      lines.push(`  ${key}: ${desc}`);
    }
  }
  lines.push('accusedList: one object per distinct accused person/group. Fields per entry:');
  lines.push(`  core: ${Object.keys(ACCUSED_CORE_FIELDS).join(', ')}`);
  lines.push(`  address (only if broken down that precisely): ${Object.keys(ACCUSED_ADDRESS_FIELDS).join(', ')}`);
  lines.push(`  physical description (rare — only if the petition describes appearance): ${Object.keys(ACCUSED_PHYSICAL_FIELDS).join(', ')}`);
  return lines.join('\n');
};

const buildJsonShapeText = () => {
  const scalarShape = Object.fromEntries(SCALAR_FIELD_KEYS.map((k) => [k, null]));
  const accusedShape = Object.fromEntries(ACCUSED_FIELD_KEYS.map((k) => [k, null]));
  return JSON.stringify({ ...scalarShape, accusedList: [accusedShape] }, null, 2);
};

const SYSTEM_PROMPT = augmentSystemPrompt(
  [
    'You extract First Information Report (FIR) fields for Indian police processing from a citizen\'s petition.',
    'The petition text has already been reviewed and approved by the filing officer — treat it as the authoritative source of facts.',
    '',
    'STRICT RULES:',
    '1. Extract ONLY facts explicitly stated or unambiguously supported by the petition text.',
    '2. Never invent, guess, or infer a missing value. Missing scalar field -> null. No accused mentioned -> [].',
    '3. Never infer a date from relative phrases ("yesterday", "last week") unless anchored to a specific calendar date in the text.',
    '4. Never infer: age from date of birth (or vice versa), nationality from location, gender from name, caste from name, occupation from context, or address components not explicitly stated.',
    '5. Never add legal conclusions, opinions, or invented section numbers.',
    '6. Preserve names, addresses, places, phone numbers, and amounts exactly as written in the text.',
    '7. accusedList: only people/groups the text identifies as having committed the offence. Do NOT include witnesses, relatives, or the complainant/victim as accused. If unidentified, use the descriptive phrase from the text as "name" (e.g. "two unknown men") — never invent a name.',
    '8. If the petition narrates more than one distinct incident/date, occurrence fields describe ONLY the primary incident (the actual subject of the complaint) — never blend a date, time, or detail from one incident into another.',
    '9. Return ONLY the JSON object — no markdown fences, no commentary, no keys beyond the shape shown.',
    '',
    'FIELD GUIDE:',
    buildFieldGuideText(),
    '',
    'Return ONLY valid JSON in exactly this shape (values below are placeholders, not real data):',
    buildJsonShapeText()
  ].join('\n')
);

/**
 * Placeholder answers the model sometimes emits instead of null, despite the
 * prompt forbidding them (seen in testing: "Not specified", "None"). Treated
 * as "no value" deterministically rather than trusting prompt compliance —
 * a placeholder string in a legal document reads as a stated fact.
 */
const NULLISH_PLACEHOLDERS = /^(unknown|n\/?a|null|none|nil|not\s+(specified|stated|mentioned|available|provided|given|applicable))\.?$/i;

const nullIfEmpty = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || NULLISH_PLACEHOLDERS.test(s)) return null;
  return s;
};

/** Deterministic validation, not extraction — the LLM understands, this normalizes. */
const normalizeDate = (value) => {
  const s = nullIfEmpty(value);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const normalizeTime = (value) => {
  const s = nullIfEmpty(value);
  if (!s) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
};

const normalizeDigits = (value, { minLen = 1, maxLen = 20 } = {}) => {
  const s = nullIfEmpty(value);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < minLen || digits.length > maxLen) return null;
  return digits;
};

const normalizeGender = (value) => {
  const s = nullIfEmpty(value);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith('m')) return 'Male';
  if (lower.startsWith('f')) return 'Female';
  if (lower.startsWith('t')) return 'Transgender';
  return null;
};

const normalizeAccusedEntry = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const entry = {};
  for (const key of ACCUSED_FIELD_KEYS) {
    if (key === 'gender') {
      entry[key] = normalizeGender(raw[key]);
    } else if (key === 'age') {
      entry[key] = normalizeDigits(raw[key], { minLen: 1, maxLen: 3 });
    } else if (key === 'dob') {
      entry[key] = normalizeDate(raw[key]) || nullIfEmpty(raw[key]);
    } else if (key === 'pin') {
      entry[key] = normalizeDigits(raw[key], { minLen: 4, maxLen: 8 });
    } else {
      entry[key] = nullIfEmpty(raw[key]);
    }
  }
  const hasAnyValue = Object.values(entry).some((v) => v);
  return hasAnyValue ? entry : null;
};

const normalizeAccusedList = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizeAccusedEntry)
    .filter(Boolean)
    .slice(0, 25); // sane upper bound; guards against a degenerate/looping response
};

const normalizeAutofillResult = (parsed) => {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const out = { ...FIR_AUTOFILL_SCHEMA };

  for (const key of Object.keys(COMPLAINANT_FIELDS)) {
    if (key === 'complainantAge') {
      out[key] = normalizeDigits(source[key], { minLen: 1, maxLen: 3 });
    } else if (key === 'complainantMobile') {
      out[key] = normalizeDigits(source[key], { minLen: 7, maxLen: 15 });
    } else if (key === 'complainantDob' || key === 'complainantPassportIssueDate') {
      out[key] = normalizeDate(source[key]) || nullIfEmpty(source[key]);
    } else {
      out[key] = nullIfEmpty(source[key]);
    }
  }

  for (const key of Object.keys(OCCURRENCE_FIELDS)) {
    if (key === 'occurrenceDateFrom' || key === 'occurrenceDateTo') {
      out[key] = normalizeDate(source[key]);
    } else if (key === 'occurrenceTimeFrom' || key === 'occurrenceTimeTo') {
      out[key] = normalizeTime(source[key]);
    } else {
      out[key] = nullIfEmpty(source[key]);
    }
  }

  for (const key of Object.keys(CASE_FIELDS)) {
    out[key] = nullIfEmpty(source[key]);
  }

  out.accusedList = normalizeAccusedList(source.accusedList);
  return out;
};

/**
 * Extracts structured FIR form fields from the officer-verified petition text
 * (Petition.step2Output) in a single LLM call, then deterministically
 * validates/normalizes the result against the FIR schema above.
 */
const extractFirFields = async (verifiedText) => {
  const petition = sanitizePetitionText(verifiedText, { maxChars: 32000 });
  if (isBlank(petition)) {
    return { ...FIR_AUTOFILL_SCHEMA };
  }

  const userPrompt = `Extract FIR fields from this officer-verified petition.\n${wrapUntrustedBlock(petition, 'PETITION')}`;

  try {
    const response = await generateChat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 2500,
      options: { mode: 'json', jsonMode: true }
    });
    const parsed = parseJsonFromLlm(response, { fallback: {}, label: 'FIR autofill' });
    return normalizeAutofillResult(parsed);
  } catch (error) {
    console.error('FIR autofill extraction error:', error.message);
    return { ...FIR_AUTOFILL_SCHEMA };
  }
};

module.exports = { extractFirFields, FIR_AUTOFILL_SCHEMA };
