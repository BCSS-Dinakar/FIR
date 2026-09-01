#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB = require('../../config/db');
const { connectPostgres, query } = require('../../config/postgres');
const User = require('../../models/User');
const Petition = require('../../models/Petition');
const FIR = require('../../models/FIR');

async function main() {
  await connectPostgres();
  await connectDB();

  const [mongoUsers, mongoPetitions, mongoFirs] = await Promise.all([
    User.countDocuments(),
    Petition.countDocuments(),
    FIR.countDocuments()
  ]);

  const [pgUsers, pgPetitions, pgFirs, sync] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM users'),
    query('SELECT COUNT(*)::int AS n FROM petitions'),
    query('SELECT COUNT(*)::int AS n FROM firs'),
    query(
      `SELECT entity_type, sync_direction, sync_status, COUNT(*)::int AS n
       FROM migration_sync_status
       GROUP BY 1,2,3
       ORDER BY 1,2,3`
    )
  ]);

  const report = {
    mongoCollections: {
      users: mongoUsers,
      petitions: mongoPetitions,
      firs: mongoFirs,
      legal_note: 'laws_sections not counted here (PG-canonical)'
    },
    postgresTables: {
      users: pgUsers.rows[0].n,
      petitions: pgPetitions.rows[0].n,
      firs: pgFirs.rows[0].n
    },
    syncStatus: sync.rows,
    remainingMongoDependencies: [
      'adapters/mongo/* (Phase A sync/fallback)',
      'models/User|Petition|FIR',
      'config/db.js mongoose connect',
      'MONGO_URI / MONGO_SYNC / MONGO_FALLBACK'
    ]
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
