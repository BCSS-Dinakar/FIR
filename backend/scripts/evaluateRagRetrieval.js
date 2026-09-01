#!/usr/bin/env node
/**
 * Evaluate hybrid RAG candidate recall with ablation modes.
 *
 * Usage:
 *   node scripts/evaluateRagRetrieval.js
 *   node scripts/evaluateRagRetrieval.js --cases backend/eval/rag_cases.json
 *   node scripts/evaluateRagRetrieval.js --mode D
 *
 * Modes:
 *   A = BM25 only
 *   B = BM25 + FTS
 *   C = BM25 + FTS + Trigram
 *   D = BM25 + FTS + Trigram + Semantic (full hybrid)
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { retrieveHybridCandidates } = require('../services/ragRetrievalService');
const bnsCatalogService = require('../services/bnsCatalogService');

const MODES = {
  A: { bm25: true, fts: false, trigram: false, semantic: false },
  B: { bm25: true, fts: true, trigram: false, semantic: false },
  C: { bm25: true, fts: true, trigram: true, semantic: false },
  D: { bm25: true, fts: true, trigram: true, semantic: true }
};

const RECALL_AT = [5, 10, 20, 30];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    casesPath: path.join(__dirname, '../eval/rag_cases.json'),
    mode: null
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cases' && args[i + 1]) options.casesPath = args[++i];
    if (args[i] === '--mode' && args[i + 1]) options.mode = args[++i].toUpperCase();
  }
  return options;
};

const loadCases = (casesPath) => {
  const raw = fs.readFileSync(casesPath, 'utf8');
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error(`No evaluation cases found in ${casesPath}`);
  }
  return cases;
};

const recallAtK = (retrievedCodes, expectedCodes, k) => {
  if (!expectedCodes.length) return null;
  const top = retrievedCodes.slice(0, k);
  return expectedCodes.some((code) => top.includes(code));
};

const evaluateModeDetailed = async (cases, modeKey, sources) => {
  const recalls = Object.fromEntries(RECALL_AT.map((k) => [`@${k}`, []]));
  const perCase = [];
  let evaluated = 0;

  for (const testCase of cases) {
    if (!testCase.expectedCodes?.length) continue;
    evaluated++;

    const { candidates } = await retrieveHybridCandidates(testCase.facts, {
      sources,
      log: false,
      limits: { final: 30 }
    });
    const codes = candidates.map((c) => c.code);
    const hitAt = {};
    for (const k of RECALL_AT) {
      const hit = recallAtK(codes, testCase.expectedCodes, k);
      recalls[`@${k}`].push(hit);
      hitAt[k] = hit;
    }
    perCase.push({ id: testCase.id, codes, hitAt, expected: testCase.expectedCodes });
  }

  const summary = { mode: modeKey, cases: evaluated, perCase };
  for (const k of RECALL_AT) {
    const hits = recalls[`@${k}`].filter(Boolean).length;
    summary[`recall${k}`] = evaluated ? hits / evaluated : 0;
  }
  return summary;
};

const compareModes = (modeC, modeD) => {
  const improvements = [];
  const regressions = [];
  for (let i = 0; i < modeC.perCase.length; i++) {
    const c = modeC.perCase[i];
    const d = modeD.perCase[i];
    const cMiss = !c.hitAt[20];
    const dHit = d.hitAt[20];
    const cHit = c.hitAt[20];
    const dMiss = !d.hitAt[20];
    if (cMiss && dHit) improvements.push({ id: c.id, expected: c.expected, dRank: d.codes.findIndex((x) => c.expected.includes(x)) + 1 });
    if (cHit && dMiss) regressions.push({ id: c.id, expected: c.expected });
  }
  return { improvements, regressions };
};

const run = async () => {
  const { casesPath, mode } = parseArgs();
  const cases = loadCases(casesPath);
  console.log(`Loaded ${cases.length} evaluation case(s) from ${casesPath}`);

  const modesToRun = mode ? { [mode]: MODES[mode] } : MODES;
  if (mode && !MODES[mode]) {
    throw new Error(`Unknown mode "${mode}". Use one of: ${Object.keys(MODES).join(', ')}`);
  }

  const results = [];
  let modeCDetail = null;
  let modeDDetail = null;

  for (const [modeKey, sources] of Object.entries(modesToRun)) {
    console.log(`\nEvaluating mode ${modeKey} (${Object.entries(sources).filter(([, v]) => v).map(([k]) => k).join(' + ')})...`);
    const detailed = await evaluateModeDetailed(cases, modeKey, sources);
    const { perCase, ...summary } = detailed;
    results.push(summary);
    if (modeKey === 'C') modeCDetail = detailed;
    if (modeKey === 'D') modeDDetail = detailed;
    for (const k of RECALL_AT) {
      console.log(`  Recall@${k}: ${(summary[`recall${k}`] * 100).toFixed(1)}%`);
    }
  }

  if (modeCDetail && modeDDetail) {
    const { improvements, regressions } = compareModes(modeCDetail, modeDDetail);
    console.log('\n=== Mode C vs D (Recall@20) ===');
    console.log(`Semantic improvements (C miss → D hit): ${improvements.length}`);
    improvements.slice(0, 8).forEach((x) =>
      console.log(`  + ${x.id} expected ${x.expected.join('|')} @ rank ${x.dRank}`)
    );
    console.log(`Semantic regressions (C hit → D miss): ${regressions.length}`);
    regressions.slice(0, 8).forEach((x) =>
      console.log(`  - ${x.id} expected ${x.expected.join('|')}`)
    );
  }

  console.log('\n=== Ablation summary ===');
  console.table(results.map((r) => ({
    mode: r.mode,
    cases: r.cases,
    '@5': `${(r.recall5 * 100).toFixed(1)}%`,
    '@10': `${(r.recall10 * 100).toFixed(1)}%`,
    '@20': `${(r.recall20 * 100).toFixed(1)}%`,
    '@30': `${(r.recall30 * 100).toFixed(1)}%`
  })));

  await bnsCatalogService.closeConnection();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
