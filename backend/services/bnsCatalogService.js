const mongoose = require('mongoose');

// Canonical legal-section dataset source of truth: the existing MongoDB collection
// (populated and maintained outside this app — see legalsections/, a separate
// Python RAG service that reads the same collection). This module is READ-ONLY
// against that collection: it never inserts, updates, or seeds documents.
// Covers all three acts stored there: BNS (substantive offences), BNSS (criminal
// procedure), BSA (evidence law).
const DB_NAME = process.env.DATABASE_NAME || 'legal_database';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'laws_sections';

const LAW_NAMES = ['BNSS', 'BNS', 'BSA']; // longer/more specific codes first, see parseIdentifier
const ACT_FULL_NAMES = {
  BNS: 'Bharatiya Nyaya Sanhita, 2023',
  BNSS: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
  BSA: 'Bharatiya Sakshya Adhiniyam, 2023'
};
// All historical Petition.sections data predates BNSS/BSA support and is BNS-only,
// so an identifier with no recognizable act prefix defaults to BNS for backward
// compatibility rather than being treated as unresolvable.
const DEFAULT_LAW = 'BNS';

const DESC_LENGTH = 160;

let connectionPromise = null;
let catalogCache = null; // Map<code, entry>
let catalogListCache = null; // entry[] in dataset order

const getConnection = () => {
  if (!connectionPromise) {
    connectionPromise = mongoose
      .createConnection(process.env.MONGO_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 8000 })
      .asPromise();
  }
  return connectionPromise;
};

/** For standalone scripts (not the long-lived server) to close the connection and exit cleanly. */
const closeConnection = async () => {
  if (!connectionPromise) return;
  const conn = await connectionPromise;
  await conn.close();
  connectionPromise = null;
};

const normalizeWhitespace = (text) => text.replace(/\s+/g, ' ').trim();

const buildDesc = (content) => {
  const clean = normalizeWhitespace(content);
  if (clean.length <= DESC_LENGTH) return clean;
  return clean.slice(0, DESC_LENGTH).replace(/\s+\S*$/, '') + '...';
};

/**
 * Parses a law code (BNS/BNSS/BSA) and section number out of any historically-seen
 * format: "BNS 323", "323", "BNS 323 (Voluntarily causing hurt)", "BNSS 45",
 * "Section 323". Word-boundary matching means "BNS" never false-matches inside
 * "BNSS" regardless of check order (no character follows "BNS" that would satisfy
 * a word boundary within "BNSS").
 * @returns {{law: string|null, number: string|null}}
 */
const parseIdentifier = (input) => {
  if (input === null || input === undefined) return { law: null, number: null };
  const str = String(input).toUpperCase();

  let law = null;
  for (const code of LAW_NAMES) {
    if (new RegExp(`\\b${code}\\b`).test(str)) {
      law = code;
      break;
    }
  }

  const numberMatch = str.match(/(\d+[A-Z]?)/);
  const number = numberMatch ? numberMatch[1] : null;

  return { law, number };
};

/** Section-number-only extraction, kept for callers that don't need act disambiguation. */
const normalizeSectionNumber = (input) => parseIdentifier(input).number;

const toCanonicalCode = (law, sectionNumber) => `${law} ${sectionNumber}`;

/**
 * Resolves any identifier format to a fully-qualified catalog code ("BNS 323"),
 * defaulting the act to BNS when none is specified (see DEFAULT_LAW above).
 * Returns null only when no section number at all could be found.
 */
const normalizeToCode = (input, { defaultLaw = DEFAULT_LAW } = {}) => {
  const { law, number } = parseIdentifier(input);
  if (!number) return null;
  return toCanonicalCode(law || defaultLaw, number);
};

/**
 * Mirrors legalsections/app/rag/embedding.py's create_combined_text: section_text
 * already contains the merged subsections, so only append explanations/
 * illustrations when the document actually has them (most docs don't).
 */
const buildFullText = (doc) => {
  const parts = [(doc.section_text || '').trim()];
  if (Array.isArray(doc.explanations) && doc.explanations.length > 0) {
    parts.push(`Explanation: ${doc.explanations.join(' ')}`);
  }
  if (Array.isArray(doc.illustrations) && doc.illustrations.length > 0) {
    parts.push(`Illustrations: ${doc.illustrations.join(' ')}`);
  }
  return parts.filter(Boolean).join('\n\n').trim();
};

const stripTrailingPeriod = (title) => (title || '').trim().replace(/\.$/, '');

