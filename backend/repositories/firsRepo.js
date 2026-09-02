const { query } = require('../config/postgres');
const { writeWithSync, readWithFallback } = require('./dualWrite');
const firsMongo = require('../adapters/mongo/firsMongo');
const petitionsRepo = require('./petitionsRepo');

const asJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return value;
};

const mapRow = (row, legacyPetitionId) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    pgId: row.id,
    mongoId: row.mongo_id || null,
    firNo: row.fir_no,
    petitionId: legacyPetitionId || row.legacy_petition_id || null,
    petitionPgId: row.petition_id,
    district: row.district || '',
    policeStation: row.police_station || '',
    year: row.year || '',
    firDate: row.fir_date || '',
    firTime: row.fir_time || '',
    sections: row.sections || [],
    occurrenceDay: row.occurrence_day || '',
    occurrenceDateFrom: row.occurrence_date_from || '',
    occurrenceTimeFrom: row.occurrence_time_from || '',
    occurrenceDateTo: row.occurrence_date_to || '',
    occurrenceTimeTo: row.occurrence_time_to || '',
    priorToTimePeriod: row.prior_to_time_period || '',
    receivedDate: row.received_date || '',
    receivedTime: row.received_time || '',
    gdEntryNo: row.gd_entry_no || '',
    gdDateTime: row.gd_date_time || '',
    typeOfInformation: row.type_of_information || 'Written',
    distanceDirection: row.distance_direction || '',
    beatNo: row.beat_no || '',
    occurrenceAddress: row.occurrence_address || '',
    outsideLimitPSName: row.outside_limit_ps_name || '',
    outsideLimitDistrict: row.outside_limit_district || '',
    complainant: row.complainant || '',
    complainantRelative: row.complainant_relative || '',
    complainantDob: row.complainant_dob || '',
    complainantAge: row.complainant_age || '',
    complainantNationality: row.complainant_nationality || 'India',
    complainantCaste: row.complainant_caste || '',
    complainantPassport: row.complainant_passport || '',
    complainantPassportIssueDate: row.complainant_passport_issue_date || '',
    complainantPassportIssuePlace: row.complainant_passport_issue_place || '',
    complainantOccupation: row.complainant_occupation || '',
    complainantPhone: row.complainant_phone || '',
    complainantAddress: row.complainant_address || '',
    accused: row.accused || '',
    accusedList: row.accused_list || [],
    reasonsForDelay: row.reasons_for_delay || '',
    propertiesStolen: row.properties_stolen || '',
    totalValueStolen: row.total_value_stolen || '',
    inquestReport: row.inquest_report || '',
    incidentFacts: row.incident_facts || '',
    actionTaken: row.action_taken || '1',
    refusedInvestigationDueTo: row.refused_investigation_due_to || '',
    transferredPS: row.transferred_ps || '',
    transferredDistrict: row.transferred_district || '',
    officerName: row.officer_name || '',
    officerRank: row.officer_rank || '',
    officerNo: row.officer_no || '',
    dispatchDateTime: row.dispatch_date_time || '',
    filedAt: row.filed_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const resolvePetitionPgId = async (petitionLegacyId) => {
  const petition = await petitionsRepo.findByLegacyIdPg(petitionLegacyId);
  if (!petition) {
    const err = new Error(`Petition not found for legacy_id=${petitionLegacyId}`);
    err.code = 'PETITION_NOT_FOUND';
    throw err;
  }
  return petition;
};

const findByPetitionLegacyIdPg = async (legacyId) => {
  const { rows } = await query(
    `SELECT f.*, p.legacy_id AS legacy_petition_id
     FROM firs f
     JOIN petitions p ON p.id = f.petition_id
     WHERE p.legacy_id = $1`,
    [legacyId]
  );
  return mapRow(rows[0], legacyId);
};

const findByPetitionLegacyId = async (legacyId) => {
  const { row } = await readWithFallback({
    entityType: 'firs',
    lookupKey: `petition:${legacyId}`,
    pgRead: () => findByPetitionLegacyIdPg(legacyId),
    mongoRead: () => firsMongo.findByPetitionLegacyId(legacyId)
  });
  return row;
};

