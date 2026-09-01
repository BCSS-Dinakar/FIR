#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB = require('../../config/db');
const User = require('../../models/User');
const Petition = require('../../models/Petition');
const FIR = require('../../models/FIR');

const findDupes = (values) => {
  const counts = new Map();
  for (const v of values) {
    if (v === undefined || v === null || v === '') continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ value: k, count: n }));
};

async function main() {
  await connectDB();
  const [users, petitions, firs] = await Promise.all([
    User.find({}).lean(),
    Petition.find({}).lean(),
    FIR.find({}).lean()
  ]);

  const report = {
    users: {
      email: findDupes(users.map((u) => u.email?.toLowerCase())),
      badge: findDupes(users.map((u) => u.badge))
    },
    petitions: {
      legacy_id: findDupes(petitions.map((p) => p.id)),
      petition_no: findDupes(petitions.map((p) => p.petitionNo))
    },
    firs: {
      fir_no: findDupes(firs.map((f) => f.firNo))
    }
  };

  console.log(JSON.stringify(report, null, 2));

  const hasBlockers = Object.values(report).some((group) =>
    Object.values(group).some((arr) => arr.length > 0)
  );

  if (hasBlockers) {
    console.error('❌ Uniqueness validation failed — fix collisions before migrating.');
    process.exit(1);
  }

  console.log('✅ Uniqueness validation passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
