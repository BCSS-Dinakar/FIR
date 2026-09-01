const { generateText } = require('./aiService');
const { extractPetitionTextFromUpload } = require('./documentExtractionService');
const bnsRagService = require('./bnsRagService');
const { extractAndValidate5W1H, partiesFromFields } = require('./fiveWOneHService');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm,
  normalizeMetadataResult
} = require('../helpers/llmUtils');


const AUTO_SELECT_THRESHOLD = 0.8;

const translateToEnglish = async (content) => {
  const petition = sanitizePetitionText(content);
  if (isBlank(petition)) {
    throw new Error('No readable petition text found to translate.');
  }

  const prompt = `TASK: Translate the petition below into clear, formal English for police/FIR processing.

EDGE CASES — handle correctly:
- If the text is ALREADY in clear formal English, return it unchanged (minor grammar fixes only).
- If multiple Indian languages are mixed, translate all non-English parts; keep English parts as-is.
- Preserve ALL proper nouns, place names, dates, times, amounts, phone numbers, and section references EXACTLY.
- Do NOT summarize, omit facts, add facts, or add legal conclusions.
- If OCR noise or garbled characters appear, translate only the readable portions; do not invent missing words.
- If the complainant is anonymous ("unknown person", "a woman", etc.), keep that wording.
- Output ONLY the translated petition body — no headings like "Translation:" and no commentary.

PETITION TEXT:
${petition}`;

  const translated = await generateText(prompt, 8192, { mode: 'plain' });
  const cleaned = sanitizePetitionText(translated, { maxChars: 50000 });
  if (isBlank(cleaned)) {
    throw new Error('Translation produced empty output. The source text may be unreadable.');
  }
  return cleaned;
};

const extractMetadata = async (content, partiesFrom5W1H = null) => {
  if (partiesFrom5W1H) {
    return normalizeMetadataResult(partiesFrom5W1H);
  }

  const petition = sanitizePetitionText(content);
  if (isBlank(petition)) {
    return { complainant: 'Unknown', accused: 'Unknown' };
  }

  const prompt = `TASK: Extract complainant and accused names from the petition.

RULES:
- Use explicit names when stated.
- If only a role/description exists (e.g. "the shopkeeper", "two unknown men"), use that exact phrase.
- If multiple accused are named, join with "; " (semicolon-separated).
- If not mentioned, use "Unknown".
- Do NOT invent names.

Return ONLY JSON:
{
  "complainant": "string",
  "accused": "string"
}

PETITION TEXT:
${petition}`;

  try {
    const response = await generateText(prompt, 256, { mode: 'json', jsonMode: true });
    const parsed = parseJsonFromLlm(response, { fallback: { complainant: 'Unknown', accused: 'Unknown' } });
    return normalizeMetadataResult(parsed);
  } catch (error) {
    console.error('Metadata extraction error:', error.message);
    return { complainant: 'Unknown', accused: 'Unknown' };
  }
};

const extractRawContentFromFile = async (file) => extractPetitionTextFromUpload(file);

const buildMetadataFromValidation = async (translated, validationResult) => {
  const parties = partiesFromFields(validationResult.fields);
  let metadata = await extractMetadata(translated, parties);
  metadata.fiveW1H = validationResult.fields || {};
  if (validationResult.fields?.when) metadata.incidentDate = validationResult.fields.when;
  if (validationResult.fields?.incidentTime) metadata.incidentTime = validationResult.fields.incidentTime;
  if (validationResult.fields?.where) metadata.occurrencePlace = validationResult.fields.where;
  if (validationResult.fields?.what) metadata.incidentFacts = validationResult.fields.what;
  return metadata;
};

