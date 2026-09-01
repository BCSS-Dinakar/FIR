#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { connectPostgres, query } = require('../../config/postgres');

async function main() {
  await connectPostgres();

  const tables = [
    'laws_sections',
    'law_subsections',
    'law_clauses',
    'law_subclauses',
    'law_explanations',
    'law_illustrations',
    'law_provisos'
  ];

  const counts = {};
  for (const table of tables) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    counts[table] = rows[0].n;
  }

  const { rows: rag } = await query(`SELECT * FROM search_laws_rag($1, $2, $3)`, [
    'bail',
    'BNSS',
    5
  ]);

  console.log(
    JSON.stringify(
      {
        counts,
        expectedLawsSections: 1059,
        search_laws_rag_bail_bnss: rag.length,
        ok: counts.laws_sections > 0 && rag.length > 0
      },
      null,
      2
    )
  );

  if (!counts.laws_sections || !rag.length) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
