const FIR = require('../../models/FIR');

const mapDoc = (doc) => {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(o._id),
    _id: String(o._id),
    pgId: null,
    mongoId: String(o._id),
    firNo: o.firNo,
    petitionId: o.petitionId,
    petitionPgId: null,
    district: o.district || '',
    policeStation: o.policeStation || '',
    year: o.year || '',
    firDate: o.firDate || '',
    firTime: o.firTime || '',
    sections: o.sections || [],
    occurrenceDay: o.occurrenceDay || '',
    occurrenceDateFrom: o.occurrenceDateFrom || '',
    occurrenceTimeFrom: o.occurrenceTimeFrom || '',
    occurrenceDateTo: o.occurrenceDateTo || '',
    occurrenceTimeTo: o.occurrenceTimeTo || '',
    priorToTimePeriod: o.priorToTimePeriod || '',
    receivedDate: o.receivedDate || '',
    receivedTime: o.receivedTime || '',
    gdEntryNo: o.gdEntryNo || '',
    gdDateTime: o.gdDateTime || '',
    typeOfInformation: o.typeOfInformation || 'Written',
    distanceDirection: o.distanceDirection || '',
    beatNo: o.beatNo || '',
    occurrenceAddress: o.occurrenceAddress || '',
    outsideLimitPSName: o.outsideLimitPSName || '',
    outsideLimitDistrict: o.outsideLimitDistrict || '',
    complainant: o.complainant || '',
    complainantRelative: o.complainantRelative || '',
    complainantDob: o.complainantDob || '',
    complainantAge: o.complainantAge || '',
    complainantNationality: o.complainantNationality || 'India',
    complainantCaste: o.complainantCaste || '',
    complainantPassport: o.complainantPassport || '',
    complainantPassportIssueDate: o.complainantPassportIssueDate || '',
    complainantPassportIssuePlace: o.complainantPassportIssuePlace || '',
    complainantOccupation: o.complainantOccupation || '',
    complainantPhone: o.complainantPhone || '',
    complainantAddress: o.complainantAddress || '',
    accused: o.accused || '',
    accusedList: o.accusedList || [],
    reasonsForDelay: o.reasonsForDelay || '',
    propertiesStolen: o.propertiesStolen || '',
    totalValueStolen: o.totalValueStolen || '',
    inquestReport: o.inquestReport || '',
    incidentFacts: o.incidentFacts || '',
    actionTaken: o.actionTaken || '1',
    refusedInvestigationDueTo: o.refusedInvestigationDueTo || '',
    transferredPS: o.transferredPS || '',
    transferredDistrict: o.transferredDistrict || '',
    officerName: o.officerName || '',
    officerRank: o.officerRank || '',
    officerNo: o.officerNo || '',
    dispatchDateTime: o.dispatchDateTime || '',
    filedAt: o.filedAt || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
};

const findByPetitionLegacyId = async (legacyId) => {
  const doc = await FIR.findOne({ petitionId: legacyId });
  return mapDoc(doc);
};

const findMany = async (filter = {}) => {
  const docs = await FIR.find(filter).sort({ createdAt: -1 });
  return docs.map(mapDoc);
};

const upsertFromPg = async (pgFir) => {
  const payload = { ...pgFir };
  delete payload.id;
  delete payload._id;
  delete payload.pgId;
  delete payload.mongoId;
  delete payload.petitionPgId;
  delete payload.createdAt;
  delete payload.updatedAt;

  const mongoPayload = {
    firNo: pgFir.firNo,
    petitionId: pgFir.petitionId,
    district: pgFir.district,
    policeStation: pgFir.policeStation,
    year: pgFir.year,
    firDate: pgFir.firDate,
    firTime: pgFir.firTime,
    sections: pgFir.sections || [],
    occurrenceDay: pgFir.occurrenceDay,
    occurrenceDateFrom: pgFir.occurrenceDateFrom,
    occurrenceTimeFrom: pgFir.occurrenceTimeFrom,
    occurrenceDateTo: pgFir.occurrenceDateTo,
    occurrenceTimeTo: pgFir.occurrenceTimeTo,
    priorToTimePeriod: pgFir.priorToTimePeriod,
    receivedDate: pgFir.receivedDate,
    receivedTime: pgFir.receivedTime,
    gdEntryNo: pgFir.gdEntryNo,
    gdDateTime: pgFir.gdDateTime,
    typeOfInformation: pgFir.typeOfInformation,
    distanceDirection: pgFir.distanceDirection,
    beatNo: pgFir.beatNo,
    occurrenceAddress: pgFir.occurrenceAddress,
    outsideLimitPSName: pgFir.outsideLimitPSName,
    outsideLimitDistrict: pgFir.outsideLimitDistrict,
    complainant: pgFir.complainant,
    complainantRelative: pgFir.complainantRelative,
    complainantDob: pgFir.complainantDob,
    complainantAge: pgFir.complainantAge,
    complainantNationality: pgFir.complainantNationality,
    complainantCaste: pgFir.complainantCaste,
    complainantPassport: pgFir.complainantPassport,
    complainantPassportIssueDate: pgFir.complainantPassportIssueDate,
    complainantPassportIssuePlace: pgFir.complainantPassportIssuePlace,
    complainantOccupation: pgFir.complainantOccupation,
    complainantPhone: pgFir.complainantPhone,
    complainantAddress: pgFir.complainantAddress,
    accused: pgFir.accused,
    accusedList: pgFir.accusedList || [],
    reasonsForDelay: pgFir.reasonsForDelay,
    propertiesStolen: pgFir.propertiesStolen,
    totalValueStolen: pgFir.totalValueStolen,
    inquestReport: pgFir.inquestReport,
    incidentFacts: pgFir.incidentFacts,
    actionTaken: pgFir.actionTaken,
    refusedInvestigationDueTo: pgFir.refusedInvestigationDueTo,
    transferredPS: pgFir.transferredPS,
    transferredDistrict: pgFir.transferredDistrict,
    officerName: pgFir.officerName,
    officerRank: pgFir.officerRank,
    officerNo: pgFir.officerNo,
    dispatchDateTime: pgFir.dispatchDateTime,
    filedAt: pgFir.filedAt || ''
  };

  let existing = null;
  if (pgFir.mongoId) {
    try {
      existing = await FIR.findById(pgFir.mongoId);
    } catch {
      existing = null;
    }
  }
  if (!existing) {
    existing = await FIR.findOne({ firNo: pgFir.firNo });
  }
  if (!existing) {
    existing = await FIR.findOne({ petitionId: pgFir.petitionId });
  }

  if (existing) {
    Object.assign(existing, mongoPayload);
    existing.markModified('sections');
    existing.markModified('accusedList');
    await existing.save();
    return { mongoId: String(existing._id) };
  }

  const created = await FIR.create(mongoPayload);
  await require('../../config/postgres').query(
    'UPDATE firs SET mongo_id = $2 WHERE id = $1 AND mongo_id IS NULL',
    [pgFir.pgId || pgFir.id, String(created._id)]
  );
  return { mongoId: String(created._id) };
};

module.exports = {
  mapDoc,
  findByPetitionLegacyId,
  findMany,
  upsertFromPg
};
