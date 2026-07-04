/**
 * Light TMS - Dashboard stats. New (additive) endpoint feeding the Recharts KPIs.
 *   GET /api/stats
 */

import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { asyncHandler } from '../../http/errors.js';
import { db } from '../../db/pool.js';

export const statsRouter = Router();

async function rows(sql: string): Promise<Record<string, any>[]> {
  const [r] = await db().query<RowDataPacket[]>(sql);
  return r as Record<string, any>[];
}

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [solicitudesPorEstado, colaPorEstado, despachosPorDia, totales] = await Promise.all([
      rows("SELECT estado, COUNT(*) AS n FROM solicitud_servicio GROUP BY estado"),
      rows("SELECT estado, COUNT(*) AS n FROM cola_envios WHERE tipo_documento NOT IN ('tercero','vehiculo') GROUP BY estado"),
      rows(
        `SELECT DATE(created_at) AS dia, COUNT(*) AS n
         FROM remesa
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
         GROUP BY DATE(created_at) ORDER BY dia`,
      ),
      rows(
        `SELECT
           (SELECT COUNT(*) FROM solicitud_servicio) AS solicitudes,
           (SELECT COUNT(*) FROM remesa) AS remesas,
           (SELECT COUNT(*) FROM manifiesto) AS manifiestos,
           (SELECT COUNT(*) FROM cola_envios WHERE estado = 'pendiente') AS cola_pendiente,
           (SELECT COUNT(*) FROM cola_envios WHERE estado = 'error') AS cola_error`,
      ),
    ]);

    res.json({
      solicitudesPorEstado: solicitudesPorEstado.map((r) => ({ estado: r.estado, n: Number(r.n) })),
      colaPorEstado: colaPorEstado.map((r) => ({ estado: r.estado, n: Number(r.n) })),
      despachosPorDia: despachosPorDia.map((r) => ({ dia: String(r.dia), n: Number(r.n) })),
      totales: totales[0] ?? {},
    });
  }),
);
