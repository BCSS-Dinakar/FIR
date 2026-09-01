#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB = require('../../config/db');
const { connectPostgres, query } = require('../../config/postgres');
const usersRepo = require('../../repositories/usersRepo');
const petitionsRepo = require('../../repositories/petitionsRepo');
const firsRepo = require('../../repositories/firsRepo');
const usersMongo = require('../../adapters/mongo/usersMongo');
const petitionsMongo = require('../../adapters/mongo/petitionsMongo');
const firsMongo = require('../../adapters/mongo/firsMongo');
const { upsertSyncStatus } = require('../../repositories/dualWrite');

async function main() {
  await connectPostgres();
  await connectDB();

  const { rows } = await query(
    `SELECT * FROM migration_sync_status
     WHERE sync_direction = 'pg_to_mongo' AND sync_status = 'failed'
       AND postgres_id IS NOT NULL
     ORDER BY last_synced_at NULLS FIRST`
  );

  let ok = 0;
  let failed = 0;

  for (const status of rows) {
    try {
      if (status.entity_type === 'users') {
        const row = await usersRepo.findByIdPg(status.postgres_id);
        if (!row) throw new Error('PG user missing');
        await usersMongo.upsertFromPg(row);
      } else if (status.entity_type === 'petitions') {
        const row = await petitionsRepo.findByPgId(status.postgres_id);
        if (!row) throw new Error('PG petition missing');
        await petitionsMongo.upsertFromPg(row);
      } else if (status.entity_type === 'firs') {
        const { rows: firRows } = await query(
          `SELECT f.*, p.legacy_id AS legacy_petition_id
           FROM firs f JOIN petitions p ON p.id = f.petition_id
           WHERE f.id = $1`,
          [status.postgres_id]
        );
        if (!firRows[0]) throw new Error('PG fir missing');
        const mapped = firsRepo.mapRow(firRows[0], firRows[0].legacy_petition_id);
        await firsMongo.upsertFromPg(mapped);
      }

      await upsertSyncStatus({
        entityType: status.entity_type,
        postgresId: status.postgres_id,
        mongoId: status.mongo_id,
        syncDirection: 'pg_to_mongo',
        syncStatus: 'synced',
        lastError: null
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      await upsertSyncStatus({
        entityType: status.entity_type,
        postgresId: status.postgres_id,
        mongoId: status.mongo_id,
        syncDirection: 'pg_to_mongo',
        syncStatus: 'failed',
        lastError: err.message
      });
    }
  }

  console.log(JSON.stringify({ replayed: ok, failed, total: rows.length }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
