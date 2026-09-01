const { query } = require('../config/postgres');

/**
 * Orchestration-only sync status helper.
 * Avoids partial-unique ON CONFLICT edge cases via select-then-upsert.
 */
const upsertSyncStatus = async ({
  entityType,
  postgresId = null,
  mongoId = null,
  syncDirection,
  syncStatus,
  lastError = null
}) => {
  if (postgresId) {
    const existing = await query(
      `SELECT id FROM migration_sync_status
       WHERE entity_type = $1 AND postgres_id = $2 AND sync_direction = $3
       LIMIT 1`,
      [entityType, postgresId, syncDirection]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE migration_sync_status
         SET mongo_id = $2, sync_status = $3, last_synced_at = now(), last_error = $4
         WHERE id = $1`,
        [existing.rows[0].id, mongoId, syncStatus, lastError]
      );
      return;
    }
  }

  await query(
    `INSERT INTO migration_sync_status
       (entity_type, postgres_id, mongo_id, sync_direction, sync_status, last_synced_at, last_error)
     VALUES ($1, $2, $3, $4, $5, now(), $6)`,
    [entityType, postgresId, mongoId, syncDirection, syncStatus, lastError]
  );
};

const writeWithSync = async ({ entityType, pgWrite, mongoSync }) => {
  const { flags } = require('../config/postgres');
  const { mongoSync: syncEnabled } = flags();
  const { row, mongoId = row?.mongoId || null } = await pgWrite();

  if (!syncEnabled || typeof mongoSync !== 'function') {
    await upsertSyncStatus({
      entityType,
      postgresId: row.id || row.pgId || null,
      mongoId,
      syncDirection: 'pg_to_mongo',
      syncStatus: 'synced',
      lastError: null
    });
    return row;
  }

  try {
    const syncResult = await mongoSync(row);
    const resolvedMongoId = syncResult?.mongoId || mongoId || null;
    await upsertSyncStatus({
      entityType,
      postgresId: row.pgId || row.id,
      mongoId: resolvedMongoId,
      syncDirection: 'pg_to_mongo',
      syncStatus: 'synced',
      lastError: null
    });
    if (resolvedMongoId && !row.mongoId) row.mongoId = resolvedMongoId;
  } catch (err) {
    console.warn(
      `[dualWrite] Mongo sync failed for ${entityType} ${row.pgId || row.id}: ${err.message}`
    );
    await upsertSyncStatus({
      entityType,
      postgresId: row.pgId || row.id,
      mongoId,
      syncDirection: 'pg_to_mongo',
      syncStatus: 'failed',
      lastError: err.message
    });
  }

  return row;
};

const readWithFallback = async ({
  entityType,
  pgRead,
  mongoRead,
  lookupKey
}) => {
  const { flags } = require('../config/postgres');
  const { mongoFallback } = flags();

  try {
    const row = await pgRead();
    if (row) return { row, source: 'postgres' };
  } catch (err) {
    console.warn(
      `[dualWrite] PostgreSQL read failed for ${entityType} (${lookupKey}): ${err.message}`
    );
    if (!mongoFallback || typeof mongoRead !== 'function') throw err;
    const fallback = await mongoRead();
    if (fallback) {
      console.warn(
        `[dualWrite] fallback_source=mongo entity=${entityType} key=${lookupKey}`
      );
      return { row: fallback, source: 'mongo' };
    }
    throw err;
  }

  if (mongoFallback && typeof mongoRead === 'function') {
    const fallback = await mongoRead();
    if (fallback) {
      console.warn(
        `[dualWrite] fallback_source=mongo entity=${entityType} key=${lookupKey}`
      );
      return { row: fallback, source: 'mongo' };
    }
  }

  return { row: null, source: 'postgres' };
};

module.exports = {
  upsertSyncStatus,
  writeWithSync,
  readWithFallback
};