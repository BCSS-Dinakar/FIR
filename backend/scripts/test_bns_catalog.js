/**
 * Data-layer tests for the legal-section catalog service: dataset completeness
 * across all three acts (BNS/BNSS/BSA, read live from MongoDB
 * legal_database.laws_sections), cross-act code disambiguation, search relevance,
 * and the recommended/all consistency guarantees the SectionSelector UI depends on.
 * READ-ONLY against MongoDB.
 *
 * Usage: node scripts/test_bns_catalog.js
 */
require('dotenv').config({ quiet: true });
const assert = require('assert');
const bnsCatalogService = require('../services/bnsCatalogService');

let passed = 0;
let failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
};

const run = async () => {
  console.log('\n=== Complete catalog: all three acts, not BNS-only ===');
  await test('catalog has all 1059 sections from MongoDB (BNS+BNSS+BSA)', async () => {
    assert.strictEqual((await bnsCatalogService.getAllEntries()).length, 1059);
  });
  await test('catalog has no duplicate composite codes', async () => {
    const codes = (await bnsCatalogService.getAllEntries()).map((e) => e.code);
    assert.strictEqual(new Set(codes).size, codes.length);
  });
  await test('law distribution matches MongoDB: BNS 358 / BNSS 531 / BSA 170', async () => {
    const entries = await bnsCatalogService.getAllEntries();
    const counts = entries.reduce((acc, e) => ({ ...acc, [e.law]: (acc[e.law] || 0) + 1 }), {});
    assert.deepStrictEqual(counts, { BNS: 358, BNSS: 531, BSA: 170 });
  });

  console.log('\n=== Cross-act disambiguation: same number, different acts ===');
  await test('BNS 1, BNSS 1, and BSA 1 are three distinct entries', async () => {
    const [bns1, bnss1, bsa1] = await Promise.all([
      bnsCatalogService.getByCodePublic('BNS 1'),
      bnsCatalogService.getByCodePublic('BNSS 1'),
      bnsCatalogService.getByCodePublic('BSA 1')
    ]);
    assert.ok(bns1 && bnss1 && bsa1, 'all three should resolve');
    assert.notStrictEqual(bns1.title, bnss1.title);
    assert.notStrictEqual(bnss1.title, bsa1.title);
  });
  await test('a bare number with no act prefix defaults to BNS (backward compat)', async () => {
    const bare = await bnsCatalogService.getByCodePublic('323');
    const explicit = await bnsCatalogService.getByCodePublic('BNS 323');
    assert.strictEqual(bare.code, explicit.code);
  });
  await test('"BNSS 45" is not confused with "BNS 45" (word-boundary parsing)', async () => {
    const bnss45 = await bnsCatalogService.getByCodePublic('BNSS 45');
    const bns45 = await bnsCatalogService.getByCodePublic('BNS 45');
    assert.strictEqual(bnss45.law, 'BNSS');
    assert.strictEqual(bns45.law, 'BNS');
    assert.notStrictEqual(bnss45.title, bns45.title);
  });
  await test('search "1" returns BNS 1, BNSS 1, and BSA 1 among the top results', async () => {
    const { results } = await bnsCatalogService.searchCatalog('1', { limit: 5 });
    const codes = results.map((r) => r.code);
    assert.ok(codes.includes('BNS 1') && codes.includes('BNSS 1') && codes.includes('BSA 1'), codes.join(','));
  });
  await test('every catalog entry exposes law + act metadata', async () => {
    const entries = await bnsCatalogService.getAllEntries();
    const sample = entries.filter((e) => ['BNS', 'BNSS', 'BSA'].includes(e.law));
    assert.strictEqual(sample.length, entries.length);
    assert.ok(entries.every((e) => typeof e.act === 'string' && e.act.length > 0));
  });

  console.log('\n=== BNS 323 / BNS 354 (legacy) still resolvable ===');
  await test('BNS 323 resolves from bare number "323"', async () => {
    const e = await bnsCatalogService.getByCodePublic('323');
    assert.strictEqual(e.code, 'BNS 323');
  });
  await test('BNS 354 resolves from "BNS 354"', async () => {
    const e = await bnsCatalogService.getByCodePublic('BNS 354');
    assert.strictEqual(e.code, 'BNS 354');
  });

  console.log('\n=== Normalization collapses equivalent identifiers ===');
  await test('"BNS 323", "323", "BNS 323 (Voluntarily causing hurt)" all normalize to the same code', () => {
    assert.strictEqual(bnsCatalogService.normalizeToCode('BNS 323'), 'BNS 323');
    assert.strictEqual(bnsCatalogService.normalizeToCode('323'), 'BNS 323');
    assert.strictEqual(bnsCatalogService.normalizeToCode('BNS 323 (Voluntarily causing hurt)'), 'BNS 323');
  });

  console.log('\n=== No duplicates when the same section is both recommended and re-added ===');
  await test('resolveCodes dedupes equivalent identifiers for the same section', async () => {
    const resolved = await bnsCatalogService.resolveCodes(['323', 'BNS 323', 'BNS 323 (Voluntarily causing hurt)']);
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].code, 'BNS 323');
  });
  await test('resolveCodes keeps BNS 1 and BNSS 1 as separate entries', async () => {
    const resolved = await bnsCatalogService.resolveCodes(['BNS 1', 'BNSS 1']);
    assert.strictEqual(resolved.length, 2);
  });

  console.log('\n=== Remove-and-re-add — section stays discoverable in ALL after removal ===');
  await test('a section not currently recommended is still findable via ALL search', async () => {
    const { results } = await bnsCatalogService.searchCatalog('323', { limit: 10 });
    assert.ok(results.some((r) => r.code === 'BNS 323'));
  });

  console.log('\n=== Search relevance ===');
  await test('search "hurt" surfaces BNS 115 (Voluntarily causing hurt) near the top', async () => {
    const { results } = await bnsCatalogService.searchCatalog('hurt', { limit: 10 });
    const idx = results.findIndex((r) => r.code === 'BNS 115');
    assert.ok(idx !== -1 && idx < 5, `BNS 115 rank was ${idx}`);
  });
  await test('search "cheating" returns BNS 318 (Cheating)', async () => {
    const { results } = await bnsCatalogService.searchCatalog('cheating', { limit: 5 });
    assert.ok(results.some((r) => r.code === 'BNS 318'));
  });
  await test('search "forgery" returns a forgery section', async () => {
    const { results } = await bnsCatalogService.searchCatalog('forgery', { limit: 5 });
    assert.ok(results.some((r) => r.title.toLowerCase().includes('forgery')));
  });
  await test('search "arrest" returns a BNSS procedure section', async () => {
    const { results } = await bnsCatalogService.searchCatalog('arrest', { limit: 10 });
    assert.ok(results.some((r) => r.law === 'BNSS'), results.map((r) => r.code).join(','));
  });
  await test('search "dying declaration" returns a BSA evidence section', async () => {
    const { results } = await bnsCatalogService.searchCatalog('dying declaration', { limit: 10 });
    assert.ok(results.some((r) => r.law === 'BSA'), results.map((r) => r.code).join(','));
  });

  console.log('\n=== Backward compatibility: legacy free-text Petition.sections still resolve ===');
  await test('legacy "BNS 303 (Theft)" label resolves to canonical BNS 303', async () => {
    const [r] = await bnsCatalogService.resolveCodes(['BNS 303 (Theft)']);
    assert.strictEqual(r.code, 'BNS 303');
    assert.strictEqual(r.matched, true);
  });
  await test('an unrecognized legacy label is preserved (not silently dropped)', async () => {
    const [r] = await bnsCatalogService.resolveCodes(['BNS 9999 (Made Up)']);
    assert.strictEqual(r.matched, false);
    assert.strictEqual(r.code, 'BNS 9999');
  });

  console.log('\n=== Known numbering spot-checks (validates MongoDB data correctness) ===');
  const spotChecks = [
    ['BNS 74', 'modesty'],
    ['BNS 103', 'Punishment for murder'],
    ['BNS 115', 'Voluntarily causing hurt'],
    ['BNS 303', 'Theft'],
    ['BNS 318', 'Cheating']
  ];
  for (const [code, expectedTitleSubstring] of spotChecks) {
    await test(`${code} title contains "${expectedTitleSubstring}"`, async () => {
      const e = await bnsCatalogService.getByCodePublic(code);
      assert.ok(e.title.toLowerCase().includes(expectedTitleSubstring.toLowerCase()), `got "${e.title}"`);
    });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await bnsCatalogService.closeConnection();
  process.exit(failed > 0 ? 1 : 0);
};

run();
