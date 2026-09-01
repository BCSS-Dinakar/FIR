const { query, flags } = require('../config/postgres');

const LAW_NAMES = ['BNSS', 'BNS', 'BSA'];
const ACT_FULL_NAMES = {
  BNS: 'Bharatiya Nyaya Sanhita, 2023',
  BNSS: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
  BSA: 'Bharatiya Sakshya Adhiniyam, 2023'
};

let catalogCache = null;
let catalogListCache = null;

const buildFullText = (doc) => {
  const parts = [(doc.section_text || '').trim()];
  if (Array.isArray(doc.explanations) && doc.explanations.length > 0) {
    parts.push(`Explanation: ${doc.explanations.join(' ')}`);
  }
  if (Array.isArray(doc.illustrations) && doc.illustrations.length > 0) {
    parts.push(`Illustrations: ${doc.illustrations.join(' ')}`);
  }
  if (Array.isArray(doc.provisos) && doc.provisos.length > 0) {
    parts.push(`Proviso: ${doc.provisos.join(' ')}`);
  }
  return parts.filter(Boolean).join('\n\n').trim();
};

const normalizeWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const buildDesc = (content, length = 160) => {
  const clean = normalizeWhitespace(content);
  if (clean.length <= length) return clean;
  return `${clean.slice(0, length).replace(/\s+\S*$/, '')}...`;
};

const stripTrailingPeriod = (title) => (title || '').trim().replace(/\.$/, '');

const loadSectionChildren = async (sectionIds) => {
  if (!sectionIds.length) {
    return {
      explanations: new Map(),
      illustrations: new Map(),
      provisos: new Map()
    };
  }

  const [explanations, illustrations, provisos] = await Promise.all([
    query(
      `SELECT section_id, text FROM law_explanations
       WHERE section_id = ANY($1::int[]) ORDER BY sort_order`,
      [sectionIds]
    ),
    query(
      `SELECT section_id, text FROM law_illustrations
       WHERE section_id = ANY($1::int[]) ORDER BY sort_order`,
      [sectionIds]
    ),
    query(
      `SELECT section_id, text FROM law_provisos
       WHERE section_id = ANY($1::int[]) ORDER BY sort_order`,
      [sectionIds]
    )
  ]);

  const group = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.section_id)) map.set(r.section_id, []);
      map.get(r.section_id).push(r.text);
    }
    return map;
  };

  return {
    explanations: group(explanations.rows),
    illustrations: group(illustrations.rows),
    provisos: group(provisos.rows)
  };
};

const loadAllSections = async () => {
  const { rows } = await query(
    `SELECT id, mongo_id, law_name, section_number, section_title,
            chapter, chapter_title, section_text, lead_text, punishment
     FROM laws_sections
     WHERE law_name = ANY($1::text[])
     ORDER BY law_name, section_sort NULLS LAST, section_suffix NULLS FIRST, section_number`,
    [LAW_NAMES]
  );

  const sectionIds = rows.map((r) => r.id);
  const children = await loadSectionChildren(sectionIds);

  return rows.map((r) => ({
    ...r,
    explanations: children.explanations.get(r.id) || [],
    illustrations: children.illustrations.get(r.id) || [],
    provisos: children.provisos.get(r.id) || []
  }));
};

const findSection = async (lawName, sectionNumber) => {
  const params = [String(sectionNumber)];
  let lawClause = '';
  if (lawName) {
    params.push(lawName);
    lawClause = `AND UPPER(law_name) = UPPER($${params.length})`;
  }

  const { rows } = await query(
    `SELECT id, mongo_id, law_name, section_number, section_title,
            chapter, chapter_title, section_text, lead_text, punishment
     FROM laws_sections
     WHERE section_number::text = $1
       ${lawClause}
     LIMIT 1`,
    params
  );

  if (!rows[0]) return null;
  const children = await loadSectionChildren([rows[0].id]);
  return {
    ...rows[0],
    _id: rows[0].mongo_id,
    explanations: children.explanations.get(rows[0].id) || [],
    illustrations: children.illustrations.get(rows[0].id) || [],
    provisos: children.provisos.get(rows[0].id) || []
  };
};

const searchLawsRag = async (searchQuery, lawFilter = null, limit = 20) => {
  const { rows } = await query(
    `SELECT * FROM search_laws_rag($1, $2, $3)`,
    [searchQuery, lawFilter, limit]
  );
  return rows;
};

const loadCatalogEntries = async () => {
  if (catalogCache) return catalogCache;

  const docs = await loadAllSections();
  catalogCache = new Map();
  catalogListCache = [];

  for (const doc of docs) {
    const law = LAW_NAMES.includes(doc.law_name) ? doc.law_name : null;
    const sectionNumber = String(doc.section_number || '').match(/(\d+[A-Z]?)/i)?.[1];
    if (!law || !sectionNumber) continue;

    const fullText = buildFullText(doc);
    const entry = {
      code: `${law} ${sectionNumber.toUpperCase()}`,
      law,
      sectionNumber: sectionNumber.toUpperCase(),
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

const getAllEntries = async () => {
  await loadCatalogEntries();
  return catalogListCache;
};

const clearCatalogCache = () => {
  catalogCache = null;
  catalogListCache = null;
};

const checkConnection = async () => {
  try {
    await query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[lawsRepo] ping failed:', err.message);
    return false;
  }
};

const mongoLegalFallbackEnabled = () => flags().mongoFallback;

module.exports = {
  LAW_NAMES,
  ACT_FULL_NAMES,
  loadAllSections,
  findSection,
  searchLawsRag,
  loadCatalogEntries,
  getAllEntries,
  clearCatalogCache,
  checkConnection,
  buildFullText,
  mongoLegalFallbackEnabled
};
