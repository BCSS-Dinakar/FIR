#!/usr/bin/env node
/**
 * Ingest legal RAG chunk embeddings into PostgreSQL (law_embeddings + pgvector).
 *
 * Prerequisites:
 *   - pgvector extension installed: CREATE EXTENSION vector;
 *   - EMBEDDING_BASE_URL + EMBEDDING_MODEL configured (NOT the Qwen chat model)
 *
 * Usage: node scripts/ingestLawEmbeddings.js
 */
require('dotenv').config({ quiet: true });
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const {
  generateEmbeddingsBatch,
  getEmbeddingModelId,
  EmbeddingNotConfiguredError
} = require('../services/embeddingService');
const bnsCatalogService = require('../services/bnsCatalogService');

const chunkKey = (c) => `${c.chunk_type}:${c.chunk_id}`;

const run = async () => {
  const embeddingModel = getEmbeddingModelId();
  if (!embeddingModel) {
    throw new EmbeddingNotConfiguredError();
  }

  const pgvector = await lawEmbeddingsRepo.isPgVectorAvailable();
  if (!pgvector) {
    throw new Error(
      'pgvector is not installed on PostgreSQL. Hybrid FTS retrieval works without it; ' +
      'install pgvector and re-run this script for dense vector search.'
    );
  }

  const chunks = await lawEmbeddingsRepo.loadRagChunks();
  console.log(`Loaded ${chunks.length} RAG chunks from v_laws_rag_chunks.`);

  const embeddedKeys = await lawEmbeddingsRepo.listEmbeddedChunkKeys(embeddingModel);
  const missing = chunks.filter((c) => !embeddedKeys.has(chunkKey(c)));
  console.log(`${embeddedKeys.size} already embedded, ${missing.length} missing for model "${embeddingModel}".`);

  if (missing.length === 0) {
    const stats = await lawEmbeddingsRepo.getEmbeddingStats(embeddingModel);
    console.log(`Nothing to ingest. law_embeddings: ${stats.count} rows, dim=${stats.dimension}`);
    return;
  }

  const texts = missing.map((c) => String(c.content || '').slice(0, 6000));
  let dimension = null;
  let ingested = 0;

  await generateEmbeddingsBatch(texts, async (batchVectors, batchStartIndex) => {
    if (!dimension) {
      dimension = batchVectors[0]?.length;
      if (!dimension) throw new Error('Embedding API returned empty vectors.');
      await lawEmbeddingsRepo.ensureSchema(dimension, embeddingModel);
      console.log(`Ensured law_embeddings schema (dimension=${dimension}, model=${embeddingModel}).`);
    }

    const rows = batchVectors.map((embedding, j) => {
      const chunk = missing[batchStartIndex + j];
      return {
        chunk_type: chunk.chunk_type,
        chunk_id: chunk.chunk_id,
        section_id: chunk.section_id,
        law_name: chunk.law_name,
        section_number: chunk.section_number,
        embedding
      };
    });

    await lawEmbeddingsRepo.upsertBatch(rows, embeddingModel, dimension);
    ingested += rows.length;
    console.log(`  ...${ingested}/${missing.length} embedded and saved to PostgreSQL`);
  });

  const stats = await lawEmbeddingsRepo.getEmbeddingStats(embeddingModel);
  console.log(`Done. law_embeddings: ${stats.count} rows, model=${stats.model}, dim=${stats.dimension}`);
};

run()
  .catch((err) => {
    console.error('Ingestion failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => bnsCatalogService.closeConnection());
