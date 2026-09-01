#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB = require('../../config/db');
const { connectPostgres } = require('../../config/postgres');
const { upsertSyncStatus } = require('../../repositories/dualWrite');
const firsRepo = require('../../repositories/firsRepo');
const FIR = require('../../models/FIR');

async function main() {
  await connectPostgres();
  await connectDB();

  const docs = await FIR.find({}).lean();
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const doc of docs) {
    const mongoId = String(doc._id);
    try {
      const row = await firsRepo.upsertFromMigration({
        mongoId,
        firNo: doc.firNo,
        petitionId: doc.petitionId,
        district: doc.district || '',
        policeStation: doc.policeStation || '',
        year: doc.year || '',
        firDate: doc.firDate || '',
        firTime: doc.firTime || '',
        sections: doc.sections || [],
        occurrenceDay: doc.occurrenceDay || '',
        occurrenceDateFrom: doc.occurrenceDateFrom || '',
        occurrenceTimeFrom: doc.occurrenceTimeFrom || '',
        occurrenceDateTo: doc.occurrenceDateTo || '',
        occurrenceTimeTo: doc.occurrenceTimeTo || '',
        priorToTimePeriod: doc.priorToTimePeriod || '',
        receivedDate: doc.receivedDate || '',
        receivedTime: doc.receivedTime || '',
        gdEntryNo: doc.gdEntryNo || '',
        gdDateTime: doc.gdDateTime || '',
        typeOfInformation: doc.typeOfInformation || 'Written',
        distanceDirection: doc.distanceDirection || '',
        beatNo: doc.beatNo || '',
        occurrenceAddress: doc.occurrenceAddress || '',
        outsideLimitPSName: doc.outsideLimitPSName || '',
        outsideLimitDistrict: doc.outsideLimitDistrict || '',
        complainant: doc.complainant || '',
        complainantRelative: doc.complainantRelative || '',
        complainantDob: doc.complainantDob || '',
        complainantAge: doc.complainantAge || '',
        complainantNationality: doc.complainantNationality || 'India',
        complainantCaste: doc.complainantCaste || '',
        complainantPassport: doc.complainantPassport || '',
        complainantPassportIssueDate: doc.complainantPassportIssueDate || '',
        complainantPassportIssuePlace: doc.complainantPassportIssuePlace || '',
        complainantOccupation: doc.complainantOccupation || '',
        complainantPhone: doc.complainantPhone || '',
        complainantAddress: doc.complainantAddress || '',
        accused: doc.accused || '',
        accusedList: doc.accusedList || [],
        reasonsForDelay: doc.reasonsForDelay || '',
        propertiesStolen: doc.propertiesStolen || '',
        totalValueStolen: doc.totalValueStolen || '',
        inquestReport: doc.inquestReport || '',
        incidentFacts: doc.incidentFacts || '',
        actionTaken: doc.actionTaken || '1',
        refusedInvestigationDueTo: doc.refusedInvestigationDueTo || '',
        transferredPS: doc.transferredPS || '',
        transferredDistrict: doc.transferredDistrict || '',
        officerName: doc.officerName || '',
        officerRank: doc.officerRank || '',
        officerNo: doc.officerNo || '',
        dispatchDateTime: doc.dispatchDateTime || '',
        filedAt: doc.filedAt || '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      });
      await upsertSyncStatus({
        entityType: 'firs',
        postgresId: row.pgId || row.id,
        mongoId,
        syncDirection: 'mongo_to_pg',
        syncStatus: 'synced'
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      failures.push({ mongoId, petitionId: doc.petitionId, error: err.message });
      await upsertSyncStatus({
        entityType: 'firs',
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
