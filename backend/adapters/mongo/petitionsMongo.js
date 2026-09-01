const Petition = require('../../models/Petition');

const mapDoc = (doc) => {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: o.id,
    _id: o.id,
    pgId: null,
    mongoId: String(o._id),
    legacyId: o.id,
    petitionNo: o.petitionNo,
    userId: null,
    date: o.date,
    complainant: o.complainant,
    accused: o.accused,
    sections: o.sections || [],
    sectionRecommendations: o.sectionRecommendations || [],
    score: o.score,
    status: o.status,
    blockers: o.blockers || [],
    sourceFile: o.sourceFile,
    step1Output: o.step1Output || '',
    step2Output: o.step2Output || '',
    step3Output: o.step3Output || {},
    metadata: o.metadata || {},
    firNo: o.firNo || '',
    filedAt: o.filedAt || '',
    district: o.district || o.metadata?.district || '',
    policeStation: o.policeStation || o.metadata?.policeStation || '',
    gdNumber: o.gdNumber || '',
    incidentDate: o.incidentDate || '',
    incidentTime: o.incidentTime || '',
    occurrencePlace: o.occurrencePlace || '',
    complainantRelative: o.complainantRelative || '',
    complainantPhone: o.complainantPhone || '',
    complainantAddress: o.complainantAddress || '',
    incidentFacts: o.incidentFacts || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
};

const findByLegacyId = async (legacyId) => {
  const doc = await Petition.findOne({ id: legacyId });
  return mapDoc(doc);
};

const findMany = async (filter = {}) => {
  const docs = await Petition.find(filter).sort({ createdAt: -1 });
  return docs.map(mapDoc);
};

const count = async (filter = {}) => Petition.countDocuments(filter);

const upsertFromPg = async (pgPetition) => {
  const payload = {
    id: pgPetition.legacyId || pgPetition.id,
    petitionNo: pgPetition.petitionNo,
    date: pgPetition.date,
    complainant: pgPetition.complainant,
    accused: pgPetition.accused,
    sections: pgPetition.sections || [],
    sectionRecommendations: pgPetition.sectionRecommendations || [],
    score: pgPetition.score,
    status: pgPetition.status,
    blockers: pgPetition.blockers || [],
    sourceFile: pgPetition.sourceFile,
    step1Output: pgPetition.step1Output || '',
    step2Output: pgPetition.step2Output || '',
    step3Output: pgPetition.step3Output || {},
    metadata: pgPetition.metadata || {},
    firNo: pgPetition.firNo || '',
    filedAt: pgPetition.filedAt || ''
  };

  let existing = null;
  if (pgPetition.mongoId) {
    try {
      existing = await Petition.findById(pgPetition.mongoId);
    } catch {
      existing = null;
    }
  }
  if (!existing) {
    existing = await Petition.findOne({ id: payload.id });
  }

  if (existing) {
    Object.assign(existing, payload);
    existing.markModified('sections');
    existing.markModified('sectionRecommendations');
    existing.markModified('blockers');
    existing.markModified('step3Output');
    existing.markModified('metadata');
    await existing.save();
    return { mongoId: String(existing._id) };
  }

  const created = await Petition.create(payload);
  await require('../../config/postgres').query(
    'UPDATE petitions SET mongo_id = $2 WHERE id = $1 AND mongo_id IS NULL',
    [pgPetition.pgId || pgPetition.id, String(created._id)]
  );
  return { mongoId: String(created._id) };
};

const deleteByLegacyId = async (legacyId) => {
  await Petition.deleteOne({ id: legacyId });
};

module.exports = {
  mapDoc,
  findByLegacyId,
  findMany,
  count,
  upsertFromPg,
  deleteByLegacyId
};
