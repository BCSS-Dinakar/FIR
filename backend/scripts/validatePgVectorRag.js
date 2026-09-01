#!/usr/bin/env node
/**
 * Comprehensive Hybrid RAG validation with PASS / DEGRADED / NOT_CONFIGURED / FAIL.
 *
 * Usage: npm run db:validate-rag
 */
require('dotenv').config({ quiet: true });
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const {
  getEmbeddingModelId,
  isEmbeddingConfigured,
  probeEmbeddingEndpoint
} = require('../services/embeddingService');
const {
  retrieveHybridCandidates,
  retrieveBm25,
  retrieveFts,
  retrieveTrigram,
  retrieveSemantic
} = require('../services/ragRetrievalService');
const bnsCatalogService = require('../services/bnsCatalogService');
const config = require('../services/ragRetrievalConfig');
const { STATUS, check, summarize, printResults, timed } = require('../services/ragValidationUtils');

const SEMANTIC_TEST_QUERIES = [
  'accused dishonestly induced complainant to transfer money',
  'victim was deceived and persuaded to hand over money',
  'accused forcibly took the mobile phone from the victim',
  'accused threatened the complainant with harm unless money was paid',
  'unauthorized access to computer system and fraudulent online transaction'
];

const run = async () => {
  const results = [];

  // --- Infrastructure ---
  const ext = await lawEmbeddingsRepo.getPgVectorExtensionInfo();
  if (ext) {
    results.push(check('pgvector extension', STATUS.PASS, `v${ext.extversion}`));
  } else {
    results.push(check(
      'pgvector extension',
      STATUS.NOT_CONFIGURED,
      'DBA must run: CREATE EXTENSION IF NOT EXISTS vector;'
    ));
  }

  if (isEmbeddingConfigured()) {
    const probe = await probeEmbeddingEndpoint();
    if (probe.ok) {
      results.push(check(
        'embedding endpoint',
        STATUS.PASS,
        `${probe.model} dim=${probe.dimension} ${probe.latencyMs.toFixed(0)}ms`
      ));
    } else {
      results.push(check('embedding endpoint', STATUS.FAIL, probe.error));
    }
  } else {
    results.push(check(
      'embedding endpoint',
      STATUS.NOT_CONFIGURED,
      'Set EMBEDDING_BASE_URL + EMBEDDING_MODEL (e.g. BAAI/bge-m3)'
    ));
  }

  const model = getEmbeddingModelId();
  const embStats = await lawEmbeddingsRepo.getEmbeddingStats(model);
  const audit = await lawEmbeddingsRepo.auditCoverage(model);

  if (!audit.pgvector) {
    results.push(check('law_embeddings table', STATUS.NOT_CONFIGURED, 'requires pgvector'));
  } else if (!audit.tableExists || audit.embeddings === 0) {
    results.push(check(
      'law_embeddings corpus',
      STATUS.NOT_CONFIGURED,
      `${audit.legalChunks} chunks, 0 embeddings — run npm run db:ingest-embeddings`
    ));
  } else if (audit.missingEmbeddings > 0 || audit.orphanEmbeddings > 0 || audit.invalidSectionRefs > 0) {
    results.push(check(
      'law_embeddings corpus',
      STATUS.DEGRADED,
      `missing=${audit.missingEmbeddings} orphan=${audit.orphanEmbeddings} invalid_refs=${audit.invalidSectionRefs}`
    ));
  } else {
    results.push(check(
      'law_embeddings corpus',
      STATUS.PASS,
      `${audit.embeddings}/${audit.legalChunks} chunks dim=${audit.storedDimension}`
    ));
  }

  // --- Lexical paths ---
  const { result: bm25, latencyMs: bm25Ms } = await timed(() =>
    retrieveBm25('theft of movable property', 5)
  );
  results.push(check('BM25 retrieval', bm25.length ? STATUS.PASS : STATUS.FAIL, `${bm25.length} hits ${bm25Ms.toFixed(0)}ms`));

  const { result: fts, latencyMs: ftsMs } = await timed(() =>
    retrieveFts('theft of movable property', 5)
  );
  results.push(check('PostgreSQL FTS', fts.length ? STATUS.PASS : STATUS.FAIL, `${fts.length} hits ${ftsMs.toFixed(0)}ms`));

  const { result: trg, latencyMs: trgMs } = await timed(() =>
    retrieveTrigram('cheting dishonest takng', 5)
  );
  results.push(check('Trigram retrieval', trg.length ? STATUS.PASS : STATUS.FAIL, `${trg.length} hits ${trgMs.toFixed(0)}ms`));

  // --- Semantic path ---
  const { result: sem, latencyMs: semMs } = await timed(() =>
    retrieveSemantic('accused forcibly took mobile phone', 5)
  );
  const semStatus = sem.status;
  if (semStatus === 'ACTIVE' && sem.hits.length) {
    results.push(check('Semantic retrieval', STATUS.PASS, `${sem.hits.length} sections ${semMs.toFixed(0)}ms semantic_retrieval=ACTIVE`));
  } else if (semStatus === 'NOT_CONFIGURED' || semStatus === 'no_embeddings') {
    results.push(check('Semantic retrieval', STATUS.NOT_CONFIGURED, semStatus));
  } else {
    results.push(check('Semantic retrieval', STATUS.DEGRADED, semStatus));
  }

  // --- Semantic query probes ---
  if (semStatus === 'ACTIVE') {
    for (const q of SEMANTIC_TEST_QUERIES.slice(0, 3)) {
      const { hits } = await retrieveSemantic(q, 5);
      const codes = hits.map((h) => h.code).join(', ') || '(none)';
      results.push(check(`Semantic probe: "${q.slice(0, 40)}…"`, hits.length ? STATUS.PASS : STATUS.DEGRADED, codes));
    }
  }

  // --- Hybrid + RRF ---
  const knifeFacts = 'The accused threatened the complainant with a knife and forcibly took his mobile phone.';
  const { result: hybrid, latencyMs: hybridMs } = await timed(() =>
    retrieveHybridCandidates(knifeFacts, { log: false })
  );
  results.push(check(
    'Hybrid RRF retrieval',
    hybrid.candidates.length ? STATUS.PASS : STATUS.FAIL,
    `${hybrid.candidates.length} candidates union=${hybrid.stats.unionCount} ${hybridMs.toFixed(0)}ms`
  ));

  if (hybrid.stats.latencies) {
    const l = hybrid.stats.latencies;
    console.log('\n=== Retrieval latencies (ms) ===');
    console.log(`  bm25=${l.bm25Ms?.toFixed(1) ?? 'n/a'} fts=${l.ftsMs?.toFixed(1) ?? 'n/a'} ` +
      `trigram=${l.trigramMs?.toFixed(1) ?? 'n/a'} semantic=${l.semanticMs?.toFixed(1) ?? 'n/a'} ` +
      `fusion=${l.fusionMs?.toFixed(1) ?? 'n/a'} total=${l.totalMs?.toFixed(1) ?? 'n/a'}`);
  }

  // --- Independence: lexical-only vs semantic-only union ---
  const [lexOnly, semOnly] = await Promise.all([
    retrieveHybridCandidates(knifeFacts, {
      sources: { bm25: true, fts: true, trigram: true, semantic: false },
      log: false,
      limits: { final: 100 }
    }),
    retrieveHybridCandidates(knifeFacts, {
      sources: { bm25: false, fts: false, trigram: false, semantic: true },
      log: false,
      limits: { final: 100 }
    })
  ]);
  const lexCodes = new Set(lexOnly.candidates.map((c) => c.code));
  const semCodes = new Set(semOnly.candidates.map((c) => c.code));
  const semUnique = [...semCodes].filter((c) => !lexCodes.has(c));
  const full = await retrieveHybridCandidates(knifeFacts, { log: false, limits: { final: 100 } });
  const fullCodes = new Set(full.candidates.map((c) => c.code));
  const preserved = semUnique.every((c) => fullCodes.has(c));
  if (semStatus !== 'ACTIVE') {
    results.push(check('Lexical/semantic independence', STATUS.NOT_CONFIGURED, 'semantic path inactive'));
  } else if (semUnique.length === 0) {
    results.push(check('Lexical/semantic independence', STATUS.DEGRADED, 'no semantic-only unique sections in probe'));
  } else {
    results.push(check(
      'Lexical/semantic independence',
      preserved ? STATUS.PASS : STATUS.FAIL,
      `semantic-only unique preserved: ${semUnique.slice(0, 5).join(', ')}`
    ));
  }

  // --- Final candidate limit ---
  results.push(check(
    'RRF final limit',
    hybrid.candidates.length <= config.FINAL_CANDIDATE_LIMIT ? STATUS.PASS : STATUS.FAIL,
    `limit=${config.FINAL_CANDIDATE_LIMIT} got=${hybrid.candidates.length}`
  ));

  // --- Degraded mode: semantic unavailable should not break hybrid ---
  if (semStatus !== 'ACTIVE') {
    results.push(check(
      'Semantic failure degradation',
      hybrid.candidates.length > 0 ? STATUS.PASS : STATUS.FAIL,
      `semantic_retrieval=${semStatus}, lexical hybrid continues`
    ));
  }

  printResults('Hybrid RAG validation', results);
  const summary = summarize(results);
  console.log('\n=== Summary ===');
  console.log(`Overall: ${summary.overall}`);
  console.log(`PASS=${summary.counts.PASS} DEGRADED=${summary.counts.DEGRADED} ` +
    `NOT_CONFIGURED=${summary.counts.NOT_CONFIGURED} FAIL=${summary.counts.FAIL}`);

  if (audit.pgvector && audit.tableExists) {
    console.log('\n=== Corpus coverage ===');
    console.log(`Legal chunks:       ${audit.legalChunks}`);
    console.log(`Embeddings:         ${audit.embeddings}`);
    console.log(`Missing embeddings: ${audit.missingEmbeddings}`);
    console.log(`Orphan embeddings:  ${audit.orphanEmbeddings}`);
    console.log(`Invalid dimensions: ${audit.dimensionMismatches}`);
    for (const law of lawEmbeddingsRepo.LAW_NAMES) {
      const row = audit.byLaw[law];
      console.log(`  ${law}: ${row.embedded}/${row.chunks}`);
    }
  }

  await bnsCatalogService.closeConnection();
  process.exit(summary.overall === STATUS.FAIL ? 1 : 0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
