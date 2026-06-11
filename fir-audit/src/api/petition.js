import API from './api';

/**
 * Sends a file to the backend pipeline to parse OCR, translate, validate, and extract metadata.
 */
export const runPetitionPipeline = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await API.post('/api/petitions/pipeline', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
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
