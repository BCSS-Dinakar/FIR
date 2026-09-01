const parseFloatEnv = (key, defaultVal) => {
  const raw = process.env[key];
  if (raw == null || raw === '') return defaultVal;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : defaultVal;
};

const parseIntEnv = (key, defaultVal) => {
  const raw = process.env[key];
  if (raw == null || raw === '') return defaultVal;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultVal;
};

module.exports = {
  BM25_LIMIT: parseIntEnv('RAG_BM25_LIMIT', 50),
  FTS_LIMIT: parseIntEnv('RAG_FTS_LIMIT', 50),
  TRIGRAM_LIMIT: parseIntEnv('RAG_TRIGRAM_LIMIT', 30),
  SEMANTIC_LIMIT: parseIntEnv('RAG_SEMANTIC_LIMIT', 30),
  FINAL_CANDIDATE_LIMIT: parseIntEnv('RAG_FINAL_CANDIDATE_LIMIT', 20),
  RRF_K: parseIntEnv('RAG_RRF_K', 60),
  WEIGHTS: {
    bm25: parseFloatEnv('RAG_BM25_WEIGHT', 1.0),
    fts: parseFloatEnv('RAG_FTS_WEIGHT', 0.8),
    trigram: parseFloatEnv('RAG_TRIGRAM_WEIGHT', 0.4),
    semantic: parseFloatEnv('RAG_VECTOR_WEIGHT', 1.0)
  }
};
