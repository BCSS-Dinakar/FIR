const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Checks if the Ollama service is reachable.
 */
const checkOllamaConnection = async () => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    console.log(`✅ Ollama connection successful! (Found ${response.data.models.length} local models)`);
    return true;
  } catch (error) {
    console.log(`❌ Ollama connection missing! Please ensure the Ollama app is running.`);
    return false;
  }
};

/**
 * Sends a text-only prompt to the Ollama API.
 */
const generateOllamaText = async (prompt, model = 'llama3') => {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      keep_alive: 0
    });
    return response.data.message.content;
  } catch (error) {
    throw new Error(`Ollama API error: ${error.response?.status || error.message}`);
  }
};

/**
 * Sends a prompt with images to the Ollama API for vision tasks.
 */
const generateOllamaVision = async (prompt, images, model = 'llava') => {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: model,
      messages: [{ role: 'user', content: prompt, images: images }],
      stream: false,
      keep_alive: 0
    });
    return response.data.message.content;
  } catch (error) {
    throw new Error(`Ollama API error: ${error.response?.status || error.message}`);
  }
};

/**
 * Generates vector embeddings for the given text using an Ollama embedding model.
 */
const generateOllamaEmbedding = async (prompt, model = 'nomic-embed-text') => {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
      model: model,
      prompt: prompt,
      keep_alive: '5m'
    });
    return response.data.embedding;
  } catch (error) {
    throw new Error(`Ollama Embedding API error: ${error.response?.status || error.message}`);
  }
};

module.exports = {
  checkOllamaConnection,
  generateOllamaText,
  generateOllamaVision,
  generateOllamaEmbedding
};
