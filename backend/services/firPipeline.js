const fs = require('fs');
const pdfParse = require('pdf-parse');
const { extractTextFromDocument, generateText } = require('./aiService');
const bnsRagService = require('./bnsRagService');

/**
 * step1 (image): Extract raw text from image via the OCR endpoint.
 * @param {string} filePath - Path to the image file.
 * @param {string} mimeType - Image mime type (e.g. image/jpeg).
 * @returns {Promise<string>}
 */
const extractTextFromImage = async (filePath, mimeType) => {
  const imageBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
  return await extractTextFromDocument(imageBase64, mimeType);
};

/**
 * step1 (pdf): Extract raw text from a PDF file's embedded text layer.
 * Returns an empty string for scanned/image-only PDFs — pdf-parse can only read
 * text that's actually embedded, it doesn't OCR. Use extractTextFromPdfViaOcr
 * as a fallback in that case.
 * @param {string} filePath - Path to the PDF file.
 * @returns {Promise<string>}
 */
const extractTextFromPdf = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  return text;
};

/**
 * step1 (pdf, OCR fallback): Extract text from a scanned/image-based PDF using the
 * dedicated OCR endpoint, which reads PDFs natively (including image-only pages),
 * so no separate PDF-to-image conversion step is needed.
 * @param {string} filePath - Path to the PDF file.
 * @returns {Promise<string>}
 */
const extractTextFromPdfViaOcr = async (filePath) => {
  const pdfBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
  return await extractTextFromDocument(pdfBase64, 'application/pdf');
};

/**
 * step2: Translate petition content to English.
 * @param {string} content - The petition text in any language.
 * @returns {Promise<string>}
 */
const translateToEnglish = async (content) => {
  const prompt = `You are a legal translator. Translate the following Indian police petition into clear, formal English. The petition may be in Telugu, Hindi, Tamil, Kannada, Malayalam, or any other Indian language. Preserve all facts, names, dates, and places exactly as mentioned. Return only the translated English text.

PETITION TEXT:
${content}`;
  return await generateText(prompt, 8192);
};

/**
 * step3: Validate the translated FIR petition against standard rules.
 * @param {string} content - The translated English petition.
 * @returns {Promise<Object>} { valid: true/false, missing_fields: Array, reason: string }
 */
const validateFir = async (content) => {
  const prompt = `You are a legal expert validating an FIR (First Information Report) petition. Analyze the following petition to check if it contains all the necessary details.

Check against the following criteria:
1. Who: Who is the complainant? Who is the victim? Who are the accused/suspects? Who witnessed the incident?
2. What: What exactly happened? What offence was committed? What loss, injury, or damage occurred?
3. When: When did the incident occur (date, time, duration)? When was it discovered?
4. Where: Where did it happen (full address, landmark, online platform, jurisdiction)?
5. Why: Why did it happen (known motive, dispute, revenge, financial gain, harassment, etc.)?
6. How: How was the offence committed? What method, weapon, tool, vehicle, account, or process was used?

A petition is VALID if it reasonably covers the 'Who', 'What', 'When', and 'Where'. If critical information from these 4 categories is missing, it is INVALID. 'Why' and 'How' are helpful but their absence alone does not make it invalid.

Return ONLY a JSON object exactly in this format, with no markdown, no backticks, and no other text:
{
  "valid": true,
  "missing_fields": ["Who", "When", "What", "Where"], // An array of the core missing fields. Empty if valid.
  "reason": "If invalid, concisely state exactly what is missing and must be provided. If valid, state why."
}

PETITION TEXT:
${content}`;

  const response = await generateText(prompt);
  try {
    return JSON.parse(response);
  } catch (error) {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse validation response.');
  }
};

/**
 * Extract key metadata details from translated English petition.
 * BNS sections are NOT guessed here — they come from bnsRagService, which grounds
 * recommendations in the actual BNS Act text instead of asking the model to recall
 * section numbers from memory (a known source of BNS/IPC numbering confusion).
 * @param {string} content - The translated English petition.
 * @returns {Promise<Object>} { complainant, accused }
 */
const extractMetadata = async (content) => {
  const prompt = `Analyze the following English translation of a police petition and extract the key details.

Return ONLY a JSON object exactly in this format, with no markdown, no backticks, and no other text:
{
  "complainant": "Name of complainant (or Unknown)",
  "accused": "Name of accused (or Unknown)"
}

PETITION TEXT:
${content}`;

  try {
    const response = await generateText(prompt);
    try {
      return JSON.parse(response);
    } catch (e) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { complainant: 'Unknown', accused: 'Unknown' };
    }
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return { complainant: 'Unknown', accused: 'Unknown' };
  }
};

