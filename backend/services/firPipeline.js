const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { generateText } = require('./aiService');
const { extractTextFromDocument, extractTextFromFilePath } = require('./ocrService');
const bnsRagService = require('./bnsRagService');
const { extractAndValidate5W1H, partiesFromFields } = require('./fiveWOneHService');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm,
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

const extractTextFromPdfViaOcr = async (filePath, originalname) =>
  extractTextFromFilePath(filePath, 'application/pdf', {
    profile: OCR_PROFILE,
    filename: ensureExtension(originalname || path.basename(filePath), '.pdf')
  });

const extractTextFromWord = async (filePath, mimeType, originalname) =>
  extractTextFromFilePath(filePath, mimeType, {
    profile: OCR_PROFILE,
    filename: originalname || path.basename(filePath)
  });

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
      rawContent = await extractTextFromPdfViaOcr(filePath, file.originalname);
      if (!sanitizePetitionText(rawContent)) {
        throw new Error('No text could be extracted from this PDF, even with OCR. Please check the file and try again.');
      }
    }
  } else if (mimeType.startsWith('text/') || mimeType === 'application/octet-stream' || file.originalname.endsWith('.txt')) {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } else if (
    mimeType.includes('wordprocessingml')
    || mimeType === 'application/msword'
    || file.originalname.endsWith('.docx')
    || file.originalname.endsWith('.doc')
  ) {
    console.log(`[Pipeline Step 1] Extracting text from Word document via OCR gateway...`);
    if (onStep) onStep({ step: 1, status: 'running', message: 'Extracting text from Word document' });
    rawContent = await extractTextFromWord(filePath, mimeType, file.originalname);
  } else {
    throw new Error(
      'Unsupported file type. Please upload a plain text file, an image, a PDF, or a Word document (.docx/.doc).'
    );
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

  console.log(`[Pipeline Step 3] Extracting & validating 5W+1H...`);
  if (onStep) onStep({ step: 3, status: 'running', message: 'Extracting and validating 5W+1H' });

  const validationResult = await extractAndValidate5W1H(translated);

  if (onStep) onStep({ step: 3, status: 'completed', output: validationResult });
  console.log(
    `[Pipeline Step 3] Completed 5W+1H validation. valid=${validationResult.valid}` +
      (validationResult.reExtracted ? ' (re-extracted)' : '')
  );

  console.log(`[Pipeline Step 3] Building petition metadata...`);
  const parties = partiesFromFields(validationResult.fields);
  let metadata = await extractMetadata(translated, parties);
  metadata.fiveW1H = validationResult.fields || {};
  if (validationResult.fields?.when) metadata.incidentDate = validationResult.fields.when;
  if (validationResult.fields?.incidentTime) metadata.incidentTime = validationResult.fields.incidentTime;
  if (validationResult.fields?.where) metadata.occurrencePlace = validationResult.fields.where;
  if (validationResult.fields?.what) metadata.incidentFacts = validationResult.fields.what;
  console.log(`[Pipeline Step 3] Completed metadata.`);

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
