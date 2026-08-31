/**
 * Rerunnable, incremental script: embeds all legal sections from the canonical
 * MongoDB catalog (legal_database.laws_sections — BNS/BNSS/BSA, see
 * bnsCatalogService) and writes the vectors to backend/data/bnsEmbeddings.json
 * for in-process cosine search.
 *
 * READ-ONLY against MongoDB. Incremental at two levels:
 *  - Across runs: sections that already have a cached embedding are skipped, so
 *    re-running after MongoDB gains new sections costs API calls proportional to
 *    what's new, not the whole catalog.
 *  - Within a run: progress is written to disk after every batch, not just at the
 *    end, so a run cut off partway (rate limit, network drop) keeps whatever it
 *    already embedded — just rerun to pick up exactly where it left off.
 *
 * The index records which model built it; changing the embedding model
 * invalidates the whole index and forces a full re-embed, since query-time and
 * index-time vectors must come from the same model to be comparable at all.
 *
 * Rerun this whenever: MongoDB gains/changes sections, or MISTRAL_EMBEDDING_MODEL
 * changes.
 *
 * Usage: node scripts/ingestBnsEmbeddings.js
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const bnsCatalogService = require('../services/bnsCatalogService');
const { generateEmbeddingsBatch } = require('../services/aiService');

const OUT_PATH = path.join(__dirname, '..', 'data', 'bnsEmbeddings.json');
const EMBEDDING_MODEL = process.env.MISTRAL_EMBEDDING_MODEL || 'mistral-embed';

const loadExisting = () => {
  if (!fs.existsSync(OUT_PATH)) return null;
  const data = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'));
  if (data.model !== EMBEDDING_MODEL) {
    console.log(`Existing index was built with model "${data.model}", current config uses "${EMBEDDING_MODEL}" — re-embedding everything.`);
    return null;
  }
  return data;
};

const run = async () => {
  const entries = await bnsCatalogService.getAllEntries();
  console.log(`Catalog has ${entries.length} sections (from MongoDB, all acts).`);

  const existing = loadExisting();
  // Live Map that gets mutated and persisted after every batch — not just a
  // starting point copied once, so a quota failure mid-run keeps prior batches too.
  const byCode = new Map((existing?.sections || []).map((s) => [s.code, s]));

  const currentCodes = new Set(entries.map((e) => e.code));
  // Drop stale codes up front (a section MongoDB no longer has) so the persisted
  // file never grows unbounded across catalog changes.
  for (const code of byCode.keys()) {
    if (!currentCodes.has(code)) byCode.delete(code);
  }

  const missing = entries.filter((e) => !byCode.has(e.code));
  console.log(`${entries.length - missing.length} already embedded, ${missing.length} missing — embedding only the missing ones.`);

  const persist = () => {
    const out = [...byCode.values()];
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      model: EMBEDDING_MODEL,
      dimensions: out[0].embedding.length,
      generatedAt: new Date().toISOString(),
      sections: out
    }));
  };

  if (missing.length === 0) {
    persist(); // still rewrite, in case stale codes were pruned above
    console.log(`Wrote ${byCode.size} embeddings (0 newly generated) to ${OUT_PATH}`);
    return;
  }

  const texts = missing.map((e) => `Section ${e.sectionNumber}: ${e.title}\n\n${e.fullText}`.slice(0, 6000));
  let newlyGenerated = 0;

  try {
    await generateEmbeddingsBatch(texts, (batchVectors, batchStartIndex) => {
      batchVectors.forEach((embedding, j) => {
        const e = missing[batchStartIndex + j];
        byCode.set(e.code, { code: e.code, sectionNumber: e.sectionNumber, embedding });
      });
      newlyGenerated += batchVectors.length;
      persist();
      console.log(`  ...${newlyGenerated}/${missing.length} embedded and saved`);
    });
  } catch (err) {
    console.error(`Stopped after embedding ${newlyGenerated}/${missing.length} new sections (progress saved): ${err.message}`);
    throw err;
  }

  console.log(`Wrote ${byCode.size} embeddings (${newlyGenerated} newly generated) to ${OUT_PATH}`);
};

run()
  .catch((err) => {
    console.error('Ingestion failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => bnsCatalogService.closeConnection());
