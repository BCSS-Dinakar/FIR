const fs = require('fs');
const pdfParse = require('pdf-parse');
const { generateText } = require('./aiService');
const { extractTextFromDocument } = require('./ocrService');
const bnsRagService = require('./bnsRagService');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm,
  normalizeValidationResult,
  normalizeMetadataResult
} = require('../helpers/llmUtils');

const OCR_PROFILE = process.env.OCR_PROFILE || 'petition';

const extractTextFromImage = async (filePath, mimeType) => {
  const imageBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
  return await extractTextFromDocument(imageBase64, mimeType, { profile: OCR_PROFILE });
};

const extractTextFromPdf = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  return text;
};

const extractTextFromPdfViaOcr = async (filePath) => {
  const pdfBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
  return await extractTextFromDocument(pdfBase64, 'application/pdf', { profile: OCR_PROFILE });
};

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

const validateFir = async (content) => {
  const petition = sanitizePetitionText(content);
  if (isBlank(petition)) {
    return normalizeValidationResult(null, { emptyInput: true });
  }

  const prompt = `TASK: Validate whether this petition has enough factual detail to proceed toward FIR filing.

CHECKLIST (5W + 1H):
1. Who — complainant/victim/accused/witnesses (anonymous descriptions count if specific enough)
2. What — offence conduct, loss, injury, or damage
3. When — date/time or discoverable timeframe (relative phrases like "yesterday" count IF anchored to a calendar context in the text)
4. Where — place, address, landmark, online platform, or jurisdiction
5. Why — motive (optional; absence alone does NOT invalidate)
6. How — method/weapon/tool (optional; absence alone does NOT invalidate)

VALIDITY RULE:
- VALID only if Who, What, When, and Where are each reasonably present in the text.
- INVALID if any of those four is critically missing or too vague to act on (e.g. "somewhere", "recently", "someone" with no role).

EDGE CASES:
- Anonymous complainant is acceptable if other facts are clear.
- Online/cyber incidents: platform/URL/app name can satisfy Where.
- Ongoing or continuing offences: approximate start time is acceptable.
- Multiple incidents: validate on the primary incident described.
- Do NOT invalidate solely because Why or How is missing.

Return ONLY this JSON object (no markdown, no extra keys):
{
  "valid": true,
  "missing_fields": [],
  "reason": "short explanation"
}

missing_fields must contain only zero or more of: "Who", "What", "When", "Where".

PETITION TEXT:
${petition}`;

  const response = await generateText(prompt, 512, { mode: 'json', jsonMode: true });
  const parsed = parseJsonFromLlm(response, {
    fallback: { valid: false, missing_fields: ['Who', 'What', 'When', 'Where'], reason: 'Could not parse validation response.' }
  });
  return normalizeValidationResult(parsed);
};

const extractMetadata = async (content) => {
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

const runPetitionPipeline = async (file, onStep) => {
  const filePath = file.path;
  const mimeType = file.mimetype;

  console.log(`[Pipeline Step 1] Scanning file content...`);
  if (onStep) onStep({ step: 1, status: 'running', message: 'Scanning file content' });

  let rawContent = '';
  if (mimeType.startsWith('image/')) {
    rawContent = await extractTextFromImage(filePath, mimeType);
  } else if (mimeType === 'application/pdf' || file.originalname.endsWith('.pdf')) {
    let parseError = null;
    try {
      rawContent = await extractTextFromPdf(filePath);
    } catch (err) {
      parseError = err;
      rawContent = '';
    }

    if (!sanitizePetitionText(rawContent)) {
      const reason = parseError ? `could not be parsed (${parseError.message})` : 'has no embedded text layer';
      console.log(`[Pipeline Step 1] PDF ${reason}; retrying via OCR endpoint...`);
      if (onStep) onStep({ step: 1, status: 'running', message: 'Running OCR on scanned PDF' });
      rawContent = await extractTextFromPdfViaOcr(filePath);
      if (!sanitizePetitionText(rawContent)) {
        throw new Error('No text could be extracted from this PDF, even with OCR. Please check the file and try again.');
      }
    }
  } else if (mimeType.startsWith('text/') || mimeType === 'application/octet-stream' || file.originalname.endsWith('.txt')) {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } else {
    throw new Error('Unsupported file type. Please upload a plain text file, an image, or a PDF.');
  }

  rawContent = sanitizePetitionText(rawContent);
  if (isBlank(rawContent)) {
    throw new Error('Uploaded file contains no readable text.');
  }

  if (onStep) onStep({ step: 1, status: 'completed', output: rawContent });
  console.log(`[Pipeline Step 1] Completed scanning. Extracted ${rawContent.length} characters.`);

  console.log(`[Pipeline Step 2] Translating petition content to English...`);
  if (onStep) onStep({ step: 2, status: 'running', message: 'Translating petition content to English' });

  const translated = await translateToEnglish(rawContent);

  if (onStep) onStep({ step: 2, status: 'completed', output: translated });
  console.log(`[Pipeline Step 2] Completed translation.`);

  console.log(`[Pipeline Step 3] Validating petition (BNS check)...`);
  if (onStep) onStep({ step: 3, status: 'running', message: 'Validating petition' });

  const validationResult = await validateFir(translated);

  if (onStep) onStep({ step: 3, status: 'completed', output: validationResult });
  console.log(`[Pipeline Step 3] Completed validation.`);

  console.log(`[Pipeline Step 3] Extracting petition metadata...`);
  const metadata = await extractMetadata(translated);
  console.log(`[Pipeline Step 3] Completed metadata extraction.`);

  let sectionRecommendations = [];
  if (validationResult.valid) {
    console.log(`[Pipeline Step 4] Recommending legal sections (RAG)...`);
    try {
      const ragResult = await bnsRagService.recommendSections(translated);
      sectionRecommendations = ragResult.recommendations;
    } catch (error) {
      console.error('Legal section RAG recommendation error:', error.message);
    }
    console.log(`[Pipeline Step 4] Completed. ${sectionRecommendations.length} section(s) recommended.`);
  }

  const AUTO_SELECT_THRESHOLD = 0.8;
  metadata.sections = sectionRecommendations
    .filter((r) => r.confidence >= AUTO_SELECT_THRESHOLD)
    .map((r) => (r.title ? `${r.code} (${r.title})` : r.code));
  metadata.sectionRecommendations = sectionRecommendations;

  return {
    success: true,
    step1Output: rawContent,
    step2Output: translated,
    step3Output: validationResult,
    metadata
  };
};

module.exports = {
  runPetitionPipeline
};
