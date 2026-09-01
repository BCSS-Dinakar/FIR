const User = require('../../models/User');

const mapDoc = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    _id: String(obj._id),
    mongoId: String(obj._id),
    name: obj.name,
    badge: obj.badge,
    email: obj.email,
    mobile: obj.mobile,
    station: obj.station,
    passwordHash: obj.password,
    rank: obj.rank,
    state: obj.state,
    district: obj.district,
    themeModeUi: obj.themeModeUi,
    sidebarCollapse: obj.sidebarCollapse,
    lastLogin: obj.lastLogin,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

const findById = async (id) => {
  try {
    const doc = await User.findById(id);
    return mapDoc(doc);
  } catch {
    return null;
  }
};

const findByEmail = async (email) => {
  const doc = await User.findOne({ email: String(email).toLowerCase() });
  return mapDoc(doc);
};

const findByBadge = async (badge) => {
  const doc = await User.findOne({ badge });
  return mapDoc(doc);
};

const listPublic = async () => {
  const docs = await User.find({}, '-password').lean();
  return docs.map((d) => {
    const m = mapDoc(d);
    delete m.passwordHash;
    return m;
  });
};

/**
 * Mirror PG user into Mongo. If `plaintextPassword` is provided (new register),
 * let Mongoose hash it. Otherwise write password_hash directly via update.
 */
const upsertFromPg = async (pgUser, plaintextPassword) => {
  const filter = pgUser.mongoId
    ? { _id: pgUser.mongoId }
    : { email: pgUser.email };

  let existing = null;
  try {
    existing = await User.findOne(filter);
  } catch {
    existing = await User.findOne({ email: pgUser.email });
  }

  if (plaintextPassword) {
    if (existing) {
      existing.name = pgUser.name;
      existing.badge = pgUser.badge;
      existing.email = pgUser.email;
      existing.mobile = pgUser.mobile;
      existing.station = pgUser.station;
      existing.rank = pgUser.rank;
      existing.state = pgUser.state;
      existing.district = pgUser.district;
      existing.themeModeUi = pgUser.themeModeUi;
      existing.sidebarCollapse = pgUser.sidebarCollapse;
      existing.lastLogin = pgUser.lastLogin;
      existing.password = plaintextPassword;
      await existing.save();
      return { mongoId: String(existing._id) };
    }
    const created = await User.create({
      name: pgUser.name,
      badge: pgUser.badge,
      email: pgUser.email,
      mobile: pgUser.mobile,
      station: pgUser.station,
      password: plaintextPassword,
      rank: pgUser.rank,
      state: pgUser.state,
      district: pgUser.district,
      themeModeUi: pgUser.themeModeUi,
      sidebarCollapse: pgUser.sidebarCollapse,
      lastLogin: pgUser.lastLogin
    });
    await require('../../config/postgres').query(
      'UPDATE users SET mongo_id = $2 WHERE id = $1 AND mongo_id IS NULL',
      [pgUser.id, String(created._id)]
    );
    return { mongoId: String(created._id) };
  }

  const payload = {
    name: pgUser.name,
    badge: pgUser.badge,
    email: pgUser.email,
    mobile: pgUser.mobile,
    station: pgUser.station,
    rank: pgUser.rank,
    state: pgUser.state,
    district: pgUser.district,
    themeModeUi: pgUser.themeModeUi,
    sidebarCollapse: pgUser.sidebarCollapse,
    lastLogin: pgUser.lastLogin,
    password: pgUser.passwordHash
  };

  if (existing) {
    await User.collection.updateOne(
      { _id: existing._id },
      { $set: payload }
    );
    return { mongoId: String(existing._id) };
  }

  const inserted = await User.collection.insertOne({
    ...payload,
    createdAt: pgUser.createdAt || new Date(),
    updatedAt: pgUser.updatedAt || new Date()
  });
  const mongoId = String(inserted.insertedId);
  await require('../../config/postgres').query(
    'UPDATE users SET mongo_id = $2 WHERE id = $1 AND mongo_id IS NULL',
    [pgUser.id, mongoId]
  );
  return { mongoId };
};

module.exports = {
  mapDoc,
  findById,
  findByEmail,
  findByBadge,
  listPublic,
  upsertFromPg
};
