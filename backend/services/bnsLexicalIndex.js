const bnsCatalogService = require('./bnsCatalogService');

/**
 * BM25 keyword search over the legal-section catalog, used alongside the dense
 * vector index (see bnsRagService.retrieveCandidates).
 *
 * Why this exists: the embedding model discriminates poorly across statutory text,
 * because every section shares heavy boilerplate ("shall be punished with
 * imprisonment of either description for a term which may extend to...") that
 * dominates the vector. Measured on a textbook cheating fact-pattern, the correct
 * section (BNS 318, "Cheating") ranked 142/1059 by cosine similarity alone, with
 * only 0.037 separating it from the top hit. Lexical scoring is the complement
 * dense retrieval needs here: it keys on the rare, discriminating terms
 * ("deceiving", "dishonestly induces") that boilerplate drowns out.
 */

// Legal boilerplate and stopwords carry no discriminating signal — a query and a
// section matching on "shall"/"punishment"/"person" tells us nothing.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'was', 'were', 'be', 'been', 'being',
  'for', 'with', 'by', 'on', 'at', 'as', 'that', 'this', 'it', 'its', 'from', 'any', 'such',
  'shall', 'may', 'not', 'who', 'whoever', 'which', 'he', 'she', 'his', 'her', 'him', 'they',
  'them', 'their', 'said', 'section', 'punished', 'punishment', 'imprisonment', 'term', 'fine',
  'both', 'either', 'description', 'extend', 'years', 'liable', 'person', 'persons', 'other',
  'under', 'shall', 'have', 'has', 'had', 'if', 'so', 'also', 'thereof', 'therein', 'upon'
]);

const K1 = 1.5; // term-frequency saturation
const B = 0.75; // length normalization

let indexCache = null;

const tokenize = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

/** Crude suffix stripping so "deceiving"/"deceived"/"deception" collide. */
const stem = (t) => t.replace(/(ing|ed|es|s|ment|tion|ly)$/, '');

const buildIndex = async () => {
  if (indexCache) return indexCache;

  const entries = await bnsCatalogService.getAllEntries();
  const docs = entries.map((e) => {
    // Title terms repeat so an offence's own name outweighs a passing mention of
    // it buried in another section's body text.
    const text = `${e.title} ${e.title} ${e.title} ${e.fullText}`;
    const terms = tokenize(text).map(stem);
    const freq = new Map();
    terms.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
    return { code: e.code, sectionNumber: e.sectionNumber, freq, length: terms.length };
  });

  const docFreq = new Map();
  docs.forEach((d) => {
    [...d.freq.keys()].forEach((t) => docFreq.set(t, (docFreq.get(t) || 0) + 1));
  });

  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / (docs.length || 1);
  indexCache = { docs, docFreq, avgLength, total: docs.length };
  return indexCache;
};

/**
 * BM25 search.
 * @param {string} query
 * @param {number} topM
 * @returns {Promise<Array<{code: string, sectionNumber: string, score: number}>>} best-first
 */
const searchLexical = async (query, topM = 20) => {
  const { docs, docFreq, avgLength, total } = await buildIndex();
  const queryTerms = [...new Set(tokenize(query).map(stem))];
  if (queryTerms.length === 0) return [];

  const scored = docs.map((d) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = d.freq.get(term);
      if (!tf) continue;
      const df = docFreq.get(term) || 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (d.length / avgLength))));
    }
    return { code: d.code, sectionNumber: d.sectionNumber, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topM);
};

module.exports = { searchLexical };
