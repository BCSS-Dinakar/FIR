#!/usr/bin/env node
/**
 * Generate expanded RAG evaluation cases from the PostgreSQL legal catalog.
 * Merges with hand-curated cases in eval/rag_cases.json.
 *
 * Usage: node scripts/generateRagEvalCases.js [--target 250]
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { query, connectPostgres } = require('../config/postgres');
const bnsCatalogService = require('../services/bnsCatalogService');

const FACT_TEMPLATES = [
  (title) => `The accused committed ${title.toLowerCase()} as narrated by the complainant with specific overt acts stated in the complaint.`,
  (title) => `Complainant alleges the accused engaged in conduct constituting ${title.toLowerCase()} during the incident.`,
  (title) => `During the incident the accused's actions match the offence of ${title.toLowerCase()} according to the stated facts.`,
  (title) => `The accused is alleged to have ${title.toLowerCase()} in circumstances described by the complainant.`
];

const NEGATIVE_TEMPLATES = [
  'The parties had a verbal disagreement about parking. No physical contact or property taking occurred.',
  'Complainant mentions a family death in unrelated context while describing a civil property dispute.',
  'Tenant alleges landlord withheld security deposit after vacating flat; no theft or deception alleged.',
  'Business partners dispute profit sharing; no violence, threats, or property offence narrated.'
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  let target = 250;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) target = parseInt(args[++i], 10);
  }
  return { target };
};

const loadCurated = () => {
  const p = path.join(__dirname, '../eval/rag_cases.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const run = async () => {
  await connectPostgres();
  const { target } = parseArgs();
  const curated = loadCurated();
  const curatedIds = new Set(curated.map((c) => c.id));

  const { rows: sections } = await query(
    `SELECT law_name, section_number, section_title
     FROM laws_sections
     WHERE law_name = ANY('{BNS,BNSS,BSA}'::text[])
       AND section_title IS NOT NULL
       AND length(trim(section_title)) > 3
     ORDER BY law_name, section_sort NULLS LAST, section_number`
  );

  const generated = [];
  let idx = 0;

  for (const section of sections) {
    if (generated.length + curated.length >= target) break;
    const code = `${section.law_name} ${String(section.section_number).match(/(\d+[A-Z]?)/i)?.[1]?.toUpperCase()}`;
    if (!code.includes(' ')) continue;

    for (const template of FACT_TEMPLATES) {
      if (generated.length + curated.length >= target) break;
      const id = `gen-${section.law_name}-${section.section_number}-${idx++}`;
      if (curatedIds.has(id)) continue;
      generated.push({
        id,
        facts: template(section.section_title.replace(/\.$/, '')),
        expectedCodes: [code],
        source: 'catalog_generated',
        law: section.law_name
      });
    }
  }

  for (let i = 0; generated.length + curated.length < target && i < NEGATIVE_TEMPLATES.length * 5; i++) {
    const id = `neg-${i}`;
    if (curatedIds.has(id)) continue;
    generated.push({
      id,
      facts: NEGATIVE_TEMPLATES[i % NEGATIVE_TEMPLATES.length],
      expectedCodes: [],
      source: 'negative_template'
    });
  }

  const merged = [...curated];
  const seenIds = new Set(curated.map((c) => c.id));
  for (const g of generated) {
    if (!seenIds.has(g.id)) {
      merged.push(g);
      seenIds.add(g.id);
    }
  }

  const outPath = path.join(__dirname, '../eval/rag_cases_expanded.json');
  fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Wrote ${merged.length} cases (${curated.length} curated + ${merged.length - curated.length} generated) to ${outPath}`);
  console.log('Use: npm run db:eval-rag -- --cases backend/eval/rag_cases_expanded.json');

  await bnsCatalogService.closeConnection();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
