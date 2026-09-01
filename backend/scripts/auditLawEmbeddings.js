#!/usr/bin/env node
/**
 * Audit law_embeddings coverage and integrity.
 *
 * Usage: npm run db:audit-embeddings
 */
require('dotenv').config({ quiet: true });
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const { getEmbeddingModelId, isEmbeddingConfigured } = require('../services/embeddingService');
const bnsCatalogService = require('../services/bnsCatalogService');

const run = async () => {
  const model = getEmbeddingModelId();
  const ext = await lawEmbeddingsRepo.getPgVectorExtensionInfo();

  console.log('=== pgvector ===');
  if (ext) console.log(`  PASS — vector v${ext.extversion}`);
  else {
    console.log('  NOT CONFIGURED — run as PostgreSQL superuser:');
    console.log('    CREATE EXTENSION IF NOT EXISTS vector;');
  }

  console.log('\n=== embedding config ===');
  if (isEmbeddingConfigured()) {
    console.log(`  model=${model}`);
  } else {
    console.log('  NOT CONFIGURED — set EMBEDDING_BASE_URL + EMBEDDING_MODEL');
  }

  const audit = await lawEmbeddingsRepo.auditCoverage(model);
  console.log('\n=== coverage report ===');
  console.log(`Legal chunks:          ${audit.legalChunks}`);
  console.log(`Embeddings:            ${audit.embeddings}`);
  console.log(`Missing embeddings:    ${audit.missingEmbeddings}`);
  console.log(`Orphan embeddings:     ${audit.orphanEmbeddings}`);
  console.log(`Invalid section refs:  ${audit.invalidSectionRefs}`);
  console.log(`Duplicate chunks:      ${audit.duplicateChunks}`);
  console.log(`NULL dimensions:       ${audit.nullEmbeddings}`);
  console.log(`Dimension mismatches:  ${audit.dimensionMismatches}`);
  console.log(`Stored dimension:      ${audit.storedDimension ?? 'n/a'}`);

  console.log('\n=== by law ===');
  for (const law of lawEmbeddingsRepo.LAW_NAMES) {
    const row = audit.byLaw[law];
    const pct = row.chunks ? ((row.embedded / row.chunks) * 100).toFixed(1) : '0.0';
    console.log(`  ${law}: ${row.embedded}/${row.chunks} (${pct}%)`);
  }

  const ready = audit.pgvector && audit.tableExists &&
    audit.missingEmbeddings === 0 && audit.orphanEmbeddings === 0 &&
    audit.invalidSectionRefs === 0 && audit.dimensionMismatches === 0 &&
    audit.embeddings > 0;

  console.log(`\nSemantic RAG ready: ${ready ? 'YES' : 'NO'}`);
  await bnsCatalogService.closeConnection();
  process.exit(ready ? 0 : 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
