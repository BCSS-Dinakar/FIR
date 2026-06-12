import API from './api';

/**
 * Sends a file to the backend pipeline to parse OCR, translate, validate, and extract metadata.
 * Streams progress updates to the onChunk callback in real time.
 */
export const runPetitionPipeline = async (file, onChunk) => {
  const formData = new FormData();
  formData.append('file', file);

  const baseURL = API.defaults.baseURL || '';
  const response = await fetch(`${baseURL}/api/petitions/pipeline`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMessage = 'Pipeline request failed';
    try {
      const errJson = JSON.parse(errText);
      errMessage = errJson.message || errMessage;
    } catch (_) {}
    throw new Error(errMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Hold partial line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (data.status === 'error') {
            throw new Error(data.message);
          }
          if (data.step === 4 && data.status === 'completed') {
            finalResult = data.result;
          }
          if (onChunk) {
            onChunk(data);
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) {
            throw e;
          }
          console.error('Failed to parse NDJSON line:', line, e);
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error('Pipeline completed without returning final result');
  }

  return finalResult;
};

/**
 * Fetches all scanned petitions from the database.
 */
export const getPetitions = async (params) => {
  const response = await API.get('/api/petitions', { params });
  return response.data;
};

/**
 * Saves a newly scanned petition to the database.
 */
export const createPetition = async (data) => {
  const response = await API.post('/api/petitions', data);
  return response.data;
};

/**
 * Updates a petition in the database (e.g. status, score, resolved blockers, CCTNS fields).
 */
export const updatePetition = async (id, data) => {
  const response = await API.put(`/api/petitions/${id}`, data);
  return response.data;
};

/**
 * Deletes a petition from the database.
 */
export const deletePetition = async (id) => {
  const response = await API.delete(`/api/petitions/${id}`);
  return response.data;
};

/**
 * Fetches all registered FIR records from the database.
 */
export const getFirs = async (params) => {
  const response = await API.get('/api/firs', { params });
  return response.data;
};

/**
 * Registers and saves a new FIR record in the database.
 */
export const createFir = async (data) => {
  const response = await API.post('/api/firs', data);
  return response.data;
};

/**
 * Fetches data for the status board (all petitions and FIRs in one request).
 */
export const getFIRStatusBoard = async () => {
  const response = await API.get('/api/petitions/firstatusboard');
  return response.data;
};

/**
 * Fetches lightweight, aggregate notification counts.
 */
export const getPetitionCounts = async () => {
  const response = await API.get('/api/petitions/counts');
  return response.data;
};

/**
 * Fetches optimized data for the analytics pages (scores and grouped blocker counts).
 */
export const getFIRAnalytics = async () => {
  const response = await API.get('/api/petitions/analytics');
  return response.data;
};

/**
 * Fetches a single petition by its custom id (returns full details).
 */
export const getPetitionById = async (id) => {
  const response = await API.get(`/api/petitions/${id}`);
  return response.data;
};

/**
 * Fetches petitions and stats for the Draft & File page.
 */
export const getDraftAndFileFIR = async () => {
  const response = await API.get('/api/petitions/draftandfile');
  return response.data;
};

/**
 * Fetches petitions and stats for the Mistakes & Warnings page.
 */
export const getMistakesAndWarnings = async () => {
  const response = await API.get('/api/petitions/mistakesandwarnings');
  return response.data;
};

