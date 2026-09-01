const { query } = require('../config/postgres');

const LAW_NAMES = ['BNS', 'BNSS', 'BSA'];

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
  const { rows } = await query(
    `SELECT chunk_type, chunk_id
     FROM law_embeddings
     WHERE embedding_model = $1`,
    [embeddingModel]
  );
  return new Set(rows.map((r) => `${r.chunk_type}:${r.chunk_id}`));
};

const upsertBatch = async (rows, embeddingModel, dimension) => {
  if (!rows.length) return;

  const values = [];
  const params = [];
  let i = 1;
  for (const row of rows) {
    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}::vector, $${i++}, $${i++}, now(), now())`
    );
    params.push(
      row.chunk_type,
      row.chunk_id,
      row.section_id,
      row.law_name,
      row.section_number,
      `[${row.embedding.join(',')}]`,
      embeddingModel,
      dimension
    );
  }

  await query(
    `INSERT INTO law_embeddings (
       chunk_type, chunk_id, section_id, law_name, section_number,
       embedding, embedding_model, embedding_dimension, created_at, updated_at
     )
     VALUES ${values.join(', ')}
     ON CONFLICT (chunk_type, chunk_id, embedding_model)
     DO UPDATE SET
       section_id = EXCLUDED.section_id,
       law_name = EXCLUDED.law_name,
       section_number = EXCLUDED.section_number,
       embedding = EXCLUDED.embedding,
       embedding_dimension = EXCLUDED.embedding_dimension,
       updated_at = now()`,
    params
  );
};

/**
 * Vector similarity search over law_embeddings, deduped to best chunk per section code.
 * @returns {Promise<Array<{code: string, sectionNumber: string, score: number}>>}
 */
const searchSimilarSections = async (queryEmbedding, embeddingModel, topK = 15) => {
  const stats = await getEmbeddingStats(embeddingModel);
  if (!stats.pgvector || stats.count === 0) return [];

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const { rows } = await query(
    `SELECT chunk_type, chunk_id, law_name, section_number,
            1 - (embedding <=> $1::vector) AS score
     FROM law_embeddings
     WHERE embedding_model = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral, embeddingModel, Math.max(topK * 4, topK)]
  );

  const byCode = new Map();
  for (const row of rows) {
    const code = toCanonicalCode(row.law_name, row.section_number);
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing || row.score > existing.score) {
      byCode.set(code, {
        code,
        sectionNumber: code.split(' ')[1],
        score: Number(row.score)
      });
    }
  }

  return [...byCode.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
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
  isPgVectorAvailable,
  getEmbeddingStats,
  ensureSchema,
  loadRagChunks,
  listEmbeddedChunkKeys,
  upsertBatch,
  searchSimilarSections,
  dedupeFtsRowsToSections
};
