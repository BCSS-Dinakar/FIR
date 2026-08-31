const { generateText } = require('./aiService');

/**
 * Extracts structured FIR form fields from a translated petition text, grounded
 * strictly in what the text states. Every field is null unless the source text
 * explicitly (or unambiguously) supports it — this function never invents,
 * infers beyond the text, or defaults a field to "today"/"unknown"/etc.
 * @param {string} translatedText - English-translated petition content.
 * @returns {Promise<Object>} Structured field-value pairs matching a subset of the FIR schema.
 */
const extractFirFields = async (translatedText) => {
  const prompt = `You are assisting a police officer by extracting structured First Information Report (FIR) fields from a citizen's petition. Read the petition text below and extract ONLY information that is explicitly stated or unambiguously evident in the text.

CRITICAL RULES:
- Do NOT invent, guess, infer beyond the text, or fill in "typical"/default values for anything not stated.
- If a field is not mentioned in the text, its value MUST be null. Do not write "N/A", "Unknown", or make something up.
- Preserve the original meaning and wording (names, places, amounts) — do not paraphrase facts away or add legal conclusions.
- Dates: only output a date in YYYY-MM-DD format if an absolute calendar date is stated (e.g. "15th March 2026" -> "2026-03-15"). If only a vague/relative reference is given (e.g. "yesterday", "last week") with no absolute date to anchor it in the text, leave the field null — do not guess an absolute date.
- Times: only output HH:MM (24-hour) if a specific time is stated. Otherwise null.
- For each accused person mentioned, create one entry in accusedList. If a person is not named, use the exact descriptive phrase the text uses for them (e.g. "the shopkeeper", "two unknown men") rather than inventing a name — never fabricate a name.
- incidentFacts: a concise, neutral narrative (3-6 sentences) built ONLY from facts explicitly stated in the text. No names/dates/amounts not present in the source. No legal conclusions (do not write "this is theft/assault/etc").

Return ONLY a JSON object, no markdown, no backticks, no explanation, in exactly this shape (use null for anything not stated):
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
${translatedText}`;

  const response = await generateText(prompt, 1500);
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch (e) {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Failed to parse FIR autofill response.');
    parsed = JSON.parse(match[0]);
  }

  // Normalize: drop null/empty accused entries, ensure accusedList is always an array.
  if (Array.isArray(parsed.accusedList)) {
    parsed.accusedList = parsed.accusedList.filter((a) => a && (a.name || a.relative || a.age || a.occupation || a.address));
  } else {
    parsed.accusedList = [];
  }

  return parsed;
};

module.exports = { extractFirFields };
