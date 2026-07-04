/**
 * Light TMS - Own company master (single row id=1). Port of EmpresaRepo.php.
 *
 * The consecutivo reserve-and-format methods use a compare-and-set UPDATE for
 * optimistic concurrency, exactly like the PHP. They accept an optional
 * connection so the despacho transaction (Phase 4) reserves numbers atomically
 * on the same connection.
 */

import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '../../db/pool.js';

type Queryable = Pool | PoolConnection;

export interface Empresa {
  id: number;
  tipo_id: string;
  nit: string;
  razon_social: string | null;
  nro_poliza: string | null;
  emf: string | null;
  consecutivo_remesa: string;
  consecutivo_manifiesto: string;
}

const DEFAULTS: Empresa = {
  id: 1,
  tipo_id: 'N',
  nit: '',
  razon_social: '',
  nro_poliza: '',
  emf: '',
  consecutivo_remesa: 'REM-00000',
  consecutivo_manifiesto: 'MAN-00000',
};

/** Returns the company row, or defaults. Port of obtener(). */
export async function obtener(exec: Queryable = db()): Promise<Empresa> {
  const [rows] = await exec.query<(Empresa & RowDataPacket)[]>('SELECT * FROM maestro_empresa WHERE id = 1');
  return rows[0] ?? { ...DEFAULTS };
}

/** Upserts the company row. Port of guardar(). */
export async function guardar(datos: Partial<Empresa>): Promise<void> {
  await db().query(
    `INSERT INTO maestro_empresa (id, tipo_id, nit, razon_social, nro_poliza, emf, consecutivo_remesa, consecutivo_manifiesto)
     VALUES (1, :tipo_id, :nit, :razon_social, :nro_poliza, :emf, :consecutivo_remesa, :consecutivo_manifiesto)
     ON DUPLICATE KEY UPDATE
        tipo_id = VALUES(tipo_id), nit = VALUES(nit),
        razon_social = VALUES(razon_social), nro_poliza = VALUES(nro_poliza),
        emf = VALUES(emf),
        consecutivo_remesa = VALUES(consecutivo_remesa),
        consecutivo_manifiesto = VALUES(consecutivo_manifiesto)`,
    {
      tipo_id: datos.tipo_id ?? 'N',
      nit: (datos.nit ?? '').toString().trim(),
      razon_social: (datos.razon_social ?? '').toString().trim() || null,
      nro_poliza: (datos.nro_poliza ?? '').toString().trim() || null,
      emf: (datos.emf ?? '').toString().trim() || null,
      consecutivo_remesa: (datos.consecutivo_remesa ?? 'REM-00000').toString().trim(),
      consecutivo_manifiesto: (datos.consecutivo_manifiesto ?? 'MAN-00000').toString().trim(),
    },
  );
}

/** Extracts the number from a "PREF-00000" consecutivo. Port of extraerNum(). */
function extraerNum(val: string): number {
  const parts = val.split('-');
  return Number.parseInt(parts.length > 1 ? (parts[1] ?? '0') : (parts[0] ?? '0'), 10) || 0;
}

const pad = (n: number, len: number) => String(n).padStart(len, '0');

/** Reserves and returns the next remesa consecutivo (REM-00001). Port of siguienteRemesa(). */
export async function siguienteRemesa(exec: Queryable = db()): Promise<string> {
  const emp = await obtener(exec);
  const next = extraerNum(emp.consecutivo_remesa ?? '0') + 1;
  const fmt = 'REM-' + pad(next, 5);
  await exec.query('UPDATE maestro_empresa SET consecutivo_remesa = :fmt WHERE id = 1 AND consecutivo_remesa = :prev', {
    fmt,
    prev: emp.consecutivo_remesa ?? '',
  });
  return fmt;
}

/** Reserves and returns the next manifiesto consecutivo (MAN-00001). Port of siguienteManifiesto(). */
export async function siguienteManifiesto(exec: Queryable = db()): Promise<string> {
  const emp = await obtener(exec);
  const next = extraerNum(emp.consecutivo_manifiesto ?? '0') + 1;
  const fmt = 'MAN-' + pad(next, 5);
  await exec.query(
    'UPDATE maestro_empresa SET consecutivo_manifiesto = :fmt WHERE id = 1 AND consecutivo_manifiesto = :prev',
    { fmt, prev: emp.consecutivo_manifiesto ?? '' },
  );
  return fmt;
}
