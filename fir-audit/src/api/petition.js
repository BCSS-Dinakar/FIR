import API from './api';

const parseJsonResponse = async (response, fallbackMessage = 'Request failed') => {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text || fallbackMessage };
  }
  if (!response.ok) {
    throw new Error(body?.message || fallbackMessage);
  }
  return body;
};

/** Step 1 — OCR / text extraction. Officer must approve before step 2. */
export const runPipelineStep1 = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const baseURL = API.defaults.baseURL || '';
  const response = await fetch(`${baseURL}/api/petitions/pipeline/step/1`, {
    method: 'POST',
    body: formData
  });
  return parseJsonResponse(response, 'Step 1 (scan) failed');
};

/** Step 2 — translate to English. Officer must approve before step 3. */
export const runPipelineStep2 = async (step1Output) => {
  const response = await API.post('/api/petitions/pipeline/step/2', { step1Output });
  return response.data;
};

/** Step 3 — 5W+1H validation + metadata. Officer must approve before finalize. */
export const runPipelineStep3 = async (step2Output) => {
  const response = await API.post('/api/petitions/pipeline/step/3', { step2Output });
  return response.data;
};

/** Step 4 — RAG + save petition after officer approves all prior steps. */
export const finalizePetitionPipeline = async (payload) => {
  const response = await API.post('/api/petitions/pipeline/finalize', payload);
  return response.data;
};

/**
 * Legacy auto pipeline — runs all steps without manual approval.
 * Prefer step-by-step functions above for the Check New Petition UI.
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
 * AI-extracts FIR form fields from the petition's text (grounded, no invented
 * values). Cached on the petition after first run — pass { refresh: true } to
 * force re-extraction.
 */
export const autofillFir = async (id, { refresh = false } = {}) => {
  const response = await API.get(`/api/petitions/${id}/autofill-fir`, { params: refresh ? { refresh: true } : {} });
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

export const getFirByPetitionId = async (petitionId) => {
  const response = await API.get(`/api/firs/by-petition/${petitionId}`);
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
 * Fetches legal sections from the backend (BNS, BNSS, BSA): RAG-recommended
 * sections for the petition, plus a searchable/paginated slice of the complete
 * catalog across all three acts.
 */
export const getAllBnsSections = async (search = '', recommended = [], petitionId = '', { limit = 50, offset = 0 } = {}) => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (recommended && recommended.length > 0) params.append('recommended', recommended.join(','));
  if (petitionId) params.append('petitionId', petitionId);
  params.append('limit', limit);
  params.append('offset', offset);

  const response = await API.get(`/api/petitions/bns-sections?${params.toString()}`);
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

