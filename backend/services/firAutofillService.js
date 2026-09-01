const { generateText } = require('./aiService');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm
} = require('../helpers/llmUtils');

const FIR_AUTOFILL_SCHEMA = {
  occurrenceDateFrom: null,
  occurrenceTimeFrom: null,
  occurrenceDateTo: null,
  occurrenceTimeTo: null,
  occurrenceAddress: null,
  outsideLimitPSName: null,
  outsideLimitDistrict: null,
  complainantName: null,
  complainantRelative: null,
  complainantDob: null,
  complainantAge: null,
  complainantNationality: null,
  complainantCaste: null,
  complainantOccupation: null,
  complainantMobile: null,
  complainantAddress: null,
  accusedList: [],
  reasonsForDelay: null,
  propertiesStolen: null,
  totalValueStolen: null,
  incidentFacts: null
};

const nullIfEmpty = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || /^unknown$/i.test(s) || /^n\/a$/i.test(s)) return null;
  return s;
};

const normalizeAccusedList = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => ({
      name: nullIfEmpty(a?.name),
      relative: nullIfEmpty(a?.relative),
      age: nullIfEmpty(a?.age),
      occupation: nullIfEmpty(a?.occupation),
      address: nullIfEmpty(a?.address)
    }))
    .filter((a) => a.name || a.relative || a.age || a.occupation || a.address);
};

const normalizeAutofillResult = (parsed) => {
  const out = { ...FIR_AUTOFILL_SCHEMA, ...(parsed || {}) };
  for (const key of Object.keys(FIR_AUTOFILL_SCHEMA)) {
    if (key === 'accusedList' || key === 'incidentFacts') continue;
    out[key] = nullIfEmpty(out[key]);
  }
  out.accusedList = normalizeAccusedList(out.accusedList);
  out.incidentFacts = nullIfEmpty(out.incidentFacts);
  return out;
};

/**
 * Extracts structured FIR form fields from translated petition text.
 */
const extractFirFields = async (translatedText) => {
  const petition = sanitizePetitionText(translatedText, { maxChars: 32000 });
  if (isBlank(petition)) {
    return { ...FIR_AUTOFILL_SCHEMA };
  }

  const prompt = `TASK: Extract FIR form fields from the petition. Use ONLY explicitly stated facts.

RULES:
- Do NOT invent, guess, or use placeholder text. Use null for anything not stated.
- Do NOT write "Unknown", "N/A", or default dates/times.
- Dates: YYYY-MM-DD only when an absolute calendar date is stated.
- Times: HH:MM (24h) only when a specific time is stated.
- Relative time ("yesterday", "last week") → null unless an absolute anchor date exists in the text.
- Mobile: digits only if a phone number is stated.
- accusedList: one object per accused; use descriptive phrase if unnamed (e.g. "two unknown men").
- incidentFacts: 3–6 neutral sentences from stated facts only; no legal conclusions.
- Multiple properties/amounts: include all stated items in propertiesStolen / totalValueStolen.
- Cyber incidents: occurrenceAddress may be an online platform/app/URL if stated.

Return ONLY JSON matching this shape (null for unstated fields):
{
  "occurrenceDateFrom": null,
  "occurrenceTimeFrom": null,
  "occurrenceDateTo": null,
  "occurrenceTimeTo": null,
  "occurrenceAddress": null,
  "outsideLimitPSName": null,
  "outsideLimitDistrict": null,
  "complainantName": null,
  "complainantRelative": null,
  "complainantDob": null,
  "complainantAge": null,
  "complainantNationality": null,
  "complainantCaste": null,
  "complainantOccupation": null,
  "complainantMobile": null,
  "complainantAddress": null,
  "accusedList": [
    { "name": null, "relative": null, "age": null, "occupation": null, "address": null }
  ],
  "reasonsForDelay": null,
  "propertiesStolen": null,
  "totalValueStolen": null,
  "incidentFacts": null
}

PETITION TEXT:
${petition}`;

  const response = await generateText(prompt, 1800, { mode: 'json', jsonMode: true });
  const parsed = parseJsonFromLlm(response, { fallback: FIR_AUTOFILL_SCHEMA, label: 'FIR autofill' });
  return normalizeAutofillResult(parsed);
};

module.exports = { extractFirFields };
