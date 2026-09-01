#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB = require('../../config/db');
const { connectPostgres } = require('../../config/postgres');
const { upsertSyncStatus } = require('../../repositories/dualWrite');
const usersRepo = require('../../repositories/usersRepo');
const User = require('../../models/User');

const isBcrypt = (value) => typeof value === 'string' && /^\$2[aby]?\$/.test(value);

async function main() {
  await connectPostgres();
  await connectDB();

  const docs = await User.find({}).lean();
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const doc of docs) {
    const mongoId = String(doc._id);
    try {
      if (!isBcrypt(doc.password)) {
        throw new Error('password is not bcrypt; refusing to copy into password_hash');
      }
      const row = await usersRepo.upsertFromMigration({
        mongoId,
        name: doc.name,
        badge: doc.badge,
        email: String(doc.email || '').toLowerCase(),
        mobile: doc.mobile,
        station: doc.station,
        passwordHash: doc.password,
        rank: doc.rank || 'Inspector',
        state: doc.state || 'Telangana',
        district: doc.district || 'Hyderabad',
        themeModeUi: doc.themeModeUi || 'dark',
        sidebarCollapse: !!doc.sidebarCollapse,
        lastLogin: doc.lastLogin || null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      });
      await upsertSyncStatus({
        entityType: 'users',
        postgresId: row.id,
        mongoId,
        syncDirection: 'mongo_to_pg',
        syncStatus: 'synced'
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      failures.push({ mongoId, error: err.message });
      await upsertSyncStatus({
        entityType: 'users',
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
