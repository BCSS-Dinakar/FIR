const fs = require('fs');
const { generateOllamaVision, generateOllamaText } = require('./ollamaService');

/**
 * step1 (image): Extract raw text from image.
 * @param {string} filePath - Path to the image file.
 * @returns {Promise<string>}
 */
const extractTextFromImage = async (filePath) => {
  const imageBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
  const extractPrompt = "Extract all text from this Indian police petition or FIR document image. Return only the extracted text exactly as it appears, preserving language and formatting. Do not translate, summarize, or modify anything.";
  return await generateOllamaVision(extractPrompt, [imageBase64], 'llava');
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
  return await generateOllamaText(prompt, 'llama3.2');
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

  const response = await generateOllamaText(prompt, 'llama3.2');
  try {
    return JSON.parse(response);
  } catch (error) {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse validation response from Ollama.');
  }
};

/**
 * Extract key metadata details from translated English petition.
 * @param {string} content - The translated English petition.
 * @returns {Promise<Object>} { complainant, accused, sections }
 */
const extractMetadata = async (content) => {
  const prompt = `Analyze the following English translation of a police petition and extract the key details.

Return ONLY a JSON object exactly in this format, with no markdown, no backticks, and no other text:
{
  "complainant": "Name of complainant (or Unknown)",
  "accused": "Name of accused (or Unknown)",
  "sections": ["BNS 303 (Theft)", "BNS 318 (Cheating)"] // list any BNS/IPC sections mentioned in the text, otherwise guess 1-2 relevant BNS sections or leave empty
}

PETITION TEXT:
${content}`;

  try {
    const response = await generateOllamaText(prompt, 'llama3.2');
    try {
      return JSON.parse(response);
    } catch (e) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { complainant: 'Unknown', accused: 'Unknown', sections: [] };
    }
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return { complainant: 'Unknown', accused: 'Unknown', sections: [] };
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
    rawContent = await extractTextFromImage(filePath);
  } else if (mimeType.startsWith('text/') || mimeType === 'application/octet-stream' || file.originalname.endsWith('.txt')) {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } else {
    throw new Error('Unsupported file type. Please upload a plain text file or an image.');
  }
  
  if (onStep) onStep({ step: 1, status: 'completed', output: rawContent });
  console.log(`[Pipeline Step 1] Completed scanning. Extracted ${rawContent.length} characters.`);

  // Step 2: Translate content to English
  console.log(`[Pipeline Step 2] Translating petition content to English (Llama3.2)...`);
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

  // Additional: Extract metadata details
  console.log(`[Pipeline Step 3] Extracting petition metadata...`);
  const metadata = await extractMetadata(translated);
  console.log(`[Pipeline Step 3] Completed metadata extraction.`);

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
