const fs = require('fs');
const { generateOllamaVision, generateOllamaText } = require('../ollamaService');

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
 * @returns {Promise<Object>} { valid: true/false, reason: string }
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
 * Main FIR pipeline entry point.
 * Image: extract raw text, translate to English, return.
 * Text: read content, translate to English, return.
 * @param {Object} file - The uploaded file object from multer.
 * @param {Function} onProgress - Callback for real-time progress updates.
 * @returns {Promise<Object>} { valid: true, reason: null, response: string }
 */
const runFirPipeline = async (file, onProgress = () => {}) => {
  const filePath = file.path;
  const mimeType = file.mimetype;

  try {
    if (mimeType.startsWith('image/')) {
      // step1 (image): Extract raw text from image
      console.log('\n--- Step 1 (Image): Extract Raw Text Started ---');
      onProgress('\n--- Step 1 (Image): Extract Raw Text Started ---\n');
      const extractedContent = await extractTextFromImage(filePath);
      console.log('--- Step 1 Completed. Output Below: ---\n', extractedContent, '\n---------------------------------------\n');
      onProgress('--- Step 1 Completed. Output Below: ---\n' + extractedContent + '\n---------------------------------------\n');

      // step2 (image): Translate to English
      console.log('--- Step 2 (Image): Translate to English Started ---');
      onProgress('\n--- Step 2 (Image): Translate to English Started ---\n');
      const translated = await translateToEnglish(extractedContent);
      console.log('--- Step 2 Completed. Output Below: ---\n', translated, '\n---------------------------------------\n');
      onProgress('--- Step 2 Completed. Output Below: ---\n' + translated + '\n---------------------------------------\n');

      // step3 (image): Validate FIR petition
      console.log('--- Step 3 (Image): FIR Validation Started ---');
      onProgress('\n--- Step 3 (Image): FIR Validation Started ---\n');
      const validationResult = await validateFir(translated);
      let step3Output = `Valid: ${validationResult.valid}`;
      if (!validationResult.valid && validationResult.missing_fields && validationResult.missing_fields.length > 0) {
        step3Output += `\nMissing Fields: ${validationResult.missing_fields.join(', ')}`;
      }
      step3Output += `\nReason: ${validationResult.reason}`;
      console.log('--- Step 3 Completed. Output Below: ---\n', step3Output, '\n---------------------------------------\n');
      onProgress('--- Step 3 Completed. Output Below: ---\n' + step3Output + '\n---------------------------------------\n');

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { 
        valid: validationResult.valid, 
        reason: validationResult.reason, 
        response: translated, 
        step1Output: extractedContent, 
        step2Output: translated,
        step3Output: step3Output 
      };

    } else if (mimeType.startsWith('text/')) {
      // step1 (text): Read content directly from file
      console.log('\n--- Step 1 (Text): Read File Content Started ---');
      onProgress('\n--- Step 1 (Text): Read File Content Started ---\n');
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      console.log('--- Step 1 Completed. Output Below: ---\n', rawContent, '\n---------------------------------------\n');
      onProgress('--- Step 1 Completed. Output Below: ---\n' + rawContent + '\n---------------------------------------\n');

      // step2 (text): Translate to English
      console.log('--- Step 2 (Text): Translate to English Started ---');
      onProgress('\n--- Step 2 (Text): Translate to English Started ---\n');
      const translated = await translateToEnglish(rawContent);
      console.log('--- Step 2 Completed. Output Below: ---\n', translated, '\n---------------------------------------\n');
      onProgress('--- Step 2 Completed. Output Below: ---\n' + translated + '\n---------------------------------------\n');

      // step3 (text): Validate FIR petition
      console.log('--- Step 3 (Text): FIR Validation Started ---');
      onProgress('\n--- Step 3 (Text): FIR Validation Started ---\n');
      const validationResult = await validateFir(translated);
      let step3Output = `Valid: ${validationResult.valid}`;
      if (!validationResult.valid && validationResult.missing_fields && validationResult.missing_fields.length > 0) {
        step3Output += `\nMissing Fields: ${validationResult.missing_fields.join(', ')}`;
      }
      step3Output += `\nReason: ${validationResult.reason}`;
      console.log('--- Step 3 Completed. Output Below: ---\n', step3Output, '\n---------------------------------------\n');
      onProgress('--- Step 3 Completed. Output Below: ---\n' + step3Output + '\n---------------------------------------\n');

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { 
        valid: validationResult.valid, 
        reason: validationResult.reason, 
        response: translated, 
        step1Output: rawContent, 
        step2Output: translated,
        step3Output: step3Output 
      };

    } else {
      throw new Error('Unsupported file type. Please upload an image or text file.');
    }

  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  }
};

module.exports = {
  runFirPipeline
};
