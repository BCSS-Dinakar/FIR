#!/usr/bin/env node
/**
 * Apply 001_app_tables.sql to PostgreSQL legislative DB.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { pool, connectPostgres } = require('../../config/postgres');

async function main() {
  await connectPostgres();
  const sqlPath = path.join(__dirname, '../migrations/001_app_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('✅ Applied 001_app_tables.sql');
  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ Migration failed:', err.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
