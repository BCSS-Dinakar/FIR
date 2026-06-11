require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { checkOllamaConnection, generateOllamaText, generateOllamaVision } = require('./ollamaService');
const { runFirPipeline } = require('./pipelines/firPipeline');
const app = express();
app.use(express.json()); // To parse JSON bodies for Ollama POST requests
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Set up storage engine for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Add timestamp to ensure unique filenames
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Configure multer to filter specific file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain'
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, GIF, WEBP and TXT are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload endpoint
app.post('/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files were uploaded.' });
  }

  res.status(200).json({
    success: true,
    message: `${req.files.length} file(s) uploaded successfully!`,
    files: req.files.map(f => f.filename)
  });
});

// Ollama API Chat Endpoint (Text)
app.post('/api/ollama/text', async (req, res) => {
  try {
    const { prompt, model = 'llama3' } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }
    const responseText = await generateOllamaText(prompt, model);
    res.status(200).json({ success: true, response: responseText });
  } catch (error) {
    console.error('Ollama Error:', error);
    res.status(500).json({ success: false, message: 'Ollama failed to generate a response. ' + error.message });
  }
});

// Ollama API Vision Endpoint (Images)
app.post('/api/ollama/vision', async (req, res) => {
  try {
    const { prompt, model = 'llava', images } = req.body;
    if (!prompt || !images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, message: 'Prompt and an images array are required' });
    }
    const responseText = await generateOllamaVision(prompt, images, model);
    res.status(200).json({ success: true, response: responseText });
  } catch (error) {
    console.error('Ollama Error:', error);
    res.status(500).json({ success: false, message: 'Ollama failed to generate a response. ' + error.message });
  }
});

// FIR Pipeline Endpoint
app.post('/api/firpipeline', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const onProgress = (message) => {
      res.write(JSON.stringify({ type: 'progress', message }) + '\n');
    };

    const result = await runFirPipeline(req.file, onProgress);
    res.write(JSON.stringify({ type: 'result', data: result }) + '\n');
    res.end();
  } catch (error) {
    console.error('FIR Pipeline Error:', error);
    res.write(JSON.stringify({ type: 'error', message: 'Pipeline failed: ' + error.message }) + '\n');
    res.end();
  }
});

// Error handling middleware for multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `Multer Error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  // Check Ollama connection via API
  await checkOllamaConnection();
});
