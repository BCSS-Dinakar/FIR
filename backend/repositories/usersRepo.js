const bcrypt = require('bcryptjs');
const { query } = require('../config/postgres');
const { writeWithSync, readWithFallback } = require('./dualWrite');
const usersMongo = require('../adapters/mongo/usersMongo');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id || null,
    name: row.name,
    badge: row.badge,
    email: row.email,
    mobile: row.mobile,
    station: row.station,
    passwordHash: row.password_hash,
    rank: row.rank,
    state: row.state,
    district: row.district,
    themeModeUi: row.theme_mode_ui,
    sidebarCollapse: row.sidebar_collapse,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const toPublic = (user) => {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
};

const findByIdPg = async (id) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return mapRow(rows[0]);
};

const findByMongoIdPg = async (mongoId) => {
  const { rows } = await query('SELECT * FROM users WHERE mongo_id = $1', [mongoId]);
  return mapRow(rows[0]);
};

const findByEmailPg = async (email) => {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [
    String(email).toLowerCase()
  ]);
  return mapRow(rows[0]);
};

const findByBadgePg = async (badge) => {
  const { rows } = await query('SELECT * FROM users WHERE badge = $1', [badge]);
  return mapRow(rows[0]);
};

const findById = async (id) => {
  if (!id) return null;
  const isUuid = UUID_RE.test(String(id));
  const { row } = await readWithFallback({
    entityType: 'users',
    lookupKey: String(id),
    pgRead: () => (isUuid ? findByIdPg(id) : findByMongoIdPg(String(id))),
    mongoRead: () => usersMongo.findById(String(id))
  });
  return row;
};

const findByEmail = async (email) => {
  const { row } = await readWithFallback({
    entityType: 'users',
    lookupKey: `email:${email}`,
    pgRead: () => findByEmailPg(email),
    mongoRead: () => usersMongo.findByEmail(email)
  });
  return row;
};

const findByBadge = async (badge) => {
  const { row } = await readWithFallback({
    entityType: 'users',
    lookupKey: `badge:${badge}`,
    pgRead: () => findByBadgePg(badge),
    mongoRead: () => usersMongo.findByBadge(badge)
  });
  return row;
};

const listPublic = async () => {
  try {
    const { rows } = await query(
      `SELECT id, mongo_id, name, badge, email, mobile, station, rank, state, district,
              theme_mode_ui, sidebar_collapse, last_login, created_at, updated_at
       FROM users ORDER BY created_at ASC`
    );
    return rows.map((r) => toPublic(mapRow({ ...r, password_hash: null })));
  } catch (err) {
    console.warn('[usersRepo] listPublic PG failed:', err.message);
    return usersMongo.listPublic();
  }
};

const create = async (data) => {
  const passwordHash = await bcrypt.hash(data.password, 10);
  const row = await writeWithSync({
    entityType: 'users',
    pgWrite: async () => {
      const { rows } = await query(
        `INSERT INTO users
           (name, badge, email, mobile, station, password_hash, rank, state, district, theme_mode_ui, sidebar_collapse, mongo_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          data.name,
          data.badge,
          String(data.email).toLowerCase(),
          data.mobile,
          data.station,
          passwordHash,
          data.rank || 'Inspector',
          data.state || 'Telangana',
          data.district || 'Hyderabad',
          data.themeModeUi || 'dark',
          data.sidebarCollapse === true,
          data.mongoId || null
        ]
      );
      return { row: mapRow(rows[0]) };
    },
    mongoSync: (pgRow) => usersMongo.upsertFromPg(pgRow, data.password)
  });
  return row;
};

const updateById = async (id, patch) => {
  const current = await findById(id);
  if (!current) return null;

  const next = {
    name: patch.name !== undefined ? patch.name : current.name,
    station: patch.station !== undefined ? patch.station : current.station,
    district: patch.district !== undefined ? patch.district : current.district,
    rank: patch.rank !== undefined ? patch.rank : current.rank,
    themeModeUi:
      patch.themeModeUi !== undefined ? patch.themeModeUi : current.themeModeUi,
    sidebarCollapse:
      patch.sidebarCollapse !== undefined
        ? patch.sidebarCollapse
        : current.sidebarCollapse,
    lastLogin: patch.lastLogin !== undefined ? patch.lastLogin : current.lastLogin
  };

  return writeWithSync({
    entityType: 'users',
    pgWrite: async () => {
      const { rows } = await query(
        `UPDATE users SET
           name = $2, station = $3, district = $4, rank = $5,
           theme_mode_ui = $6, sidebar_collapse = $7, last_login = $8,
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          current.id,
          next.name,
          next.station,
          next.district,
          next.rank,
          next.themeModeUi,
          next.sidebarCollapse,
          next.lastLogin
        ]
      );
      return { row: mapRow(rows[0]), mongoId: current.mongoId };
    },
    mongoSync: (pgRow) => usersMongo.upsertFromPg(pgRow)
  });
};

const comparePassword = async (user, plain) => {
  if (!user?.passwordHash) return false;
  return bcrypt.compare(plain, user.passwordHash);
};

const upsertFromMigration = async (mapped) => {
  const existing = mapped.mongoId ? await findByMongoIdPg(mapped.mongoId) : null;

  if (existing) {
    const { rows } = await query(
      `UPDATE users SET
         name=$2, badge=$3, email=$4, mobile=$5, station=$6, password_hash=$7,
         rank=$8, state=$9, district=$10, theme_mode_ui=$11, sidebar_collapse=$12,
         last_login=$13, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        existing.id,
        mapped.name,
        mapped.badge,
        mapped.email,
        mapped.mobile,
        mapped.station,
        mapped.passwordHash,
        mapped.rank,
        mapped.state,
        mapped.district,
        mapped.themeModeUi,
        mapped.sidebarCollapse,
        mapped.lastLogin
      ]
    );
    return mapRow(rows[0]);
  }

  const emailClash = await findByEmailPg(mapped.email);
  const badgeClash = await findByBadgePg(mapped.badge);
  if (emailClash || badgeClash) {
    const err = new Error(
      `Identity conflict for mongo_id=${mapped.mongoId}: email or badge already owned by another PG user`
    );
    err.code = 'IDENTITY_CONFLICT';
    throw err;
  }

  const { rows } = await query(
    `INSERT INTO users
       (mongo_id, name, badge, email, mobile, station, password_hash, rank, state, district,
        theme_mode_ui, sidebar_collapse, last_login, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, now()), COALESCE($15, now()))
     RETURNING *`,
    [
      mapped.mongoId,
      mapped.name,
      mapped.badge,
      mapped.email,
      mapped.mobile,
      mapped.station,
      mapped.passwordHash,
      mapped.rank,
      mapped.state,
      mapped.district,
      mapped.themeModeUi,
      mapped.sidebarCollapse,
      mapped.lastLogin,
      mapped.createdAt,
      mapped.updatedAt
    ]
  );
  return mapRow(rows[0]);
};

module.exports = {
  mapRow,
  toPublic,
  findById,
  findByEmail,
  findByBadge,
  listPublic,
  create,
  updateById,
  comparePassword,
  upsertFromMigration,
  findByIdPg,
  findByMongoIdPg
};