const attachSectionRecommendations = async (translated, validationResult, metadata) => {
  let sectionRecommendations = [];
  if (validationResult.valid) {
    console.log(`[Pipeline Step 4] Recommending legal sections (RAG)...`);
    try {
      const ragResult = await bnsRagService.recommendSections(translated);
      sectionRecommendations = ragResult.recommendations;
    } catch (error) {
      console.error('[Pipeline Step 4] Legal section RAG recommendation error:', error.message);
    }
    console.log(`[Pipeline Step 4] RAG completed. ${sectionRecommendations.length} section(s) recommended.`);
  } else {
    console.log(
      `[Pipeline Step 4] Skipping RAG — petition invalid (missing: ${(validationResult.missing_fields || []).join(', ') || 'unknown'}).`
    );
  }

  metadata.sections = sectionRecommendations
    .filter((r) => r.confidence >= AUTO_SELECT_THRESHOLD)
    .map((r) => (r.title ? `${r.code} (${r.title})` : r.code));
  metadata.sectionRecommendations = sectionRecommendations;
  console.log(
    `[Pipeline Step 4] Auto-selected ${metadata.sections.length} section(s) ` +
      `(confidence ≥ ${AUTO_SELECT_THRESHOLD}).`
  );
  return metadata;
};

/** Step 1 — OCR / text extraction (officer review before translation). */
const runPipelineStep1 = async (file) => {
  console.log(`[Pipeline Step 1] Scanning file content...`);
  const step1Output = await extractRawContentFromFile(file);
  console.log(`[Pipeline Step 1] Completed scanning. Extracted ${step1Output.length} characters.`);
  return { step1Output };
};

/** Step 2 — English translation (officer review before 5W+1H). */
const runPipelineStep2 = async (step1Output) => {
  console.log(`[Pipeline Step 2] Translating petition content to English...`);
  const step2Output = await translateToEnglish(step1Output);
  console.log(`[Pipeline Step 2] Completed translation.`);
  return { step2Output };
};

/** Step 3 — 5W+1H extraction + metadata (officer review before RAG/save). */
const runPipelineStep3 = async (step2Output) => {
  console.log(`[Pipeline Step 3] Extracting & validating 5W+1H...`);
  const step3Output = await extractAndValidate5W1H(step2Output);
  console.log(
    `[Pipeline Step 3] Completed 5W+1H validation. valid=${step3Output.valid}` +
      (step3Output.reExtracted ? ' (re-extracted)' : '')
  );

  console.log(`[Pipeline Step 3] Building petition metadata...`);
  const metadata = await buildMetadataFromValidation(step2Output, step3Output);
  console.log(`[Pipeline Step 3] Completed metadata.`);
  return { step3Output, metadata };
};

/** Step 4 — RAG section recommendations (runs after officer approves step 3). */
const runPipelineStep4 = async (step2Output, step3Output, metadata) => {
  console.log(`[Pipeline Step 4] Finalize — RAG + metadata enrichment...`);
  const enriched = await attachSectionRecommendations(step2Output, step3Output, { ...metadata });
  console.log(`[Pipeline Step 4] Completed finalize enrichment.`);
  return { metadata: enriched };
};

/** Full auto pipeline — used by verify script and legacy clients. */
const runPetitionPipeline = async (file, onStep) => {
  if (onStep) onStep({ step: 1, status: 'running', message: 'Scanning file content' });
  const { step1Output } = await runPipelineStep1(file);
  if (onStep) onStep({ step: 1, status: 'completed', output: step1Output });

  if (onStep) onStep({ step: 2, status: 'running', message: 'Translating petition content to English' });
  const { step2Output } = await runPipelineStep2(step1Output);
  if (onStep) onStep({ step: 2, status: 'completed', output: step2Output });

  if (onStep) onStep({ step: 3, status: 'running', message: 'Extracting and validating 5W+1H' });
  const { step3Output, metadata: baseMetadata } = await runPipelineStep3(step2Output);
  if (onStep) onStep({ step: 3, status: 'completed', output: step3Output });

  const { metadata } = await runPipelineStep4(step2Output, step3Output, baseMetadata);

  return {
    success: true,
    step1Output,
    step2Output,
    step3Output,
    metadata
  };
};

module.exports = {
  runPetitionPipeline,
  runPipelineStep1,
  runPipelineStep2,
  runPipelineStep3,
  runPipelineStep4
};
