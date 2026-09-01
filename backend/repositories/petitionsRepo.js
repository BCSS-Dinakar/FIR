const { query } = require('../config/postgres');
const { writeWithSync, readWithFallback } = require('./dualWrite');
const petitionsMongo = require('../adapters/mongo/petitionsMongo');

const asJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return value;
};

const enrichFromMetadata = (row, mapped) => {
  const meta = mapped.metadata || {};
  return {
    ...mapped,
    district: row.district || meta.district || '',
    policeStation: row.police_station || meta.policeStation || '',
    gdNumber: meta.gdNumber || meta.gdEntryNo || '',
    incidentDate: meta.incidentDate || '',
    incidentTime: meta.incidentTime || '',
    occurrencePlace: meta.occurrencePlace || '',
    complainantRelative: meta.complainantRelative || '',
    complainantPhone: meta.complainantPhone || '',
    complainantAddress: meta.complainantAddress || '',
    incidentFacts: meta.incidentFacts || ''
  };
};

const mapRow = (row) => {
  if (!row) return null;
  const mapped = {
    id: row.legacy_id,
    _id: row.legacy_id,
    pgId: row.id,
    mongoId: row.mongo_id || null,
    legacyId: row.legacy_id,
    petitionNo: row.petition_no,
    userId: row.user_id,
    date: row.date,
    complainant: row.complainant,
    accused: row.accused,
    sections: row.sections || [],
    sectionRecommendations: row.section_recommendations || [],
    score: row.score,
    status: row.status,
    blockers: row.blockers || [],
    sourceFile: row.source_file,
    step1Output: row.step1_output || '',
    step2Output: row.step2_output || '',
    step3Output: row.step3_output || {},
    metadata: row.metadata || {},
    firNo: row.fir_no || '',
    filedAt: row.filed_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return enrichFromMetadata(row, mapped);
};

const findByLegacyIdPg = async (legacyId) => {
  const { rows } = await query('SELECT * FROM petitions WHERE legacy_id = $1', [legacyId]);
  return mapRow(rows[0]);
};

const findByPgId = async (pgId) => {
  const { rows } = await query('SELECT * FROM petitions WHERE id = $1', [pgId]);
  return mapRow(rows[0]);
};

const findByLegacyId = async (legacyId) => {
  const { row } = await readWithFallback({
    entityType: 'petitions',
    lookupKey: legacyId,
    pgRead: () => findByLegacyIdPg(legacyId),
    mongoRead: () => petitionsMongo.findByLegacyId(legacyId)
  });
  return row;
};

const list = async ({ filter = {} } = {}) => {
  try {
    const clauses = [];
    const params = [];

    if (filter.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filter.withoutBlockers) {
      clauses.push(`(blockers = '[]'::jsonb OR jsonb_array_length(blockers) = 0)`);
    }
    if (filter.withBlockers) {
      clauses.push(`jsonb_typeof(blockers) = 'array' AND jsonb_array_length(blockers) > 0`);
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      const i = params.length;
      clauses.push(
        `(legacy_id ILIKE $${i} OR petition_no ILIKE $${i} OR complainant ILIKE $${i} OR accused ILIKE $${i} OR fir_no ILIKE $${i})`
      );
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM petitions ${where} ORDER BY created_at DESC`,
      params
    );
    return rows.map(mapRow);
  } catch (err) {
    console.warn('[petitionsRepo] list PG failed:', err.message);
    const mongoFilter = {};
    if (filter.status) mongoFilter.status = filter.status;
    return petitionsMongo.findMany(mongoFilter);
  }
};

const count = async ({ filter = {} } = {}) => {
  try {
    const clauses = [];
    const params = [];
    if (filter.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filter.withoutBlockers) {
      clauses.push(`(blockers = '[]'::jsonb OR jsonb_array_length(blockers) = 0)`);
    }
    if (filter.withBlockers) {
      clauses.push(`jsonb_typeof(blockers) = 'array' AND jsonb_array_length(blockers) > 0`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM petitions ${where}`, params);
    return rows[0].n;
  } catch (err) {
    console.warn('[petitionsRepo] count PG failed:', err.message);
    return petitionsMongo.count(
      filter.status ? { status: filter.status } : {}
    );
  }
};

const countActiveBlockers = async () => {
  try {
    const { rows } = await query(
      `SELECT COALESCE(SUM(jsonb_array_length(blockers)), 0)::int AS n
       FROM petitions
       WHERE status <> 'FIR Filed'
         AND jsonb_typeof(blockers) = 'array'`
    );
    return rows[0].n;
  } catch (err) {
    console.warn('[petitionsRepo] countActiveBlockers failed:', err.message);
    return 0;
  }
};

const create = async (data) => {
  return writeWithSync({
    entityType: 'petitions',
    pgWrite: async () => {
      const { rows } = await query(
        `INSERT INTO petitions (
           mongo_id, legacy_id, petition_no, user_id, date, complainant, accused,
           sections, section_recommendations, score, status, blockers, source_file,
           step1_output, step2_output, step3_output, metadata, fir_no, filed_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19
         ) RETURNING *`,
        [
          data.mongoId || null,
          data.id || data.legacyId,
          data.petitionNo,
          data.userId || null,
          data.date,
          data.complainant || 'Unknown',
          data.accused || 'Unknown',
          JSON.stringify(asJson(data.sections, [])),
          JSON.stringify(asJson(data.sectionRecommendations, [])),
          data.score,
          data.status || 'Pending Filing',
          JSON.stringify(asJson(data.blockers, [])),
          data.sourceFile,
          data.step1Output || '',
          data.step2Output || '',
          JSON.stringify(asJson(data.step3Output, {})),
          JSON.stringify(asJson(data.metadata, {})),
          data.firNo || '',
          data.filedAt || ''
        ]
      );
      return { row: mapRow(rows[0]) };
    },
    mongoSync: (row) => petitionsMongo.upsertFromPg(row)
  });
};

const updateByLegacyId = async (legacyId, patch) => {
  const current = await findByLegacyId(legacyId);
  if (!current || !current.pgId) {
    // Fallback-only mongo row: try create path not supported here
    if (current && !current.pgId) {
      throw new Error('Petition exists only in Mongo fallback; migrate before update');
    }
    return null;
  }

  const next = {
    petitionNo: patch.petitionNo !== undefined ? patch.petitionNo : current.petitionNo,
    date: patch.date !== undefined ? patch.date : current.date,
    complainant: patch.complainant !== undefined ? patch.complainant : current.complainant,
    accused: patch.accused !== undefined ? patch.accused : current.accused,
    sections: patch.sections !== undefined ? patch.sections : current.sections,
    sectionRecommendations:
      patch.sectionRecommendations !== undefined
        ? patch.sectionRecommendations
        : current.sectionRecommendations,
    score: patch.score !== undefined ? patch.score : current.score,
    status: patch.status !== undefined ? patch.status : current.status,
    blockers: patch.blockers !== undefined ? patch.blockers : current.blockers,
    sourceFile: patch.sourceFile !== undefined ? patch.sourceFile : current.sourceFile,
    step1Output: patch.step1Output !== undefined ? patch.step1Output : current.step1Output,
    step2Output: patch.step2Output !== undefined ? patch.step2Output : current.step2Output,
    step3Output: patch.step3Output !== undefined ? patch.step3Output : current.step3Output,
    metadata: patch.metadata !== undefined ? patch.metadata : current.metadata,
    firNo: patch.firNo !== undefined ? patch.firNo : current.firNo,
    filedAt: patch.filedAt !== undefined ? patch.filedAt : current.filedAt
  };

  return writeWithSync({
    entityType: 'petitions',
    pgWrite: async () => {
      const { rows } = await query(
        `UPDATE petitions SET
           petition_no=$2, date=$3, complainant=$4, accused=$5,
           sections=$6::jsonb, section_recommendations=$7::jsonb, score=$8, status=$9,
           blockers=$10::jsonb, source_file=$11, step1_output=$12, step2_output=$13,
           step3_output=$14::jsonb, metadata=$15::jsonb, fir_no=$16, filed_at=$17,
           updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [
          current.pgId,
          next.petitionNo,
          next.date,
          next.complainant,
          next.accused,
          JSON.stringify(asJson(next.sections, [])),
          JSON.stringify(asJson(next.sectionRecommendations, [])),
          next.score,
          next.status,
          JSON.stringify(asJson(next.blockers, [])),
          next.sourceFile,
          next.step1Output || '',
          next.step2Output || '',
          JSON.stringify(asJson(next.step3Output, {})),
          JSON.stringify(asJson(next.metadata, {})),
          next.firNo || '',
          next.filedAt || ''
        ]
      );
      return { row: mapRow(rows[0]), mongoId: current.mongoId };
    },
    mongoSync: (row) => petitionsMongo.upsertFromPg(row)
  });
};

const deleteByLegacyId = async (legacyId) => {
  const current = await findByLegacyIdPg(legacyId);
  if (!current) {
    await petitionsMongo.deleteByLegacyId(legacyId);
    return true;
  }
  await query('DELETE FROM petitions WHERE id = $1', [current.pgId]);
  try {
    await petitionsMongo.deleteByLegacyId(legacyId);
  } catch (err) {
    console.warn('[petitionsRepo] Mongo delete sync failed:', err.message);
  }
  return true;
};

const scoresAscending = async () => {
  try {
    const { rows } = await query(
      'SELECT score, created_at FROM petitions ORDER BY created_at ASC'
    );
    return rows.map((r) => ({ score: r.score, createdAt: r.created_at }));
  } catch {
    return [];
  }
};

const upsertFromMigration = async (mapped) => {
  let existing = null;
  if (mapped.mongoId) {
    const { rows } = await query('SELECT * FROM petitions WHERE mongo_id = $1', [
      mapped.mongoId
    ]);
    existing = rows[0];
  }
  if (!existing) {
    const { rows } = await query('SELECT * FROM petitions WHERE legacy_id = $1', [
      mapped.legacyId
    ]);
    existing = rows[0];
  }

  if (existing) {
    const { rows } = await query(
      `UPDATE petitions SET
         mongo_id=COALESCE($2, mongo_id), petition_no=$3, date=$4, complainant=$5, accused=$6,
         sections=$7::jsonb, section_recommendations=$8::jsonb, score=$9, status=$10,
         blockers=$11::jsonb, source_file=$12, step1_output=$13, step2_output=$14,
         step3_output=$15::jsonb, metadata=$16::jsonb, fir_no=$17, filed_at=$18, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        existing.id,
        mapped.mongoId,
        mapped.petitionNo,
        mapped.date,
        mapped.complainant,
        mapped.accused,
        JSON.stringify(asJson(mapped.sections, [])),
        JSON.stringify(asJson(mapped.sectionRecommendations, [])),
        mapped.score,
        mapped.status,
        JSON.stringify(asJson(mapped.blockers, [])),
        mapped.sourceFile,
        mapped.step1Output || '',
        mapped.step2Output || '',
        JSON.stringify(asJson(mapped.step3Output, {})),
        JSON.stringify(asJson(mapped.metadata, {})),
        mapped.firNo || '',
        mapped.filedAt || ''
      ]
    );
    return mapRow(rows[0]);
  }

  const { rows: clash } = await query(
    'SELECT id, mongo_id, legacy_id FROM petitions WHERE petition_no = $1',
    [mapped.petitionNo]
  );
  if (clash[0] && clash[0].mongo_id !== mapped.mongoId && clash[0].legacy_id !== mapped.legacyId) {
    const err = new Error(
      `Identity conflict for petition_no=${mapped.petitionNo} mongo_id=${mapped.mongoId}`
    );
    err.code = 'IDENTITY_CONFLICT';
    throw err;
  }

  const { rows } = await query(
    `INSERT INTO petitions (
       mongo_id, legacy_id, petition_no, date, complainant, accused, sections,
       section_recommendations, score, status, blockers, source_file, step1_output,
       step2_output, step3_output, metadata, fir_no, filed_at, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,
       COALESCE($19, now()), COALESCE($20, now())
     ) RETURNING *`,
    [
      mapped.mongoId,
      mapped.legacyId,
      mapped.petitionNo,
      mapped.date,
      mapped.complainant || 'Unknown',
      mapped.accused || 'Unknown',
      JSON.stringify(asJson(mapped.sections, [])),
      JSON.stringify(asJson(mapped.sectionRecommendations, [])),
      mapped.score,
      mapped.status || 'Pending Filing',
      JSON.stringify(asJson(mapped.blockers, [])),
      mapped.sourceFile,
      mapped.step1Output || '',
      mapped.step2Output || '',
      JSON.stringify(asJson(mapped.step3Output, {})),
      JSON.stringify(asJson(mapped.metadata, {})),
      mapped.firNo || '',
      mapped.filedAt || '',
      mapped.createdAt,
      mapped.updatedAt
    ]
  );
  return mapRow(rows[0]);
};

module.exports = {
  mapRow,
  findByLegacyId,
  findByLegacyIdPg,
  findByPgId,
  list,
  count,
  countActiveBlockers,
  create,
  updateByLegacyId,
  deleteByLegacyId,
  scoresAscending,
  upsertFromMigration
};
