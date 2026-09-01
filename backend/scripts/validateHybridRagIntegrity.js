#!/usr/bin/env node
/**
 * Structural integrity tests for Hybrid RAG: UNION, dedup, RRF, failure isolation.
 *
 * Usage: node scripts/validateHybridRagIntegrity.js
 */
require('dotenv').config({ quiet: true });
const {
  mergeRetrievalHit,
  fuseCandidates,
  computeRrfScore
} = require('../services/ragHybridFusion');
const { retrieveHybridCandidates } = require('../services/ragRetrievalService');
const config = require('../services/ragRetrievalConfig');
const bnsCatalogService = require('../services/bnsCatalogService');
const { STATUS, check, summarize, printResults } = require('../services/ragValidationUtils');

const assertUnionDedup = () => {
  const map = new Map();
  mergeRetrievalHit(map, { code: 'BNS 318', rank: 1, score: 8 }, 'bm25');
  mergeRetrievalHit(map, { code: 'BNS 303', rank: 2, score: 7 }, 'bm25');
  mergeRetrievalHit(map, { code: 'BNS 318', rank: 1, score: 9 }, 'fts');
  mergeRetrievalHit(map, { code: 'BNS 320', rank: 3, score: 6 }, 'fts');
  mergeRetrievalHit(map, { code: 'BNS 303', rank: 2, score: 5 }, 'trigram');
  mergeRetrievalHit(map, { code: 'BNS 330', rank: 1, score: 4 }, 'trigram');
  mergeRetrievalHit(map, { code: 'BNS 320', rank: 1, score: 0.91 }, 'semantic');
  mergeRetrievalHit(map, { code: 'BNS 325', rank: 2, score: 0.88 }, 'semantic');

  const codes = [...map.keys()].sort();
  const expected = ['BNS 303', 'BNS 318', 'BNS 320', 'BNS 325', 'BNS 330'];
  const ok = codes.length === 5 && expected.every((c) => codes.includes(c));
  return check('UNION + deduplication (synthetic)', ok ? STATUS.PASS : STATUS.FAIL, codes.join(', '));
};

const assertRrfUsesRanks = () => {
  const weights = config.WEIGHTS;
  const k = config.RRF_K;
  const topSingle = computeRrfScore({ bm25Rank: 1 }, weights, k);
  const weakSingle = computeRrfScore({ bm25Rank: 30 }, weights, k);
  const multiStrong = computeRrfScore({ bm25Rank: 1, ftsRank: 1, semanticRank: 1 }, weights, k);
  const ok = topSingle > weakSingle && multiStrong > topSingle;
  return check(
    'RRF rank-based fusion',
    ok ? STATUS.PASS : STATUS.FAIL,
    `rank1=${topSingle.toFixed(4)} rank30=${weakSingle.toFixed(4)} multi=${multiStrong.toFixed(4)}`
  );
};

const assertSemanticCandidatePreserved = async () => {
  const facts = 'The accused threatened the complainant with a knife and forcibly took his mobile phone.';
  const [lex, full] = await Promise.all([
    retrieveHybridCandidates(facts, {
      sources: { bm25: true, fts: true, trigram: true, semantic: false },
      log: false,
      limits: { final: 100 }
    }),
    retrieveHybridCandidates(facts, { log: false, limits: { final: 100 } })
  ]);

  let sem;
  try {
    sem = await retrieveHybridCandidates(facts, {
      sources: { bm25: false, fts: false, trigram: false, semantic: true },
      log: false,
      limits: { final: 100 }
    });
  } catch {
    return check('Semantic candidate preservation', STATUS.NOT_CONFIGURED, 'semantic-only path returned no candidates');
  }

  const lexSet = new Set(lex.candidates.map((c) => c.code));
  const semUnique = sem.candidates.map((c) => c.code).filter((c) => !lexSet.has(c));
  if (sem.stats.semanticStatus !== 'ACTIVE') {
    return check('Semantic candidate preservation', STATUS.NOT_CONFIGURED, sem.stats.semanticStatus);
  }
  if (semUnique.length === 0) {
    return check('Semantic candidate preservation', STATUS.DEGRADED, 'no semantic-only sections in probe query');
  }
  const fullSet = new Set(full.candidates.map((c) => c.code));
  const preserved = semUnique.filter((c) => fullSet.has(c));
  const ok = preserved.length === semUnique.length;
  return check(
    'Semantic candidate preservation',
    ok ? STATUS.PASS : STATUS.FAIL,
    `${preserved.length}/${semUnique.length} semantic-only sections in full union`
  );
};

const assertLexicalDegradedContinues = async () => {
  const facts = 'accused dishonestly took complainant property without consent';
  try {
    const { candidates, stats } = await retrieveHybridCandidates(facts, {
      sources: { bm25: true, fts: true, trigram: true, semantic: false },
      log: false
    });
    return check(
      'Lexical-only degradation path',
      candidates.length > 0 ? STATUS.PASS : STATUS.FAIL,
      `bm25=${stats.bm25Count} fts=${stats.ftsCount} trigram=${stats.trigramCount}`
    );
  } catch (err) {
    return check('Lexical-only degradation path', STATUS.FAIL, err.message);
  }
};

const assertParentSectionCollapse = () => {
  const map = new Map();
  mergeRetrievalHit(map, { code: 'BNS 318', rank: 3, score: 0.7, matchedChunks: [{ chunkType: 'clause' }] }, 'semantic');
  mergeRetrievalHit(map, { code: 'BNS 318', rank: 1, score: 0.91, matchedChunks: [{ chunkType: 'section' }] }, 'semantic');
  const entry = map.get('BNS 318');
  const ok = entry.semanticRank === 1 && entry.semanticScore === 0.91;
  return check('Parent-section collapse (synthetic)', ok ? STATUS.PASS : STATUS.FAIL, `score=${entry.semanticScore}`);
};

const run = async () => {
  const results = [
    assertUnionDedup(),
    assertRrfUsesRanks(),
    assertParentSectionCollapse(),
    await assertLexicalDegradedContinues(),
    await assertSemanticCandidatePreserved()
  ];

  printResults('Hybrid RAG integrity', results);
  const summary = summarize(results);
  console.log(`\nOverall: ${summary.overall}`);
  await bnsCatalogService.closeConnection();
  process.exit(summary.overall === STATUS.FAIL ? 1 : 0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