const list = async ({ search } = {}) => {
  try {
    const params = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE f.complainant ILIKE $1 OR f.accused ILIKE $1 OR f.fir_no ILIKE $1`;
    }
    const { rows } = await query(
      `SELECT f.*, p.legacy_id AS legacy_petition_id
       FROM firs f
       JOIN petitions p ON p.id = f.petition_id
       ${where}
       ORDER BY f.created_at DESC`,
      params
    );
    return rows.map((r) => mapRow(r, r.legacy_petition_id));
  } catch (err) {
    console.warn('[firsRepo] list PG failed:', err.message);
    return firsMongo.findMany();
  }
};

const insertParamsFromData = (data, petitionPgId) => [
  data.mongoId || null,
  data.firNo,
  petitionPgId,
  data.district || '',
  data.policeStation || '',
  data.year || '',
  data.firDate || '',
  data.firTime || '',
  JSON.stringify(asJson(data.sections, [])),
  data.occurrenceDay || '',
  data.occurrenceDateFrom || '',
  data.occurrenceTimeFrom || '',
  data.occurrenceDateTo || '',
  data.occurrenceTimeTo || '',
  data.priorToTimePeriod || '',
  data.receivedDate || '',
  data.receivedTime || '',
  data.gdEntryNo || '',
  data.gdDateTime || '',
  data.typeOfInformation || 'Written',
  data.distanceDirection || '',
  data.beatNo || '',
  data.occurrenceAddress || '',
  data.outsideLimitPSName || '',
  data.outsideLimitDistrict || '',
  data.complainant || '',
  data.complainantRelative || '',
  data.complainantDob || '',
  data.complainantAge || '',
  data.complainantNationality || 'India',
  data.complainantCaste || '',
  data.complainantPassport || '',
  data.complainantPassportIssueDate || '',
  data.complainantPassportIssuePlace || '',
  data.complainantOccupation || '',
  data.complainantPhone || '',
  data.complainantAddress || '',
  data.accused || '',
  JSON.stringify(asJson(data.accusedList, [])),
  data.reasonsForDelay || '',
  data.propertiesStolen || '',
  data.totalValueStolen || '',
  data.inquestReport || '',
  data.incidentFacts || '',
  data.actionTaken || '1',
  data.refusedInvestigationDueTo || '',
  data.transferredPS || '',
  data.transferredDistrict || '',
  data.officerName || '',
  data.officerRank || '',
  data.officerNo || '',
  data.dispatchDateTime || '',
  data.filedAt || ''
];

const create = async (data) => {
  const petition = await resolvePetitionPgId(data.petitionId);
  return writeWithSync({
    entityType: 'firs',
    pgWrite: async () => {
      const params = insertParamsFromData(data, petition.pgId);
      const { rows } = await query(
        `INSERT INTO firs (
           mongo_id, fir_no, petition_id, district, police_station, year, fir_date, fir_time,
           sections, occurrence_day, occurrence_date_from, occurrence_time_from,
           occurrence_date_to, occurrence_time_to, prior_to_time_period, received_date,
           received_time, gd_entry_no, gd_date_time, type_of_information, distance_direction,
           beat_no, occurrence_address, outside_limit_ps_name, outside_limit_district,
           complainant, complainant_relative, complainant_dob, complainant_age,
           complainant_nationality, complainant_caste, complainant_passport,
           complainant_passport_issue_date, complainant_passport_issue_place,
           complainant_occupation, complainant_phone, complainant_address, accused,
           accused_list, reasons_for_delay, properties_stolen, total_value_stolen,
           inquest_report, incident_facts, action_taken, refused_investigation_due_to,
           transferred_ps, transferred_district, officer_name, officer_rank, officer_no,
           dispatch_date_time, filed_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
           $39::jsonb,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53
         )
         ON CONFLICT (petition_id) DO UPDATE SET
           mongo_id=COALESCE(EXCLUDED.mongo_id, firs.mongo_id), fir_no=EXCLUDED.fir_no,
           district=EXCLUDED.district, police_station=EXCLUDED.police_station, year=EXCLUDED.year,
           fir_date=EXCLUDED.fir_date, fir_time=EXCLUDED.fir_time, sections=EXCLUDED.sections,
           occurrence_day=EXCLUDED.occurrence_day, occurrence_date_from=EXCLUDED.occurrence_date_from,
           occurrence_time_from=EXCLUDED.occurrence_time_from, occurrence_date_to=EXCLUDED.occurrence_date_to,
           occurrence_time_to=EXCLUDED.occurrence_time_to, prior_to_time_period=EXCLUDED.prior_to_time_period,
           received_date=EXCLUDED.received_date, received_time=EXCLUDED.received_time,
           gd_entry_no=EXCLUDED.gd_entry_no, gd_date_time=EXCLUDED.gd_date_time,
           type_of_information=EXCLUDED.type_of_information, distance_direction=EXCLUDED.distance_direction,
           beat_no=EXCLUDED.beat_no, occurrence_address=EXCLUDED.occurrence_address,
           outside_limit_ps_name=EXCLUDED.outside_limit_ps_name, outside_limit_district=EXCLUDED.outside_limit_district,
           complainant=EXCLUDED.complainant, complainant_relative=EXCLUDED.complainant_relative,
           complainant_dob=EXCLUDED.complainant_dob, complainant_age=EXCLUDED.complainant_age,
           complainant_nationality=EXCLUDED.complainant_nationality, complainant_caste=EXCLUDED.complainant_caste,
           complainant_passport=EXCLUDED.complainant_passport,
           complainant_passport_issue_date=EXCLUDED.complainant_passport_issue_date,
           complainant_passport_issue_place=EXCLUDED.complainant_passport_issue_place,
           complainant_occupation=EXCLUDED.complainant_occupation, complainant_phone=EXCLUDED.complainant_phone,
           complainant_address=EXCLUDED.complainant_address, accused=EXCLUDED.accused,
           accused_list=EXCLUDED.accused_list, reasons_for_delay=EXCLUDED.reasons_for_delay,
           properties_stolen=EXCLUDED.properties_stolen, total_value_stolen=EXCLUDED.total_value_stolen,
           inquest_report=EXCLUDED.inquest_report, incident_facts=EXCLUDED.incident_facts,
           action_taken=EXCLUDED.action_taken, refused_investigation_due_to=EXCLUDED.refused_investigation_due_to,
           transferred_ps=EXCLUDED.transferred_ps, transferred_district=EXCLUDED.transferred_district,
           officer_name=EXCLUDED.officer_name, officer_rank=EXCLUDED.officer_rank, officer_no=EXCLUDED.officer_no,
           dispatch_date_time=EXCLUDED.dispatch_date_time,
           filed_at=CASE WHEN EXCLUDED.filed_at <> '' THEN EXCLUDED.filed_at ELSE firs.filed_at END,
           updated_at=now()
         RETURNING *`,
        params
      );
      return {
        row: mapRow({ ...rows[0], legacy_petition_id: petition.legacyId }, petition.legacyId)
      };
    },
    mongoSync: (row) => firsMongo.upsertFromPg(row)
  });
};

const upsertFromMigration = async (mapped) => {
  const petition = await petitionsRepo.findByLegacyIdPg(mapped.petitionId);
  if (!petition) {
    const err = new Error(`Orphan FIR: no petition for petitionId=${mapped.petitionId}`);
    err.code = 'ORPHAN_FIR';
    throw err;
  }

  let existing = null;
  if (mapped.mongoId) {
    const { rows } = await query('SELECT * FROM firs WHERE mongo_id = $1', [mapped.mongoId]);
    existing = rows[0];
  }
  if (!existing) {
    const { rows } = await query('SELECT * FROM firs WHERE petition_id = $1', [petition.pgId]);
    existing = rows[0];
  }

  const params = insertParamsFromData(mapped, petition.pgId);

  if (existing) {
    // Keep $1..$53 contiguous with insertParamsFromData (including petition_id at $3).
    // Skipping $3 made Postgres raise: "could not determine data type of parameter $3".
    const updateParams = [...params, existing.id];
    const { rows } = await query(
      `UPDATE firs SET
         mongo_id=COALESCE($1, mongo_id), fir_no=$2, petition_id=$3::uuid,
         district=$4, police_station=$5, year=$6, fir_date=$7, fir_time=$8,
         sections=$9::jsonb, occurrence_day=$10, occurrence_date_from=$11, occurrence_time_from=$12,
         occurrence_date_to=$13, occurrence_time_to=$14, prior_to_time_period=$15,
         received_date=$16, received_time=$17, gd_entry_no=$18, gd_date_time=$19,
         type_of_information=$20, distance_direction=$21, beat_no=$22, occurrence_address=$23,
         outside_limit_ps_name=$24, outside_limit_district=$25, complainant=$26,
         complainant_relative=$27, complainant_dob=$28, complainant_age=$29,
         complainant_nationality=$30, complainant_caste=$31, complainant_passport=$32,
         complainant_passport_issue_date=$33, complainant_passport_issue_place=$34,
         complainant_occupation=$35, complainant_phone=$36, complainant_address=$37,
         accused=$38, accused_list=$39::jsonb, reasons_for_delay=$40, properties_stolen=$41,
         total_value_stolen=$42, inquest_report=$43, incident_facts=$44, action_taken=$45,
         refused_investigation_due_to=$46, transferred_ps=$47, transferred_district=$48,
         officer_name=$49, officer_rank=$50, officer_no=$51, dispatch_date_time=$52,
         filed_at=$53, updated_at=now()
       WHERE id=$54
       RETURNING *`,
      updateParams
    );
    return mapRow({ ...rows[0], legacy_petition_id: petition.legacyId }, petition.legacyId);
  }

  const { rows: clash } = await query(
    'SELECT id, mongo_id FROM firs WHERE fir_no = $1',
    [mapped.firNo]
  );
  if (clash[0] && clash[0].mongo_id !== mapped.mongoId) {
    const err = new Error(
      `Identity conflict for fir_no=${mapped.firNo} mongo_id=${mapped.mongoId}`
    );
    err.code = 'IDENTITY_CONFLICT';
    throw err;
  }

  const { rows } = await query(
    `INSERT INTO firs (
       mongo_id, fir_no, petition_id, district, police_station, year, fir_date, fir_time,
       sections, occurrence_day, occurrence_date_from, occurrence_time_from,
       occurrence_date_to, occurrence_time_to, prior_to_time_period, received_date,
       received_time, gd_entry_no, gd_date_time, type_of_information, distance_direction,
       beat_no, occurrence_address, outside_limit_ps_name, outside_limit_district,
       complainant, complainant_relative, complainant_dob, complainant_age,
       complainant_nationality, complainant_caste, complainant_passport,
       complainant_passport_issue_date, complainant_passport_issue_place,
       complainant_occupation, complainant_phone, complainant_address, accused,
       accused_list, reasons_for_delay, properties_stolen, total_value_stolen,
       inquest_report, incident_facts, action_taken, refused_investigation_due_to,
       transferred_ps, transferred_district, officer_name, officer_rank, officer_no,
       dispatch_date_time, filed_at, created_at, updated_at
     ) VALUES (
       $1,$2,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
       $39::jsonb,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,
       COALESCE($54::timestamptz, now()), COALESCE($55::timestamptz, now())
     ) RETURNING *`,
    [...params, mapped.createdAt || null, mapped.updatedAt || null]
  );
  return mapRow({ ...rows[0], legacy_petition_id: petition.legacyId }, petition.legacyId);
};

module.exports = {
  mapRow,
  findByPetitionLegacyId,
  findByPetitionLegacyIdPg,
  list,
  create,
  upsertFromMigration
};
