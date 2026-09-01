#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB = require('../../config/db');
const { connectPostgres } = require('../../config/postgres');
const { upsertSyncStatus } = require('../../repositories/dualWrite');
const petitionsRepo = require('../../repositories/petitionsRepo');
const Petition = require('../../models/Petition');

async function main() {
  await connectPostgres();
  await connectDB();

  const docs = await Petition.find({}).lean();
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const doc of docs) {
    const mongoId = String(doc._id);
    try {
      const row = await petitionsRepo.upsertFromMigration({
        mongoId,
        legacyId: doc.id,
        petitionNo: doc.petitionNo,
        date: doc.date,
        complainant: doc.complainant || 'Unknown',
        accused: doc.accused || 'Unknown',
        sections: doc.sections || [],
        sectionRecommendations: doc.sectionRecommendations || [],
        score: doc.score,
        status: doc.status || 'Pending Filing',
        blockers: doc.blockers || [],
        sourceFile: doc.sourceFile,
        step1Output: doc.step1Output || '',
        step2Output: doc.step2Output || '',
        step3Output: doc.step3Output || {},
        metadata: doc.metadata || {},
        firNo: doc.firNo || '',
        filedAt: doc.filedAt || '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      });
      await upsertSyncStatus({
        entityType: 'petitions',
        postgresId: row.pgId,
        mongoId,
        syncDirection: 'mongo_to_pg',
        syncStatus: 'synced'
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      failures.push({ mongoId, legacyId: doc.id, error: err.message });
      await upsertSyncStatus({
        entityType: 'petitions',
        postgresId: null,
        mongoId,
        syncDirection: 'mongo_to_pg',
        syncStatus: 'failed',
        lastError: err.message
      });
    }
  }

  console.log(JSON.stringify({ migrated: ok, failed, failures }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
