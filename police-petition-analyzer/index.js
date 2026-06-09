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
app.use('/test_petitions', express.static('test_petitions'));

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
    const jsonResult = JSON.parse(resultText);

    console.log('✅ Analysis complete.');
    res.json(jsonResult);

  } catch (error) {
    console.error('❌ Error during AI analysis:', error);
    res.status(500).json({ error: 'Failed to analyze the petition', details: error.message });
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
