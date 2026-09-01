const { toCanonicalCode } = require('../repositories/lawEmbeddingsRepo');

/**
 * Collapse chunk-level PostgreSQL rows to one row per canonical section code.
 * Keeps the highest score per section and preserves section_id when available.
 */
const dedupeChunkRowsToSections = (rows, topK = null) => {
  const byCode = new Map();
  for (const row of rows) {
    const code = toCanonicalCode(row.law_name, row.section_number);
    if (!code) continue;
    const score = Number(row.rank ?? row.score ?? 0);
    const existing = byCode.get(code);
    if (!existing || score > existing.score) {
      byCode.set(code, {
        code,
        sectionId: row.section_id ?? null,
        sectionNumber: code.split(' ')[1],
        score
      });
    }
  }

  const sorted = [...byCode.values()].sort((a, b) => b.score - a.score);
  return topK ? sorted.slice(0, topK) : sorted;
};

const assignRanks = (items) =>
  items.map((item, index) => ({ ...item, rank: index + 1 }));

const emptyCandidate = (code, sectionId = null) => ({
  code,
  sectionId,
  sectionNumber: code.split(' ')[1],
  bm25Rank: null,
  bm25Score: null,
  ftsRank: null,
  ftsScore: null,
  trigramRank: null,
  trigramScore: null,
  semanticRank: null,
  semanticScore: null,
  matchedChunks: [],
  sources: [],
  rrfScore: null
});

const mergeRetrievalHit = (map, hit, source) => {
  const existing = map.get(hit.code) || emptyCandidate(hit.code, hit.sectionId ?? null);
  if (hit.sectionId && !existing.sectionId) existing.sectionId = hit.sectionId;

  if (source === 'bm25') {
    existing.bm25Rank = hit.rank;
    existing.bm25Score = hit.score;
  } else if (source === 'fts') {
    existing.ftsRank = hit.rank;
    existing.ftsScore = hit.score;
  } else if (source === 'trigram') {
    existing.trigramRank = hit.rank;
    existing.trigramScore = hit.score;
  } else if (source === 'semantic') {
    existing.semanticRank = hit.rank;
    existing.semanticScore = hit.score;
    if (Array.isArray(hit.matchedChunks) && hit.matchedChunks.length) {
      existing.matchedChunks = hit.matchedChunks;
    }
  }

  if (!existing.sources.includes(source)) existing.sources.push(source);
  map.set(hit.code, existing);
};

/**
 * Reciprocal Rank Fusion across independent retrieval paths.
 * Ranks are 1-based; missing paths contribute zero.
 */
const computeRrfScore = (candidate, weights, k = 60) => {
  let score = 0;
  if (candidate.bm25Rank != null) score += weights.bm25 / (k + candidate.bm25Rank);
  if (candidate.ftsRank != null) score += weights.fts / (k + candidate.ftsRank);
  if (candidate.trigramRank != null) score += weights.trigram / (k + candidate.trigramRank);
  if (candidate.semanticRank != null) score += weights.semantic / (k + candidate.semanticRank);
  return score;
};

const fuseCandidates = (candidateMap, { weights, rrfK, finalLimit }) => {
  const fused = [...candidateMap.values()].map((candidate) => ({
    ...candidate,
    rrfScore: computeRrfScore(candidate, weights, rrfK)
  }));

  return fused
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, finalLimit);
};

module.exports = {
  dedupeChunkRowsToSections,
  assignRanks,
  emptyCandidate,
  mergeRetrievalHit,
  computeRrfScore,
  fuseCandidates
};
