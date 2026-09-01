/**
 * @deprecated Runtime RAG no longer reads bnsEmbeddings.json.
 * Dense search uses PostgreSQL pgvector (law_embeddings) when available.
 * Kept for reference / one-off migration tooling only.
 */
const fs = require('fs');
const path = require('path');

const EMBEDDINGS_PATH = path.join(__dirname, '..', 'data', 'bnsEmbeddings.json');

let indexCache = null; // { model, dimensions, sections: [{code, sectionNumber, embedding}] }

const loadIndex = () => {
  if (indexCache) return indexCache;
  if (!fs.existsSync(EMBEDDINGS_PATH)) {
    throw new Error(
      `BNS embeddings index not found at ${EMBEDDINGS_PATH}. Run "node scripts/ingestBnsEmbeddings.js" first.`
    );
  }
  indexCache = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf-8'));
  return indexCache;
};

const cosineSimilarity = (a, b) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Brute-force cosine similarity search over the in-memory BNS section index.
 * 358 sections at ~768 dims is trivial to scan in full on every call — no ANN needed.
 * @param {number[]} queryEmbedding
 * @param {number} topK
 * @returns {Array<{code: string, sectionNumber: string, score: number}>} best-first
 */
const searchSimilar = (queryEmbedding, topK = 15) => {
  const { sections } = loadIndex();
  const scored = sections.map((s) => ({
    code: s.code,
    sectionNumber: s.sectionNumber,
    score: cosineSimilarity(queryEmbedding, s.embedding)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
};

const isIndexAvailable = () => fs.existsSync(EMBEDDINGS_PATH);

module.exports = {
  searchSimilar,
  isIndexAvailable,
  cosineSimilarity
};
