/**
 * Light TMS - Solicitud weight budget (kg). A solicitud declares one total
 * `peso` at capture time; despachar() can be called repeatedly (up to
 * cantidad_vehiculos times) to split that same cargo across several
 * remesas/manifiestos. This tracks how much of that budget is already
 * committed, so a dispatcher can't over-allocate weight across despachos.
 */

import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

type Queryable = Pool | PoolConnection;

/**
 * Total kg already committed to a solicitud's remesas across every despacho
 * created so far. Pass `excluirManifiestoId` when editing that manifiesto's
 * own remesas, so their current weight doesn't count against itself.
 */
export async function pesoAsignadoSolicitud(
  conn: Queryable,
  solicitudId: number,
  excluirManifiestoId: number | null = null,
): Promise<number> {
  // Una remesa anulada ya no ocupa cupo — su peso vuelve a estar disponible.
  let sql = "SELECT COALESCE(SUM(r.peso), 0) AS total FROM remesa r WHERE r.solicitud_id = ? AND r.estado_rndc <> 'anulado'";
  const params: unknown[] = [solicitudId];
  if (excluirManifiestoId !== null) {
    sql += ' AND r.id NOT IN (SELECT mr.remesa_id FROM manifiesto_remesa mr WHERE mr.manifiesto_id = ?)';
    params.push(excluirManifiestoId);
  }
  const [rows] = await conn.query<(RowDataPacket & { total: number })[]>(sql, params);
  return Number(rows[0]?.total ?? 0);
}

/** Sums the `peso` field across a proposed remesas payload (form input, not yet saved). */
export function pesoTotalDe(remesas: unknown): number {
  if (!Array.isArray(remesas)) return 0;
  return remesas.reduce((acc: number, r: any) => acc + (Number(r?.peso) || 0), 0);
}
