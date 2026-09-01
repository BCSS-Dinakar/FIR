const { searchLexical } = require('./bnsLexicalIndex');
const lawsRepo = require('../repositories/lawsRepo');
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const {
  generateEmbedding,
  getEmbeddingModelId,
  EmbeddingNotConfiguredError
} = require('./embeddingService');
const config = require('./ragRetrievalConfig');
const {
  dedupeChunkRowsToSections,
  assignRanks,
  mergeRetrievalHit,
  fuseCandidates
} = require('./ragHybridFusion');

const DEFAULT_SOURCES = {
  bm25: true,
  fts: true,
  trigram: true,
  semantic: true
};

const retrieveBm25 = async (facts, limit) => {
  const hits = await searchLexical(facts, limit);
  return assignRanks(hits.map((h) => ({ code: h.code, sectionId: null, score: h.score })));
};

const retrieveFts = async (facts, limit, lawFilter = null) => {
  const rows = await lawsRepo.searchLawsFts(facts, lawFilter, limit * 3);
  const sections = dedupeChunkRowsToSections(rows, limit);
  return assignRanks(sections);
};

const retrieveTrigram = async (facts, limit, lawFilter = null) => {
  const rows = await lawsRepo.searchLawsTrigram(facts, lawFilter, limit * 3);
  const sections = dedupeChunkRowsToSections(rows, limit);
  return assignRanks(sections);
};

const retrieveSemantic = async (facts, limit) => {
  const embeddingModel = getEmbeddingModelId();
  if (!embeddingModel) {
    return { hits: [], status: 'NOT_CONFIGURED' };
  }

  try {
    const stats = await lawEmbeddingsRepo.getEmbeddingStats(embeddingModel);
    if (!stats.pgvector || stats.count === 0) {
      return { hits: [], status: 'NOT_CONFIGURED' };
    }

    const queryEmbedding = await generateEmbedding(facts);
    const rawHits = await lawEmbeddingsRepo.searchSimilarSectionsDetailed(
      queryEmbedding,
      embeddingModel,
      limit
    );
    const hits = assignRanks(
      rawHits.map((h) => ({
        code: h.code,
        sectionId: h.sectionId ?? null,
        score: h.score,
        matchedChunks: h.matchedChunks
      }))
    );
    return { hits, status: 'ACTIVE' };
  } catch (error) {
    if (error instanceof EmbeddingNotConfiguredError) {
      return { hits: [], status: 'NOT_CONFIGURED' };
    }
    console.warn('[ragRetrievalService] semantic retrieval failed:', error.message);
    return { hits: [], status: 'UNAVAILABLE', error: error.message };
  }
};

const buildStats = ({
  bm25Hits,
  ftsHits,
  trigramHits,
  semanticHits,
  semanticStatus,
  unionCount,
  finalCount
}) => ({
  bm25Count: bm25Hits.length,
  ftsCount: ftsHits.length,
  trigramCount: trigramHits.length,
  semanticCount: semanticHits.length,
  semanticStatus,
  unionCount,
  finalHybridCount: finalCount
});

const logRetrievalStats = (factsPreview, stats) => {
  const preview = factsPreview.length > 120 ? `${factsPreview.slice(0, 120)}…` : factsPreview;
  console.log(
    `[ragRetrieval] query="${preview}" ` +
      `bm25=${stats.bm25Count} fts=${stats.ftsCount} trigram=${stats.trigramCount} ` +
      `semantic=${stats.semanticCount} semantic_retrieval=${stats.semanticStatus} ` +
      `union=${stats.unionCount} final=${stats.finalHybridCount}`
  );
};

/**
 * Hybrid retrieval: independent lexical (BM25 + FTS + trigram) and semantic paths,
 * union + dedupe + RRF fusion. Semantic search is never restricted to lexical hits.
 *
 * @param {string} facts
 * @param {object} [options]
 * @param {object} [options.sources] - enable/disable retrieval paths (for ablation)
 * @param {object} [options.limits] - override top-K limits
 * @param {object} [options.weights] - override RRF weights
 * @param {boolean} [options.log=true]
 * @returns {Promise<{ candidates: object[], stats: object }>}
 */
