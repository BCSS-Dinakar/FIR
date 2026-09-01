#!/usr/bin/env node
/**
 * Ingest legal RAG chunk embeddings into PostgreSQL (law_embeddings + pgvector).
 *
 * Restartable, batch-based, idempotent (skips unchanged chunks via content_hash).
 *
 * Usage: npm run db:ingest-embeddings
 */
require('dotenv').config({ quiet: true });
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const {
  generateEmbeddingsBatch,
  getEmbeddingModelId,
  probeEmbeddingEndpoint,
  EmbeddingNotConfiguredError
} = require('../services/embeddingService');
const bnsCatalogService = require('../services/bnsCatalogService');

const chunkKey = (c) => `${c.chunk_type}:${c.chunk_id}`;

const printReport = (report) => {
  console.log('\n=== Ingestion report ===');
  console.log(`Total chunks:           ${report.totalChunks}`);
  console.log(`Already up-to-date:     ${report.skipped}`);
  console.log(`To embed:               ${report.toEmbed}`);
  console.log(`Embedded successfully:  ${report.embedded}`);
  console.log(`Failed:                 ${report.failed}`);
  console.log(`Missing section IDs:    ${report.missingSectionIds}`);
  console.log(`Embedding model:        ${report.embeddingModel}`);
  console.log(`Embedding dimension:    ${report.dimension ?? 'n/a'}`);
  if (report.failures.length) {
    console.log('\nFailures (first 10):');
    report.failures.slice(0, 10).forEach((f) => console.log(`  - ${f}`));
  }
};

const run = async () => {
  const embeddingModel = getEmbeddingModelId();
  if (!embeddingModel) throw new EmbeddingNotConfiguredError();

  const pgvector = await lawEmbeddingsRepo.isPgVectorAvailable();
  if (!pgvector) {
    throw new Error(
      'pgvector is not installed on PostgreSQL. Ask your DBA to run:\n' +
      '  CREATE EXTENSION IF NOT EXISTS vector;'
    );
  }

  const probe = await probeEmbeddingEndpoint();
  if (!probe.ok) {
    throw new Error(`Embedding endpoint probe failed: ${probe.error}`);
  }
  console.log(
    `Embedding endpoint OK — model=${probe.model} dimension=${probe.dimension} latency=${probe.latencyMs.toFixed(0)}ms`
  );

  const chunks = await lawEmbeddingsRepo.loadRagChunks();
  const existingHashes = await lawEmbeddingsRepo.listEmbeddedChunkHashes(embeddingModel);
  const existingKeys = await lawEmbeddingsRepo.listEmbeddedChunkKeys(embeddingModel);

  let skipped = 0;
  let missingSectionIds = 0;
  const toProcess = [];

  for (const chunk of chunks) {
    if (!chunk.section_id) {
      missingSectionIds += 1;
      continue;
    }
    const key = chunkKey(chunk);
    const contentHash = lawEmbeddingsRepo.hashContent(chunk.content);
    if (existingKeys.has(key) && existingHashes.get(key) === contentHash) {
      skipped += 1;
      continue;
    }
    toProcess.push({ ...chunk, contentHash });
  }

  console.log(`Loaded ${chunks.length} RAG chunks from v_laws_rag_chunks.`);
  console.log(`${skipped} unchanged (content_hash match), ${toProcess.length} to embed.`);

  const report = {
    totalChunks: chunks.length,
    skipped,
    toEmbed: toProcess.length,
    embedded: 0,
    failed: 0,
    missingSectionIds,
    embeddingModel,
    dimension: probe.dimension,
    failures: []
  };

  if (toProcess.length === 0) {
    const audit = await lawEmbeddingsRepo.auditCoverage(embeddingModel);
    console.log('\nCoverage audit:');
    console.log(`  Legal chunks: ${audit.legalChunks}`);
    console.log(`  Embeddings:   ${audit.embeddings}`);
    console.log(`  Missing:      ${audit.missingEmbeddings}`);
    printReport(report);
    return;
  }

  const stats = await lawEmbeddingsRepo.getEmbeddingStats(embeddingModel);
  if (stats.count > 0 && stats.dimension && stats.dimension !== probe.dimension) {
    throw new Error(
      `Dimension mismatch: stored=${stats.dimension}, endpoint=${probe.dimension}. ` +
      'Truncate law_embeddings or switch back to the original model before re-ingesting.'
    );
  }

  await lawEmbeddingsRepo.ensureSchema(probe.dimension, embeddingModel);

  const texts = toProcess.map((c) => String(c.content || '').slice(0, 6000));
  const BATCH = parseInt(process.env.EMBEDDING_BATCH_SIZE || '50', 10);

  for (let i = 0; i < texts.length; i += BATCH) {
    const batchChunks = toProcess.slice(i, i + BATCH);
    const batchTexts = texts.slice(i, i + BATCH);

    try {
      const batchVectors = await generateEmbeddingsBatch(batchTexts);
      if (batchVectors[0]?.length !== probe.dimension) {
        throw new Error(
          `Batch returned dimension ${batchVectors[0]?.length}, expected ${probe.dimension}`
        );
      }

      const rows = batchVectors.map((embedding, j) => {
        const chunk = batchChunks[j];
        return {
          chunk_type: chunk.chunk_type,
          chunk_id: chunk.chunk_id,
          section_id: chunk.section_id,
          law_name: chunk.law_name,
          section_number: chunk.section_number,
          embedding,
          content_hash: chunk.contentHash
        };
      });

      await lawEmbeddingsRepo.upsertBatch(rows, embeddingModel, probe.dimension);
      report.embedded += rows.length;
      console.log(`  ...${report.embedded}/${toProcess.length} embedded and saved`);
    } catch (err) {
      report.failed += batchChunks.length;
      report.failures.push(`batch@${i}: ${err.message}`);
      console.warn(`  batch failed (${i}-${i + batchChunks.length}): ${err.message}`);
    }
  }

  const audit = await lawEmbeddingsRepo.auditCoverage(embeddingModel);
  console.log('\nPost-ingest coverage:');
  for (const law of lawEmbeddingsRepo.LAW_NAMES) {
    const row = audit.byLaw[law];
    console.log(`  ${law}: ${row.embedded}/${row.chunks} chunks embedded`);
  }
  console.log(`  Missing embeddings: ${audit.missingEmbeddings}`);
  console.log(`  Orphan embeddings:  ${audit.orphanEmbeddings}`);

  printReport(report);
  if (report.failed > 0) process.exitCode = 1;
};

run()
  .catch((err) => {
    console.error('Ingestion failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => bnsCatalogService.closeConnection());
