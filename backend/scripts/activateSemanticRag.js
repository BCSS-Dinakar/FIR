#!/usr/bin/env node
/**
 * End-to-end semantic RAG activation orchestrator.
 *
 * Usage: npm run db:activate-semantic-rag
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('child_process');
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const {
  isEmbeddingConfigured,
  getEmbeddingModelId,
  probeEmbeddingEndpoint
} = require('../services/embeddingService');
const bnsCatalogService = require('../services/bnsCatalogService');

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

const run = async () => {
  const blockers = [];

  step(1, 'Check pgvector extension');
  const ext = await lawEmbeddingsRepo.getPgVectorExtensionInfo();
  if (ext) {
    console.log(`  PASS — vector v${ext.extversion}`);
  } else {
    const avail = await require('../config/postgres').query(
      "SELECT * FROM pg_available_extensions WHERE name = 'vector'"
    );
    if (!avail.rows.length) {
      console.log('  BLOCKED — pgvector package not installed on PostgreSQL host.');
      console.log('  DBA: SSH to 103.211.36.242 and run:');
      console.log('    sudo bash backend/scripts/dba/install-pgvector-ubuntu.sh');
      blockers.push('pgvector package missing on PostgreSQL server');
    } else {
      console.log('  BLOCKED — extension available but not enabled.');
      console.log('  DBA: sudo -u postgres psql -d legislative -c "CREATE EXTENSION vector;"');
      blockers.push('pgvector not enabled');
    }
  }

  step(2, 'Check embedding configuration');
  if (!isEmbeddingConfigured()) {
    console.log('  BLOCKED — set EMBEDDING_BASE_URL + EMBEDDING_MODEL in backend/.env');
    console.log('  Start local TEI: docker compose -f docker/docker-compose.embeddings.yml up -d');
    console.log('  Then set EMBEDDING_BASE_URL=http://127.0.0.1:8080/v1');
    blockers.push('EMBEDDING_* not configured');
  } else {
    console.log(`  model=${getEmbeddingModelId()} url=${process.env.EMBEDDING_BASE_URL}`);
    const probe = await probeEmbeddingEndpoint();
    if (probe.ok) {
      console.log(`  PASS — dim=${probe.dimension} latency=${probe.latencyMs.toFixed(0)}ms`);
    } else {
      console.log(`  BLOCKED — ${probe.error}`);
      blockers.push(`embedding endpoint: ${probe.error}`);
    }
  }

  if (blockers.length) {
    console.log('\n=== Cannot proceed with ingestion ===');
    blockers.forEach((b) => console.log(`  • ${b}`));
    await bnsCatalogService.closeConnection();
    process.exit(1);
  }

  step(3, 'Run embedding ingestion');
  try {
    execSync('node scripts/ingestLawEmbeddings.js', { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });
  } catch {
    blockers.push('ingestion failed');
  }

  step(4, 'Audit coverage');
  execSync('node scripts/auditLawEmbeddings.js', { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });

  step(5, 'Validate hybrid RAG');
  execSync('node scripts/validatePgVectorRag.js', { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });

  step(6, 'Integrity tests');
  execSync('node scripts/validateHybridRagIntegrity.js', { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });

  console.log('\n=== Semantic RAG activation complete ===');
  await bnsCatalogService.closeConnection();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
