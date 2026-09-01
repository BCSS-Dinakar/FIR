#!/usr/bin/env node
/**
 * Probe the OpenAI-compatible /v1/embeddings endpoint.
 *
 * Usage: node scripts/testEmbeddingEndpoint.js
 */
require('dotenv').config({ quiet: true });
const { probeEmbeddingEndpoint, isEmbeddingConfigured } = require('../services/embeddingService');

const run = async () => {
  if (!isEmbeddingConfigured()) {
    console.error('NOT_CONFIGURED: set EMBEDDING_BASE_URL and EMBEDDING_MODEL in backend/.env');
    process.exit(1);
  }

  const tests = [
    'theft of movable property without consent',
    'cheating by deception and dishonest inducement',
    'criminal intimidation by threat of injury'
  ];

  console.log('=== Embedding endpoint probe ===');
  for (const text of tests) {
    const result = await probeEmbeddingEndpoint(text);
    if (result.ok) {
      console.log(`PASS — dim=${result.dimension} model=${result.model} latency=${result.latencyMs.toFixed(0)}ms`);
      console.log(`  query: "${text.slice(0, 60)}…"`);
    } else {
      console.log(`FAIL — ${result.error}`);
      process.exit(1);
    }
  }
  console.log('\nAll probes passed. Safe to run: npm run db:ingest-embeddings');
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
