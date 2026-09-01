/**
 * Live integration tests for the BNS RAG pipeline (bnsRagService): correct
 * recommendation for clear-cut facts, and false-positive resistance for facts that
 * share vocabulary with a section but don't satisfy its legal elements.
 *
 * Requires: VLLM_* configured. Hybrid retrieval uses BM25 + PostgreSQL FTS + trigram
 * + optional pgvector (independent paths, RRF fusion) when EMBEDDING_* is set.
 *
 * Usage: node scripts/test_bns_rag.js
 */
require('dotenv').config({ quiet: true });
const bnsRagService = require('../services/bnsRagService');
const bnsCatalogService = require('../services/bnsCatalogService');

const cases = [
  {
    name: 'Test 1 — clear hurt case should recommend a hurt section',
    facts: 'The accused, in a fit of anger during an argument, slapped the complainant twice across the face and punched him in the chest, causing pain and a swollen cheek. No weapon was used and no fracture occurred.',
    expectCodes: ['BNS 115', 'BNS 117', 'BNS 114'],
    expectNotCodes: ['BNS 103', 'BNS 74']
  },
  {
    name: 'Test 1 — clear cheating case should recommend a cheating section',
    facts: 'The accused approached the complainant claiming to sell a plot of land, collected Rs. 5,00,000 as advance payment using a fake sale deed, and then stopped responding. The land the accused showed did not belong to him.',
    expectCodes: ['BNS 318'],
    expectNotCodes: ['BNS 303']
  },
  {
    name: 'Test 8 — generic argument with no physical contact must NOT trigger assault/hurt',
    facts: 'The accused and complainant, who are neighbours, had a heated verbal argument over a parking spot. Both raised their voices and exchanged insults. No one touched the other.',
    expectCodes: [],
    expectNotCodes: ['BNS 115', 'BNS 117', 'BNS 74']
  },
  {
    name: 'Test 8 — "death" mentioned in an unrelated context must NOT trigger murder',
    facts: 'The complainant states that after her father\'s death last year, the accused (her uncle) refused to hand over her share of the inherited property and has been verbally threatening to evict her from the house.',
    expectCodes: [],
    expectNotCodes: ['BNS 103']
  },
  {
    name: 'Test 8 — property mentioned in a rental dispute must NOT trigger theft',
    facts: 'The complainant, a tenant, alleges the landlord (accused) has refused to return the security deposit of Rs. 20,000 after the complainant vacated the rented flat, despite repeated requests.',
    expectCodes: [],
    expectNotCodes: ['BNS 303']
  },
  {
    name: 'Test 8 — no dowry/marital cruelty facts must NOT trigger dowry sections',
    facts: 'The complainant states that his business partner (the accused) has stopped sharing profits from their jointly run shop for the last six months despite repeated requests for accounts.',
    expectCodes: [],
    expectNotCodes: ['BNS 85', 'BNS 84']
  }
];

const run = async () => {
  let passed = 0;
  let failed = 0;
  const allScores = [];

  for (const c of cases) {
    console.log(`\n--- ${c.name} ---`);
    try {
      const candidates = await bnsRagService.retrieveCandidates(c.facts);
      const reranked = await bnsRagService.rerankSections(c.facts, candidates);
      allScores.push(...candidates.map((cand) => cand.similarity).filter((s) => typeof s === 'number'));

      const resultCodes = reranked
        .filter((r) => r.confidence >= bnsRagService.CONFIDENCE_THRESHOLD)
        .map((r) => r.code);

      const fmt = (x) => {
        const parts = [];
        if (x.semanticScore != null) parts.push(`sem${x.semanticScore.toFixed(3)}`);
        else if (x.vectorScore != null) parts.push(`sem${x.vectorScore.toFixed(3)}`);
        if (x.ftsScore != null) parts.push(`fts${x.ftsScore.toFixed(3)}`);
        if (x.bm25Score != null) parts.push(`bm25${x.bm25Score.toFixed(1)}`);
        else if (x.lexicalScore != null) parts.push(`bm25${x.lexicalScore.toFixed(1)}`);
        if (x.trigramScore != null) parts.push(`trg${x.trigramScore.toFixed(3)}`);
        const src = x.retrievalMeta?.sources?.join('+') || '';
        return `${x.code}${src ? `[${src}]` : ''}[${parts.join('/')}]`;
      };
      console.log(`  Retrieved ${candidates.length} candidates: ${candidates.slice(0, 8).map(fmt).join(', ')}`);
      console.log(`  Reranked (all, pre-threshold): ${reranked.map((r) => `${r.code}:${r.confidence}`).join(', ') || '(none)'}`);
      console.log(`  Final recommendations (>= ${bnsRagService.CONFIDENCE_THRESHOLD}): ${resultCodes.join(', ') || '(none)'}`);

      let ok = true;
      if (c.expectCodes.length > 0 && !c.expectCodes.some((code) => resultCodes.includes(code))) {
        console.log(`  FAIL: expected one of [${c.expectCodes}] to be recommended`);
        ok = false;
      }
      const falsePositives = c.expectNotCodes.filter((code) => resultCodes.includes(code));
      if (falsePositives.length > 0) {
        console.log(`  FAIL: false positive(s) recommended: ${falsePositives}`);
        ok = false;
      }
      if (ok) {
        console.log('  PASS');
        passed++;
      } else {
        failed++;
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      failed++;
    }
  }

  if (allScores.length > 0) {
    const sorted = [...allScores].sort((a, b) => a - b);
    console.log(`\nEmbedding similarity distribution across all retrieved candidates: min=${sorted[0].toFixed(3)} p50=${sorted[Math.floor(sorted.length / 2)].toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await bnsCatalogService.closeConnection();
  process.exit(failed > 0 ? 1 : 0);
};

run();
