import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 500) {
    logger.warn({ query: text.slice(0, 100), duration_ms: duration }, 'Slow query detected');
  }

  return result;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

export async function queryMany<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