/**
 * Main petition pipeline executing up to step 3.
 * @param {Object} file - Multer file object
 * @param {Function} [onStep] - Optional callback for streaming step progress
 * @returns {Promise<Object>} Results of Step 1, 2, and 3
 */
const runPetitionPipeline = async (file, onStep) => {
  const filePath = file.path;
  const mimeType = file.mimetype;

  // Step 1: Scan / Extract text
  console.log(`[Pipeline Step 1] Scanning file content...`);
  if (onStep) onStep({ step: 1, status: 'running', message: 'Scanning file content' });
  
  let rawContent = '';
  if (mimeType.startsWith('image/')) {
    rawContent = await extractTextFromImage(filePath, mimeType);
  } else if (mimeType === 'application/pdf' || file.originalname.endsWith('.pdf')) {
    // Try the embedded text layer first — it's free and instant when present.
    // Both an empty result (scanned/image-only PDF) and a parse failure (malformed
    // or unusual PDF structure) fall through to OCR, which reads the rendered page
    // and so copes with PDFs the text-layer parser can't open at all.
    let parseError = null;
    try {
      rawContent = await extractTextFromPdf(filePath);
    } catch (err) {
      parseError = err;
      rawContent = '';
    }

    if (!rawContent.trim()) {
      const reason = parseError ? `could not be parsed (${parseError.message})` : 'has no embedded text layer';
      console.log(`[Pipeline Step 1] PDF ${reason}; retrying via OCR endpoint...`);
      if (onStep) onStep({ step: 1, status: 'running', message: 'Running OCR on scanned PDF' });
      rawContent = await extractTextFromPdfViaOcr(filePath);
      if (!rawContent.trim()) {
        throw new Error('No text could be extracted from this PDF, even with OCR. Please check the file and try again.');
      }
    }
  } else if (mimeType.startsWith('text/') || mimeType === 'application/octet-stream' || file.originalname.endsWith('.txt')) {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } else {
    throw new Error('Unsupported file type. Please upload a plain text file, an image, or a PDF.');
  }
  
  if (onStep) onStep({ step: 1, status: 'completed', output: rawContent });
  console.log(`[Pipeline Step 1] Completed scanning. Extracted ${rawContent.length} characters.`);

  // Step 2: Translate content to English
  console.log(`[Pipeline Step 2] Translating petition content to English...`);
  if (onStep) onStep({ step: 2, status: 'running', message: 'Translating petition content to English' });
  
  const translated = await translateToEnglish(rawContent);
  
  if (onStep) onStep({ step: 2, status: 'completed', output: translated });
  console.log(`[Pipeline Step 2] Completed translation.`);

  // Step 3: Validate translated petition content
  console.log(`[Pipeline Step 3] Validating petition (BNS check)...`);
  if (onStep) onStep({ step: 3, status: 'running', message: 'Validating petition' });
  
  const validationResult = await validateFir(translated);
  
  if (onStep) onStep({ step: 3, status: 'completed', output: validationResult });
  console.log(`[Pipeline Step 3] Completed validation.`);

  // Additional: Extract metadata details (complainant/accused only)
  console.log(`[Pipeline Step 3] Extracting petition metadata...`);
  const metadata = await extractMetadata(translated);
  console.log(`[Pipeline Step 3] Completed metadata extraction.`);

  // Additional: legal section recommendation (BNS/BNSS/BSA) via grounded retrieval +
  // legal-judge rerank. Skipped when the petition is invalid, matching the pattern in
  // the ChromaDB prototype pipeline (petition/pipelines/firPipeline.js) this was
  // ported from. In practice the reranker's own guardrails mean recommendations are
  // almost always BNS (offence) sections — BNSS/BSA fire only when the facts
  // explicitly narrate a specific procedural or evidentiary event.
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
  // Petition.sections is the "applied/checked" set — only auto-select sections the
  // reranker is highly confident about (>=80%). Sections between the 50% retrieval
  // floor and 80% still show up in Suggested Sections (via sectionRecommendations,
  // the full set), just left unchecked for the officer to review and pick manually.
  // Petition.sections is also read/printed as plain display strings elsewhere (the
  // generated FIR document text, list views), so keep the historical
  // "BNS <num> (<title>)" combined format rather than a bare code.
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