const retrieveHybridCandidates = async (facts, options = {}) => {
  const sources = { ...DEFAULT_SOURCES, ...(options.sources || {}) };
  const limits = {
    bm25: options.limits?.bm25 ?? config.BM25_LIMIT,
    fts: options.limits?.fts ?? config.FTS_LIMIT,
    trigram: options.limits?.trigram ?? config.TRIGRAM_LIMIT,
    semantic: options.limits?.semantic ?? config.SEMANTIC_LIMIT,
    final: options.limits?.final ?? config.FINAL_CANDIDATE_LIMIT
  };
  const weights = { ...config.WEIGHTS, ...(options.weights || {}) };
  const lawFilter = options.lawFilter ?? null;

  const bm25Hits = [];
  const ftsHits = [];
  const trigramHits = [];
  let semanticHits = [];
  let semanticStatus = 'disabled';
  const latencies = {};

  const timed = async (label, fn) => {
    const start = process.hrtime.bigint();
    const result = await fn();
    latencies[label] = Number(process.hrtime.bigint() - start) / 1e6;
    return result;
  };

  const tasks = [];

  if (sources.bm25) {
    tasks.push(
      timed('bm25Ms', () => retrieveBm25(facts, limits.bm25))
        .then((hits) => { bm25Hits.push(...hits); })
        .catch((err) => console.warn('[ragRetrievalService] BM25 failed:', err.message))
    );
  }

  if (sources.fts) {
    tasks.push(
      timed('ftsMs', () => retrieveFts(facts, limits.fts, lawFilter))
        .then((hits) => { ftsHits.push(...hits); })
        .catch((err) => console.warn('[ragRetrievalService] FTS failed:', err.message))
    );
  }

  if (sources.trigram) {
    tasks.push(
      timed('trigramMs', () => retrieveTrigram(facts, limits.trigram, lawFilter))
        .then((hits) => { trigramHits.push(...hits); })
        .catch((err) => console.warn('[ragRetrievalService] Trigram failed:', err.message))
    );
  }

  if (sources.semantic) {
    tasks.push(
      timed('semanticMs', () => retrieveSemantic(facts, limits.semantic)).then(({ hits, status }) => {
        semanticHits = hits;
        semanticStatus = status;
      })
    );
  }

  const fusionStart = process.hrtime.bigint();
  const wallStart = fusionStart;
  await Promise.all(tasks);

  const candidateMap = new Map();
  bm25Hits.forEach((hit) => mergeRetrievalHit(candidateMap, hit, 'bm25'));
  ftsHits.forEach((hit) => mergeRetrievalHit(candidateMap, hit, 'fts'));
  trigramHits.forEach((hit) => mergeRetrievalHit(candidateMap, hit, 'trigram'));
  semanticHits.forEach((hit) => mergeRetrievalHit(candidateMap, hit, 'semantic'));

  const unionCount = candidateMap.size;
  const fused = fuseCandidates(candidateMap, {
    weights,
    rrfK: config.RRF_K,
    finalLimit: limits.final
  });
  latencies.fusionMs = Number(process.hrtime.bigint() - fusionStart) / 1e6;
  latencies.totalMs = Number(process.hrtime.bigint() - wallStart) / 1e6;

  const lexicalUnionCount = new Set([
    ...bm25Hits.map((h) => h.code),
    ...ftsHits.map((h) => h.code),
    ...trigramHits.map((h) => h.code)
  ]).size;

  const stats = {
    ...buildStats({
      bm25Hits,
      ftsHits,
      trigramHits,
      semanticHits,
      semanticStatus,
      unionCount,
      finalCount: fused.length
    }),
    lexicalUnionCount,
    combinedUnionCount: unionCount,
    deduplicatedCount: unionCount,
    latencies
  };

  if (options.log !== false) {
    logRetrievalStats(facts, stats);
    if (fused.length > 0) {
      const topSources = fused.slice(0, 5).map((c) => `${c.code}[${c.sources.join('+')}]`).join(', ');
      console.log(`[ragRetrieval] top hybrid candidates: ${topSources}`);
    }
  }

  // Normalize legacy status aliases for observability
  if (stats.semanticStatus === 'ok') stats.semanticStatus = 'ACTIVE';

  if (fused.length === 0) {
    throw new Error(
      'No legal section candidates retrieved. Check PostgreSQL connectivity and retrieval configuration.'
    );
  }

  return { candidates: fused, stats };
};

module.exports = {
  retrieveHybridCandidates,
  retrieveBm25,
  retrieveFts,
  retrieveTrigram,
  retrieveSemantic,
  DEFAULT_SOURCES
};
