const crypto = require('crypto');
const { query } = require('../config/postgres');

const LAW_NAMES = ['BNS', 'BNSS', 'BSA'];

const hashContent = (content) =>
  crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');

let pgVectorAvailableCache = null;

const toCanonicalCode = (lawName, sectionNumber) => {
  const law = LAW_NAMES.includes(lawName) ? lawName : null;
  const number = String(sectionNumber || '').match(/(\d+[A-Z]?)/i)?.[1];
  if (!law || !number) return null;
  return `${law} ${number.toUpperCase()}`;
};

const isPgVectorAvailable = async () => {
  if (pgVectorAvailableCache !== null) return pgVectorAvailableCache;
  try {
    const { rows } = await query(
      `SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`
    );
    pgVectorAvailableCache = rows.length > 0;
  } catch {
    pgVectorAvailableCache = false;
  }
  return pgVectorAvailableCache;
};

const getPgVectorExtensionInfo = async () => {
  const { rows } = await query(
    `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector' LIMIT 1`
  );
  return rows[0] || null;
};

const getEmbeddingStats = async (embeddingModel) => {
  const pgvector = await isPgVectorAvailable();
  if (!pgvector) {
    return { pgvector: false, count: 0, model: embeddingModel || null, dimension: null };
  }

  const table = await query(
    `SELECT to_regclass('public.law_embeddings') AS reg`
  );
  if (!table.rows[0]?.reg) {
    return { pgvector: true, count: 0, model: embeddingModel || null, dimension: null };
  }

  const params = [];
  let modelClause = '';
  if (embeddingModel) {
    params.push(embeddingModel);
    modelClause = 'WHERE embedding_model = $1';
  }

  const { rows } = await query(
    `SELECT COUNT(*)::int AS count,
            MAX(embedding_model) AS model,
            MAX(embedding_dimension)::int AS dimension
     FROM law_embeddings
     ${modelClause}`,
    params
  );
  return {
    pgvector: true,
    count: rows[0]?.count || 0,
    model: rows[0]?.model || embeddingModel || null,
    dimension: rows[0]?.dimension || null
  };
};

const ensureSchema = async (dimension, embeddingModel) => {
  if (!(await isPgVectorAvailable())) {
    throw new Error(
      'pgvector extension is not installed on PostgreSQL. ' +
      'Ask your DBA to install pgvector, then run: CREATE EXTENSION vector;'
    );
  }

  const stats = await getEmbeddingStats();
  if (stats.count > 0 && stats.dimension && stats.dimension !== dimension) {
    throw new Error(
      `law_embeddings dimension mismatch: stored ${stats.dimension}, requested ${dimension}. ` +
      'Re-ingest with the new model or truncate law_embeddings first.'
    );
  }
  if (stats.count > 0 && stats.model && stats.model !== embeddingModel) {
    throw new Error(
      `law_embeddings model mismatch: stored "${stats.model}", requested "${embeddingModel}". ` +
      'Truncate law_embeddings before switching embedding models.'
    );
  }

  await query(`
    CREATE TABLE IF NOT EXISTS law_embeddings (
      id BIGSERIAL PRIMARY KEY,
      chunk_type TEXT NOT NULL,
      chunk_id BIGINT NOT NULL,
      section_id BIGINT NOT NULL REFERENCES laws_sections(id) ON DELETE CASCADE,
      law_name TEXT NOT NULL,
      section_number TEXT NOT NULL,
      embedding vector(${dimension}) NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dimension INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (chunk_type, chunk_id, embedding_model)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_law_embeddings_model
    ON law_embeddings (embedding_model)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_law_embeddings_section
    ON law_embeddings (section_id)
  `);
  await query(`
    ALTER TABLE law_embeddings
    ADD COLUMN IF NOT EXISTS content_hash TEXT
  `);
};

const tableExists = async () => {
  const { rows } = await query(`SELECT to_regclass('public.law_embeddings') AS reg`);
  return Boolean(rows[0]?.reg);
};

const loadRagChunks = async () => {
  const { rows } = await query(
    `SELECT chunk_type, chunk_id, section_id, law_name, section_number, content
     FROM v_laws_rag_chunks
     WHERE law_name = ANY($1::text[])
     ORDER BY law_name, section_sort NULLS LAST, sort_order`,
    [LAW_NAMES]
  );
  return rows;
};

