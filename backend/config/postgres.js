const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'legislative',
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

const withClient = async (fn) => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release();
  }
};

const connectPostgres = async () => {
  const result = await pool.query('SELECT 1 AS ok');
  if (!result.rows[0]?.ok) {
    throw new Error('PostgreSQL ping failed');
  }
  console.log(
    `✅ PostgreSQL Connected: ${process.env.POSTGRES_HOST}/${process.env.POSTGRES_DB || 'legislative'}`
  );
};

const flags = () => ({
  pgPrimary: process.env.PG_PRIMARY !== 'false',
  mongoSync: process.env.MONGO_SYNC !== 'false',
  mongoFallback: process.env.MONGO_FALLBACK !== 'false'
});

module.exports = {
  pool,
  query,
  withClient,
  withTransaction,
  connectPostgres,
  flags
};
