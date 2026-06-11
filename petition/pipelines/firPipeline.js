const fs = require('fs');
const { generateOllamaVision, generateOllamaText } = require('../ollamaService');
const searchBNS = require('../services/bnsSearch');

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
 * step4: Extract a concise incident summary from the petition for BNS search.
 * @param {string} content - The translated English petition.
 * @returns {Promise<string>}
 */
const extractIncidentFacts = async (content) => {
  const prompt = `You are a legal analyst. Read the following FIR petition and extract the key crime facts in 3-4 short sentences.

CRITICAL: The ACCUSED is the person who committed the crime. The VICTIM is the person who suffered.

Include ALL of the following if present in the petition:
1. The relationship of the accused to the victim (e.g. "the accused is the victim's husband").
2. The motive for the crime (e.g. "the accused demanded dowry money from the victim's parents").
3. The type of offence and physical harm caused to the VICTIM.
4. Any weapon or method used.

Do NOT include names, addresses, dates, salutations, or legal section references.
Return ONLY the crime fact sentences. Nothing else.

PETITION:
${content}`;
  return await generateOllamaText(prompt, 'llama3.2');
};

/**
 * step4 (helper): Build a secondary context query to ensure relationship/motive sections are retrieved.
 * e.g. "husband cruelty wife dowry demand harassment" -> finds Section 85
 */
const extractContextQuery = (facts) => {
  const lower = facts.toLowerCase();
  const parts = [];
  if (lower.includes('husband') || lower.includes('wife') || lower.includes('spouse')) {
    parts.push('husband cruelty wife domestic');
  }
  if (lower.includes('dowry')) {
    parts.push('dowry demand harassment cruelty');
  }
  if (lower.includes('theft') || lower.includes('stolen') || lower.includes('steal')) {
    parts.push('theft property stolen movable');
  }
  if (lower.includes('employer') || lower.includes('employee') || lower.includes('worker')) {
    parts.push('employer employee forced labour');
  }
  if (lower.includes('assault') || lower.includes('beat') || lower.includes('hit') || lower.includes('slap') || lower.includes('attack') || lower.includes('strike') || lower.includes('wound') || lower.includes('injur')) {
    parts.push('voluntarily causing hurt assault');
  }
  if (lower.includes('break') || lower.includes('fracture') || lower.includes('grievous') || lower.includes('severely') || lower.includes('hospital') || lower.includes('arm') || lower.includes('leg') || lower.includes('bone')) {
    parts.push('voluntarily causing grievous hurt broken fracture');
  }
  return parts.length > 0 ? parts.join(' ') : null;
};

/**
 * step4 (rerank): Validate and filter BNS candidates using Llama as legal judge.
 * @param {string} facts - Concise incident facts.
 * @param {Array} sections - Candidate sections from ChromaDB.
 * @returns {Promise<Object>} { sections: [{section, title, reason}] }
 */