const loadCatalog = async () => {
  if (catalogCache) return catalogCache;

  const conn = await getConnection();
  const docs = await conn.collection(COLLECTION_NAME).find({ law_name: { $in: LAW_NAMES } }).toArray();

  catalogCache = new Map();
  catalogListCache = [];

  for (const doc of docs) {
    const law = LAW_NAMES.includes(doc.law_name) ? doc.law_name : null;
    const sectionNumber = normalizeSectionNumber(doc.section_number);
    if (!law || !sectionNumber) continue;

    const fullText = buildFullText(doc);
    const entry = {
      code: toCanonicalCode(law, sectionNumber),
      law,
      sectionNumber,
      title: stripTrailingPeriod(doc.section_title),
      act: ACT_FULL_NAMES[law],
      chapter: doc.chapter_title || doc.chapter || '',
      desc: buildDesc(fullText),
      fullText
    };

    catalogCache.set(entry.code, entry);
    catalogListCache.push(entry);
  }

  return catalogCache;
};

/** Public (API-facing) shape: no fullText, keeps payloads small. */
const toPublicEntry = ({ code, law, sectionNumber, title, act, desc }) => ({ code, law, sectionNumber, title, act, desc });

const getAllEntries = async () => {
  await loadCatalog();
  return catalogListCache;
};

const getByCode = async (code) => {
  const normalized = normalizeToCode(code);
  if (!normalized) return null;
  const map = await loadCatalog();
  return map.get(normalized) || null;
};

const getByCodePublic = async (code) => {
  const entry = await getByCode(code);
  return entry ? toPublicEntry(entry) : null;
};

/**
 * Resolves a list of legacy/free-text section identifiers (as historically stored
 * on Petition.sections, e.g. "BNS 303 (Theft)") against the canonical catalog.
 * Unmatched entries are kept (with whatever label was stored) so existing petitions
 * never lose data, but are marked matched:false.
 */
const resolveCodes = async (rawList = []) => {
  const map = await loadCatalog();
  const seen = new Set();
  const resolved = [];

  for (const raw of rawList) {
    const code = normalizeToCode(raw);
    const catalogEntry = code ? map.get(code) : null;
    const resolvedCode = catalogEntry ? catalogEntry.code : (code || String(raw));

    if (seen.has(resolvedCode)) continue;
    seen.add(resolvedCode);

    if (catalogEntry) {
      resolved.push({ ...toPublicEntry(catalogEntry), matched: true });
    } else {
      // Legacy/unrecognized label — surface it as-is rather than dropping it.
      const { law, number } = parseIdentifier(raw);
      resolved.push({ code: resolvedCode, law: law || null, sectionNumber: number || null, title: String(raw), act: law ? ACT_FULL_NAMES[law] : '', desc: '', matched: false });
    }
  }

  return resolved;
};

/**
 * Text search across code / section number / title / description, spanning all
 * three acts. Simple case-insensitive substring match, ranked so exact code/number
 * matches and title matches surface first; ties break by law then section number so
 * results (e.g. "1" matching BNS 1, BNSS 1, BSA 1) render in a stable order.
 */
const searchCatalog = async (query = '', { limit = 50, offset = 0 } = {}) => {
  const entries = await getAllEntries();
  const q = normalizeWhitespace(query).toLowerCase();

  let matches;
  if (!q) {
    matches = entries.map((e) => ({ entry: e, rank: 0 }));
  } else {
    matches = [];
    for (const e of entries) {
      const codeLower = e.code.toLowerCase();
      const titleLower = e.title.toLowerCase();
      const numberLower = e.sectionNumber.toLowerCase();
      const descLower = e.desc.toLowerCase();

      let rank = -1;
      if (codeLower === q || numberLower === q) rank = 0;
      else if (codeLower.startsWith(q) || numberLower.startsWith(q)) rank = 1;
      else if (titleLower.startsWith(q)) rank = 2;
      else if (titleLower.includes(q)) rank = 3;
      else if (descLower.includes(q) || e.fullText.toLowerCase().includes(q)) rank = 4;

      if (rank >= 0) matches.push({ entry: e, rank });
    }
    matches.sort((a, b) =>
      a.rank - b.rank ||
      a.entry.law.localeCompare(b.entry.law) ||
      Number(a.entry.sectionNumber) - Number(b.entry.sectionNumber)
    );
  }

  const total = matches.length;
  const page = matches.slice(offset, offset + limit).map((m) => toPublicEntry(m.entry));
  return { results: page, total };
};

module.exports = {
  LAW_NAMES,
  normalizeSectionNumber,
  normalizeToCode,
  toCanonicalCode,
  getAllEntries,
  getByCode,
  getByCodePublic,
  resolveCodes,
  searchCatalog,
  closeConnection
};
