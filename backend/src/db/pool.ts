/**
 * Light TMS - MySQL/MariaDB connection pool (mysql2/promise).
 *
 * Port of src/db.php. Uses a shared pool instead of a single PDO singleton so
 * concurrent HTTP requests don't serialise on one connection. Prepared
 * statements are parameterised (equivalent to PDO's ATTR_EMULATE_PREPARES=false).
 */

import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { config } from '../config/env.js';

let poolInstance: Pool | null = null;

/** Returns the shared connection pool (created lazily). */
export function db(): Pool {
  if (poolInstance) return poolInstance;
  const cfg = config().db;
  poolInstance = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.name,
    user: cfg.user,
    password: cfg.pass,
    charset: cfg.charset === 'utf8mb4' ? 'utf8mb4' : cfg.charset,
    waitForConnections: true,
    connectionLimit: 10,
    // Keep DECIMAL/BIGINT as strings to preserve precision (mirrors PDO which
    // returns them as strings); the app formats money/ids as text for the RNDC.
    decimalNumbers: false,
    dateStrings: true,
    namedPlaceholders: true,
  });
  return poolInstance;
}

/**
 * Reports whether the database is reachable, without throwing.
 * Port of db_disponible().
 */
export async function dbDisponible(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db().query('SELECT 1');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Runs `fn` inside a transaction on a dedicated connection, committing on
 * success and rolling back on any throw. Ports the beginTransaction/commit/
 * rollBack pattern used by SolicitudRepo::confirmarDespacho and cumplido.guardar.
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore rollback errors */
    }
    throw e;
  } finally {
    conn.release();
  }
}