const validateBNSSections = async (facts, sections) => {
  const prompt = `You are a legal AI assistant specialized in Bharatiya Nyaya Sanhita (BNS) section identification.

Incident facts:
${facts}

Candidate BNS sections:
${JSON.stringify(sections)}

Task:
Analyze the incident facts and select ONLY sections that are legally supported by the facts.

Important legal rules:

1. Match the complete ingredients of the offence, not just keywords.
2. A section should be selected only if ALL major required conditions of that offence exist in the incident facts.
3. Reject unrelated sections even if some words match.
4. Do not select:
   - Death related sections unless death or attempt to cause death is clearly mentioned.
   - Acid attack sections unless acid is explicitly mentioned.
   - Sexual offence sections unless sexual acts are explicitly mentioned.
   - Terrorist sections unless terrorism/national security facts are mentioned.
5. Physical beating, slapping, injuries -> consider hurt/assault related sections.
6. Dowry demand or harassment by husband -> consider cruelty/dowry related sections.
7. Witness presence only means evidence availability. It does NOT mean provocation.
8. Do not infer missing facts.
9. If no candidate section properly matches, return empty sections array.
10. Return maximum 3 strongest sections only.
11. CRITICAL CONSTRAINTS:
    - If the victim is alive (e.g. they are the complainant filing the petition), DO NOT select Section 80 or 86 or any other "Dowry death" / homicide / suicide sections.
    - DO NOT select Section 79 (Modesty of a woman) for general physical beating/injuries unless there is a specific intention/action to insult her modesty/privacy (physical slapping or hitting during a domestic/dowry dispute is general hurt/assault, not modesty insult).
    - DO NOT select Section 122 or 136 (Provocation) unless the accused was provoked by sudden and grave provocation from the victim. (Being drunk or having a dispute does NOT constitute provocation).
    - DO NOT select Section 83 (Unsound mind/marriage context) unless the facts explicitly show mental illness/unsoundness or fraudulent marriage.

Return ONLY JSON. No markdown. No explanation outside JSON.

Format:
{
  "sections": [
    {
      "section": "number",
      "title": "title",
      "reason": "why this section legally matches the facts"
    }
  ]
}`;

  const response = await generateOllamaText(prompt, 'llama3.2');

  try {
    return JSON.parse(response);
  } catch (error) {
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    throw new Error('Failed to parse BNS validation response');
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
const runFirPipeline = async (file, onProgress = () => { }) => {
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

      // step4 (image): BNS Semantic Search + Llama Legal Filter
      console.log('--- Step 4 (Image): BNS Semantic Search + Legal Filter Started ---');
      onProgress('\n--- Step 4 (Image): BNS Semantic Search + Legal Filter Started ---\n');
      let step4Output = '';
      let bnsResults = null;
      if (validationResult.valid) {
        // Extract concise crime facts
        const incidentFacts = await extractIncidentFacts(translated);
        onProgress(`> Extracted incident summary: ${incidentFacts.trim()}\n`);
        // Retrieve candidates: dual-query for better Section 85 coverage
        onProgress('> Querying ChromaDB for candidate sections...\n');
        const contextQuery = extractContextQuery(incidentFacts);
        const candidates = await searchBNS(incidentFacts, contextQuery);
        // Rerank with Llama as legal judge (pass content so Llama can read the actual law)
        onProgress('> Llama legal filter running...\n');
        const candidatesWithContent = candidates.slice(0, 20).map(r => ({
          section: r.section,
          title: r.title,
          law_text: r.content
        }));
        bnsResults = await validateBNSSections(incidentFacts, candidatesWithContent);
        if (bnsResults.sections && bnsResults.sections.length > 0) {
          step4Output = 'Recommended BNS Sections:\n';
          bnsResults.sections.forEach((r, idx) => {
            step4Output += `${idx + 1}. Section ${r.section}: ${r.title}\nReason: ${r.reason}\n\n`;
          });
        } else {
          step4Output = 'No applicable BNS sections found.';
        }
      } else {
        step4Output = 'BNS Search skipped because the FIR petition is missing critical information.';
      }
      console.log('--- Step 4 Completed. Output Below: ---\n', step4Output, '\n---------------------------------------\n');
      onProgress('--- Step 4 Completed. Output Below: ---\n' + step4Output + '\n---------------------------------------\n');

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return {
        valid: validationResult.valid,
        reason: validationResult.reason,
        response: translated,
        step1Output: extractedContent,
        step2Output: translated,
        step3Output: step3Output,
        step4Output: step4Output,
        bnsResults: validationResult.valid ? bnsResults : null
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

      // step4 (text): BNS Semantic Search + Llama Legal Filter
      console.log('--- Step 4 (Text): BNS Semantic Search + Legal Filter Started ---');
      onProgress('\n--- Step 4 (Text): BNS Semantic Search + Legal Filter Started ---\n');
      let step4Output = '';
      let bnsResults = null;
      if (validationResult.valid) {
        // Extract concise crime facts
        const incidentFacts = await extractIncidentFacts(translated);
        onProgress(`> Extracted incident summary: ${incidentFacts.trim()}\n`);
        // Retrieve candidates: dual-query (action + context) for better coverage
        onProgress('> Querying ChromaDB for candidate sections...\n');
        const contextQuery = extractContextQuery(incidentFacts);
        const candidates = await searchBNS(incidentFacts, contextQuery);
        // Pass section content to Llama so it can read the actual law text
        onProgress('> Llama legal filter running...\n');
        const candidatesWithContent = candidates.slice(0, 20).map(r => ({
          section: r.section,
          title: r.title,
          law_text: r.content
        }));
        bnsResults = await validateBNSSections(incidentFacts, candidatesWithContent);
        if (bnsResults.sections && bnsResults.sections.length > 0) {
          step4Output = 'Recommended BNS Sections:\n';
          bnsResults.sections.forEach((r, idx) => {
            step4Output += `${idx + 1}. Section ${r.section}: ${r.title}\nReason: ${r.reason}\n\n`;
          });
        } else {
          step4Output = 'No applicable BNS sections found.';
        }
      } else {
        step4Output = 'BNS Search skipped because the FIR petition is missing critical information.';
      }
      console.log('--- Step 4 Completed. Output Below: ---\n', step4Output, '\n---------------------------------------\n');
      onProgress('--- Step 4 Completed. Output Below: ---\n' + step4Output + '\n---------------------------------------\n');

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return {
        valid: validationResult.valid,
        reason: validationResult.reason,
        response: translated,
        step1Output: rawContent,
        step2Output: translated,
        step3Output: step3Output,
        step4Output: step4Output,
        bnsResults: validationResult.valid ? bnsResults : null
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