const listEmbeddedChunkKeys = async (embeddingModel) => {
  if (!(await tableExists())) return new Set();
  const { rows } = await query(
    `SELECT chunk_type, chunk_id
     FROM law_embeddings
     WHERE embedding_model = $1`,
    [embeddingModel]
  );
  return new Set(rows.map((r) => `${r.chunk_type}:${r.chunk_id}`));
};

const listEmbeddedChunkHashes = async (embeddingModel) => {
  if (!(await tableExists())) return new Map();
  const { rows } = await query(
    `SELECT chunk_type, chunk_id, content_hash
     FROM law_embeddings
     WHERE embedding_model = $1`,
    [embeddingModel]
  );
  return new Map(rows.map((r) => [`${r.chunk_type}:${r.chunk_id}`, r.content_hash || null]));
};

const upsertBatch = async (rows, embeddingModel, dimension) => {
  if (!rows.length) return;

  const values = [];
  const params = [];
  let i = 1;
  for (const row of rows) {
    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}::vector, $${i++}, $${i++}, $${i++}, now(), now())`
    );
    params.push(
      row.chunk_type,
      row.chunk_id,
      row.section_id,
      row.law_name,
      row.section_number,
      `[${row.embedding.join(',')}]`,
      embeddingModel,
      dimension,
      row.content_hash || null
    );
  }

  await query(
    `INSERT INTO law_embeddings (
       chunk_type, chunk_id, section_id, law_name, section_number,
       embedding, embedding_model, embedding_dimension, content_hash, created_at, updated_at
     )
     VALUES ${values.join(', ')}
     ON CONFLICT (chunk_type, chunk_id, embedding_model)
     DO UPDATE SET
       section_id = EXCLUDED.section_id,
       law_name = EXCLUDED.law_name,
       section_number = EXCLUDED.section_number,
       embedding = EXCLUDED.embedding,
       embedding_dimension = EXCLUDED.embedding_dimension,
       content_hash = EXCLUDED.content_hash,
       updated_at = now()`,
    params
  );
};

/**
 * Coverage and integrity audit for law_embeddings vs v_laws_rag_chunks.
 */
const auditCoverage = async (embeddingModel) => {
  const pgvector = await isPgVectorAvailable();
  const chunks = await loadRagChunks();
  const chunkKey = (c) => `${c.chunk_type}:${c.chunk_id}`;

  const byLaw = {};
  for (const law of LAW_NAMES) byLaw[law] = { chunks: 0, embedded: 0 };
  for (const c of chunks) byLaw[c.law_name].chunks += 1;

  if (!pgvector || !(await tableExists())) {
    return {
      pgvector,
      tableExists: false,
      legalChunks: chunks.length,
      embeddings: 0,
      missingEmbeddings: chunks.length,
      orphanEmbeddings: 0,
      invalidSectionRefs: 0,
      duplicateChunks: 0,
      nullEmbeddings: 0,
      dimensionMismatches: 0,
      byLaw,
      embeddingModel: embeddingModel || null,
      storedDimension: null
    };
  }

  const params = embeddingModel ? [embeddingModel] : [];
  const modelClause = embeddingModel ? 'WHERE embedding_model = $1' : '';

  const embedded = await query(
    `SELECT chunk_type, chunk_id, section_id, law_name, embedding_dimension, content_hash
     FROM law_embeddings ${modelClause}`,
    params
  );

  const embeddedKeys = new Set();
  let orphanEmbeddings = 0;
  let invalidSectionRefs = 0;
  let nullEmbeddings = 0;
  let dimensionMismatches = 0;
  let duplicateChunks = 0;
  const storedDimension = embedded.rows[0]?.embedding_dimension ?? null;

  const chunkKeySet = new Set(chunks.map(chunkKey));
  const sectionIds = new Set(chunks.map((c) => c.section_id));
  const seen = new Set();

  for (const row of embedded.rows) {
    const key = `${row.chunk_type}:${row.chunk_id}`;
    if (seen.has(key)) duplicateChunks += 1;
    seen.add(key);
    embeddedKeys.add(key);
    if (!chunkKeySet.has(key)) orphanEmbeddings += 1;
    if (!sectionIds.has(row.section_id)) invalidSectionRefs += 1;
    if (row.embedding_dimension == null) nullEmbeddings += 1;
    else if (storedDimension && row.embedding_dimension !== storedDimension) dimensionMismatches += 1;
    if (byLaw[row.law_name]) byLaw[row.law_name].embedded += 1;
  }

  const missingEmbeddings = chunks.filter((c) => !embeddedKeys.has(chunkKey(c))).length;

  const { rows: invalidSections } = await query(
    `SELECT COUNT(*)::int AS n
     FROM law_embeddings le
     LEFT JOIN laws_sections ls ON ls.id = le.section_id
     ${modelClause ? `${modelClause} AND` : 'WHERE'} ls.id IS NULL`,
    params
  );

  return {
    pgvector,
    tableExists: true,
    legalChunks: chunks.length,
    embeddings: embedded.rows.length,
    missingEmbeddings,
    orphanEmbeddings,
    invalidSectionRefs: invalidSections[0]?.n ?? invalidSectionRefs,
    duplicateChunks,
    nullEmbeddings,
    dimensionMismatches,
    byLaw,
    embeddingModel: embeddingModel || embedded.rows[0]?.embedding_model || null,
    storedDimension
  };
};

/**
 * Vector similarity search over law_embeddings, collapsed to parent section codes.
 * Keeps strongest chunk score and matched chunk metadata per section.
 * @returns {Promise<Array<{code: string, sectionId: number|null, sectionNumber: string, score: number, matchedChunks: object[]}>>}
 */
const searchSimilarSectionsDetailed = async (queryEmbedding, embeddingModel, topK = 15) => {
  const stats = await getEmbeddingStats(embeddingModel);
  if (!stats.pgvector || stats.count === 0) return [];

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const { rows } = await query(
    `SELECT chunk_type, chunk_id, section_id, law_name, section_number,
            1 - (embedding <=> $1::vector) AS score
     FROM law_embeddings
     WHERE embedding_model = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral, embeddingModel, Math.max(topK * 6, topK)]
  );

  const byCode = new Map();
  for (const row of rows) {
    const code = toCanonicalCode(row.law_name, row.section_number);
    if (!code) continue;
    const chunkMeta = {
      chunkType: row.chunk_type,
      chunkId: Number(row.chunk_id),
      score: Number(row.score)
    };
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, {
        code,
        sectionId: row.section_id ?? null,
        sectionNumber: code.split(' ')[1],
        score: Number(row.score),
        matchedChunks: [chunkMeta]
      });
      continue;
    }
    existing.matchedChunks.push(chunkMeta);
    if (row.score > existing.score) {
      existing.score = Number(row.score);
      existing.sectionId = row.section_id ?? existing.sectionId;
    }
  }

  return [...byCode.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
};

