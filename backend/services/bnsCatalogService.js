const lawsRepo = require('../repositories/lawsRepo');

// Public API preserved for bnsRagService / routes / scripts.
// Data source: PostgreSQL laws_* (canonical). No legal dual-write to Mongo.

const LAW_NAMES = lawsRepo.LAW_NAMES;
const ACT_FULL_NAMES = lawsRepo.ACT_FULL_NAMES;
const DEFAULT_LAW = 'BNS';
const DESC_LENGTH = 160;

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

const normalizeSectionNumber = (input) => parseIdentifier(input).number;

const toCanonicalCode = (law, sectionNumber) => `${law} ${sectionNumber}`;

const normalizeToCode = (input, { defaultLaw = DEFAULT_LAW } = {}) => {
  const { law, number } = parseIdentifier(input);
  if (!number) return null;
  return toCanonicalCode(law || defaultLaw, number);
};

const toPublicEntry = ({ code, law, sectionNumber, title, act, desc }) => ({
  code,
  law,
  sectionNumber,
  title,
  act,
  desc
});

const getAllEntries = async () => lawsRepo.getAllEntries();

const getByCode = async (code) => {
  const normalized = normalizeToCode(code);
  if (!normalized) return null;
  const map = await lawsRepo.loadCatalogEntries();
  return map.get(normalized) || null;
};

const getByCodePublic = async (code) => {
  const entry = await getByCode(code);
  return entry ? toPublicEntry(entry) : null;
};

const resolveCodes = async (rawList = []) => {
  const map = await lawsRepo.loadCatalogEntries();
  const seen = new Set();
  const resolved = [];

  for (const raw of rawList) {
    const code = normalizeToCode(raw);
    const catalogEntry = code ? map.get(code) : null;
    const resolvedCode = catalogEntry ? catalogEntry.code : code || String(raw);

    if (seen.has(resolvedCode)) continue;
    seen.add(resolvedCode);

    if (catalogEntry) {
      resolved.push({ ...toPublicEntry(catalogEntry), matched: true });
    } else {
      const { law, number } = parseIdentifier(raw);
      resolved.push({
        code: resolvedCode,
        law: law || null,
        sectionNumber: number || null,
        title: String(raw),
        act: law ? ACT_FULL_NAMES[law] : '',
        desc: '',
        matched: false
      });
    }
  }

  return resolved;
};

const searchCatalog = async (queryText = '', { limit = 50, offset = 0 } = {}) => {
  const q = String(queryText || '').replace(/\s+/g, ' ').trim();
  const entries = await getAllEntries();
  const qLower = q.toLowerCase();

  // Local catalog ranking is authoritative for code/title picker UX (e.g. "1", "hurt").
  // search_laws_rag is used to boost longer free-text queries.
  let matches;
  if (!qLower) {
    matches = entries.map((e) => ({ entry: e, rank: 0 }));
  } else {
    matches = [];
    for (const e of entries) {
      const codeLower = e.code.toLowerCase();
      const titleLower = e.title.toLowerCase();
      const numberLower = e.sectionNumber.toLowerCase();
      const descLower = e.desc.toLowerCase();
      let rank = -1;
      if (codeLower === qLower || numberLower === qLower) rank = 0;
      else if (codeLower.startsWith(qLower) || numberLower.startsWith(qLower)) rank = 1;
      else if (titleLower === qLower || titleLower === `${qLower}.`) rank = 1;
      else if (titleLower.startsWith(qLower)) rank = 2;
      else if (
        new RegExp(`\\b${qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(titleLower)
      ) {
        // Prefer concise offence titles over long provisos that merely mention the term.
        rank = titleLower.length <= 48 ? 2 : 3;
      } else if (titleLower.includes(qLower)) rank = 3;
      else if (descLower.includes(qLower) || e.fullText.toLowerCase().includes(qLower)) rank = 4;
      if (rank >= 0) matches.push({ entry: e, rank });
    }

    const useRagBoost = qLower.length >= 4 && !/^\d+[a-z]?$/i.test(qLower);
    if (useRagBoost) {
      try {
        const ragRows = await lawsRepo.searchLawsRag(q, null, 30);
        const map = await lawsRepo.loadCatalogEntries();
        const matchedCodes = new Set(matches.map((m) => m.entry.code));
        ragRows.forEach((row, idx) => {
          const law = row.law_name || row.law;
          const number = String(row.section_number || '').match(/(\d+[A-Z]?)/i)?.[1];
          if (!law || !number) return;
          const code = toCanonicalCode(law, number.toUpperCase());
          if (matchedCodes.has(code)) return;
          const entry = map.get(code);
          if (entry) {
            matches.push({ entry, rank: 4 + Math.min(idx, 10) });
            matchedCodes.add(code);
          }
        });
      } catch (err) {
        console.warn('[bnsCatalogService] search_laws_rag boost failed:', err.message);
      }
    }

    matches.sort(
      (a, b) =>
        a.rank - b.rank ||
        a.entry.law.localeCompare(b.entry.law) ||
        Number(a.entry.sectionNumber) - Number(b.entry.sectionNumber)
    );
  }

  const total = matches.length;
  const page = matches.slice(offset, offset + limit).map((m) => toPublicEntry(m.entry));
  return { results: page, total };
};

const closeConnection = async () => {
  // pg pool is process-lifetime; no-op for scripts that previously closed mongoose conn.
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
  closeConnection,
  DESC_LENGTH
};
