const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Serve the sample images folder
app.use('/test_petitions', express.static(path.join(__dirname, 'test_petitions')));

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Set up multer to store images in memory for processing
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const prompts = require('./prompts.json');

// Serve the test HTML interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

app.post('/api/analyze-petition', upload.single('petitionImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded. Field name must be petitionImage.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    console.log('🖼️ Received petition image for analysis...');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    res.write(JSON.stringify({ status: 'progress', message: 'Step 1: Reading and translating image text...' }) + '\n');

    // Convert multer file buffer to base64 for Gemini API
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        prompts.ANALYZE_PETITION_PROMPT,
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text;
    const step1Result = JSON.parse(resultText);

    console.log('✅ Step 1: OCR & Translation complete. Starting Step 2: Validation & 5W1H extraction...');
    res.write(JSON.stringify({ status: 'progress', message: 'Step 2: Validating petition & extracting 5W1H details...' }) + '\n');

    // Step 2: Validation & 5W1H Extraction
    const validationResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        prompts.VALIDATE_PETITION_PROMPT,
        step1Result.english_translation
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const finalResult = JSON.parse(validationResponse.text);

    console.log('✅ Step 2: Validation complete.');

    let step3Result = null;
    if (finalResult.status !== 'INVALID') {
      console.log('⚖️ Starting Step 3: Legal Audit & Section Mapping...');
      res.write(JSON.stringify({ status: 'progress', message: 'Step 3: Performing legal audit and mapping BNS sections...' }) + '\n');

      const mappingResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          prompts.MAP_LEGAL_SECTIONS_PROMPT,
          JSON.stringify(finalResult.five_w_h)
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });
      step3Result = JSON.parse(mappingResponse.text);
      console.log('✅ Step 3: Legal Mapping complete.');
    }

    res.write(JSON.stringify({
      status: 'complete',
      step1: step1Result,
      step2: finalResult,
      step3: step3Result
    }) + '\n');
    res.end();

  } catch (error) {
    console.error('❌ Error during AI analysis:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to analyze the petition', details: error.message });
    } else {
      res.write(JSON.stringify({ status: 'error', message: error.message }) + '\n');
      res.end();
    }
  }
});

const startServer = async () => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.warn('⚠️ GEMINI_API_KEY is missing or invalid in .env. Setup required!');
    } else {
      console.log('🔄 Authenticating with Google Gemini API...');
      // Send a lightweight request to verify the API key is valid
      await ai.models.get({ model: 'gemini-2.5-flash' });
      console.log('✅ Google Gemini API Connection Established Successfully.');
    }

    app.listen(PORT, () => {
      console.log(`🧠 AI Petition Analyzer running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to connect to Google Gemini API. Please check your API Key.');
    console.error(error.message);
    process.exit(1);
  }
};

startServer();