/** @deprecated Prefer searchSimilarSectionsDetailed for hybrid RAG metadata. */
const searchSimilarSections = async (queryEmbedding, embeddingModel, topK = 15) => {
  const detailed = await searchSimilarSectionsDetailed(queryEmbedding, embeddingModel, topK);
  return detailed.map(({ code, sectionNumber, score }) => ({ code, sectionNumber, score }));
};

const dedupeFtsRowsToSections = (rows, topK) => {
  const byCode = new Map();
  for (const row of rows) {
    const code = toCanonicalCode(row.law_name, row.section_number);
    if (!code) continue;
    const rank = Number(row.rank) || 0;
    const existing = byCode.get(code);
    if (!existing || rank > existing.ftsScore) {
      byCode.set(code, { code, sectionNumber: code.split(' ')[1], ftsScore: rank });
    }
  }
  return [...byCode.values()]
    .sort((a, b) => b.ftsScore - a.ftsScore)
    .slice(0, topK)
    .map((r) => ({
      ...r,
      // Normalize FTS rank to a 0–1-ish score for logging/merging.
      score: r.ftsScore / (r.ftsScore + 1)
    }));
};

module.exports = {
  LAW_NAMES,
  toCanonicalCode,
  hashContent,
  isPgVectorAvailable,
  getPgVectorExtensionInfo,
  getEmbeddingStats,
  ensureSchema,
  tableExists,
  loadRagChunks,
  listEmbeddedChunkKeys,
  listEmbeddedChunkHashes,
  upsertBatch,
  searchSimilarSections,
  searchSimilarSectionsDetailed,
  dedupeFtsRowsToSections,
  auditCoverage
};
