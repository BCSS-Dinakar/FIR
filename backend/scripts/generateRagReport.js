#!/usr/bin/env node
/**
 * Generate final Hybrid RAG readiness report.
 *
 * Usage: npm run db:rag-report
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const {
  isEmbeddingConfigured,
  getEmbeddingModelId,
  probeEmbeddingEndpoint
} = require('../services/embeddingService');
const { retrieveHybridCandidates } = require('../services/ragRetrievalService');
const config = require('../services/ragRetrievalConfig');
const bnsCatalogService = require('../services/bnsCatalogService');

const run = async () => {
  const model = getEmbeddingModelId();
  const ext = await lawEmbeddingsRepo.getPgVectorExtensionInfo();
  const audit = await lawEmbeddingsRepo.auditCoverage(model);
  let embeddingProbe = null;
  if (isEmbeddingConfigured()) embeddingProbe = await probeEmbeddingEndpoint();

  const facts = 'The accused threatened the complainant with a knife and forcibly took his mobile phone.';
  const { candidates, stats } = await retrieveHybridCandidates(facts, { log: false });

  const report = {
    generatedAt: new Date().toISOString(),
    embeddingModel: model || '(not configured)',
    embeddingEndpoint: process.env.EMBEDDING_BASE_URL || '(not configured)',
    vectorDimension: audit.storedDimension ?? embeddingProbe?.dimension ?? null,
    pgvector: ext ? `v${ext.extversion}` : 'NOT INSTALLED',
    legalChunks: audit.legalChunks,
    embeddedChunks: audit.embeddings,
    missingEmbeddings: audit.missingEmbeddings,
    orphanEmbeddings: audit.orphanEmbeddings,
    retrieval: {
      bm25: stats.bm25Count,
      fts: stats.ftsCount,
      trigram: stats.trigramCount,
      vector: stats.semanticCount,
      semanticStatus: stats.semanticStatus,
      union: stats.unionCount,
      rrfFinal: stats.finalHybridCount,
      rrfLimit: config.FINAL_CANDIDATE_LIMIT,
      weights: config.WEIGHTS
    },
    latenciesMs: stats.latencies || {},
    topCandidates: candidates.slice(0, 5).map((c) => ({
      code: c.code,
      sources: c.sources,
      rrfScore: c.rrfScore
    })),
    productionReadiness: {
      pgvector: Boolean(ext),
      embeddingsIngested: audit.embeddings > 0 && audit.missingEmbeddings === 0,
      embeddingEndpoint: Boolean(embeddingProbe?.ok),
      semanticRetrieval: stats.semanticStatus === 'ACTIVE',
      lexicalRetrieval: stats.bm25Count > 0 || stats.ftsCount > 0 || stats.trigramCount > 0
    }
  };

  const outDir = path.join(__dirname, '../eval/reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `rag_report_${Date.now()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

  console.log('=== FIRAudit Hybrid RAG Report ===\n');
  console.log(`Embedding model:     ${report.embeddingModel}`);
  console.log(`Embedding endpoint:  ${report.embeddingEndpoint}`);
  console.log(`Vector dimension:    ${report.vectorDimension ?? 'n/a'}`);
  console.log(`pgvector:            ${report.pgvector}`);
  console.log(`Legal chunks:        ${report.legalChunks}`);
  console.log(`Embedded chunks:     ${report.embeddedChunks}`);
  console.log(`Missing embeddings:  ${report.missingEmbeddings}`);
  console.log(`\nBM25 / FTS / Trigram / Vector: ${report.retrieval.bm25} / ${report.retrieval.fts} / ${report.retrieval.trigram} / ${report.retrieval.vector}`);
  console.log(`Semantic status:     ${report.retrieval.semanticStatus}`);
  console.log(`RRF final limit:     ${report.retrieval.rrfFinal}/${report.retrieval.rrfLimit}`);
  if (report.latenciesMs.totalMs) {
    console.log(`Retrieval latency:   ${report.latenciesMs.totalMs.toFixed(0)}ms`);
  }
  console.log('\n=== Component status ===');
  const component = (active, label) => console.log(`  ${label}: ${active ? 'ACTIVE' : 'NOT ACTIVE'}`);
  component(Boolean(ext), 'pgvector');
  component(Boolean(embeddingProbe?.ok), 'Embedding service');
  component(audit.embeddings > 0 && audit.missingEmbeddings === 0, 'Semantic corpus');
  component(true, 'BM25');
  component(true, 'FTS');
  component(true, 'Trigram');
  component(stats.semanticStatus === 'ACTIVE', 'Semantic retrieval');
  component(stats.finalHybridCount > 0, 'RRF');
  component(Boolean(process.env.VLLM_BASE_URL && process.env.VLLM_MODEL), 'Qwen judge');
  console.log(`\nReport written: ${outFile}`);

  const ready = Object.values(report.productionReadiness).every(Boolean);
  console.log(`\nProduction ready (full semantic): ${ready ? 'YES' : 'NO — see blockers above'}`);
  if (!ext) console.log('  BLOCKER: pgvector extension not installed on PostgreSQL');
  if (!isEmbeddingConfigured()) console.log('  BLOCKER: EMBEDDING_* not configured');
  if (audit.missingEmbeddings > 0) console.log(`  BLOCKER: ${audit.missingEmbeddings} chunks not embedded`);

  await bnsCatalogService.closeConnection();
  process.exit(ready ? 0 : 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
