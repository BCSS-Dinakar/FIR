#!/usr/bin/env node
/**
 * Validate PostgreSQL RAG infrastructure: pgvector, law_embeddings, FTS, hybrid retrieval.
 *
 * Usage: node scripts/validatePgVectorRag.js
 */
require('dotenv').config({ quiet: true });
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const lawsRepo = require('../repositories/lawsRepo');
const { getEmbeddingModelId } = require('../services/embeddingService');
const bnsRagService = require('../services/bnsRagService');
const bnsCatalogService = require('../services/bnsCatalogService');

const semanticQueries = [
  "taking someone's mobile by threatening them",
  'person threatened with a knife and robbed',
  'unauthorized taking of property through intimidation'
];

const run = async () => {
  console.log('=== 1. pgvector extension ===');
  const pgvector = await lawEmbeddingsRepo.isPgVectorAvailable();
  console.log('pgvector installed:', pgvector);
  if (pgvector) {
    try {
      const { query } = require('../config/postgres');
      const t = await query(`SELECT '[1,2,3]'::vector AS v`);
      console.log('vector cast ok:', t.rows[0].v);
    } catch (e) {
      console.log('vector cast failed:', e.message);
    }
  }

  console.log('\n=== 2. law_embeddings stats ===');
  const model = getEmbeddingModelId();
  const stats = await lawEmbeddingsRepo.getEmbeddingStats(model);
  console.log(stats);

  const { rows: chunkCount } = await require('../config/postgres').query(
    `SELECT COUNT(*)::int AS n FROM v_laws_rag_chunks WHERE law_name = ANY($1::text[])`,
    [lawEmbeddingsRepo.LAW_NAMES]
  );
  console.log('v_laws_rag_chunks count:', chunkCount[0].n);
  if (stats.count > 0) {
    console.log('chunk coverage:', `${stats.count}/${chunkCount[0].n}`);
  }

  console.log('\n=== 3. FTS retrieval (search_laws_rag) ===');
  for (const q of ['theft', 'hurt', 'BNS 115']) {
    const rows = await lawsRepo.searchLawsRag(q, 'BNS', 3);
    console.log(`  ${q}:`, rows.map((r) => `${r.law_name} ${r.section_number}`).join(', ') || '(none)');
  }

  console.log('\n=== 4. Semantic FTS probes ===');
  for (const q of semanticQueries) {
    const rows = await lawsRepo.searchLawsRag(q, 'BNS', 5);
    const codes = lawEmbeddingsRepo.dedupeFtsRowsToSections(rows, 5).map((r) => r.code);
    console.log(`  "${q.slice(0, 50)}..." ->`, codes.join(', ') || '(none)');
  }

  console.log('\n=== 5. Hybrid retrieveCandidates ===');
  const facts =
    'The accused threatened the complainant with a knife and forcibly took his mobile phone.';
  const candidates = await bnsRagService.retrieveCandidates(facts);
  console.log(
    '  candidates:',
    candidates.slice(0, 8).map((c) => {
      const parts = [];
      if (c.vectorScore != null) parts.push(`v${c.vectorScore.toFixed(3)}`);
      if (c.ftsScore != null) parts.push(`f${c.ftsScore.toFixed(3)}`);
      if (c.lexicalScore != null) parts.push(`k${c.lexicalScore.toFixed(1)}`);
      return `${c.code}[${parts.join('/')}]`;
    }).join(', ')
  );

  await bnsCatalogService.closeConnection();
  console.log('\nValidation complete.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
