/**
 * Light TMS - Informe routes.
 *   GET /api/informe        paginated JSON preview
 *   GET /api/informe/csv    full CSV download
 * Filters: q, num_remesa, num_manifiesto, estado, cliente, desde, hasta.
 * `nivel` = 'remesa' (detail, default) | 'manifiesto' (summary).
 */

import { Router } from 'express';
import { asyncHandler } from '../../http/errors.js';
import { toCsv, type CsvColumn } from '../../util/csv.js';
import { requirePagina } from '../auth/auth.middleware.js';
import * as repo from './informe.repo.js';
import type { InformeRow, InformeFiltros, InformeNivel } from './informe.repo.js';

export const informeRouter = Router();
informeRouter.use(requirePagina('informe'));

/** Columns for the remesa (detail) level. */
const COLUMNS_REMESA: CsvColumn<InformeRow>[] = [
  ['id_remesa', 'ID Remesa'],
  ['num_remesa', 'No. Remesa'],
  ['id_manifiesto', 'ID Manifiesto'],
  ['num_manifiesto', 'No. Manifiesto'],
  ['consecutivo_solicitud', 'Consecutivo Solicitud'],
  ['estado_proceso', 'Estado'],
  ['estado_solicitud', 'Estado Solicitud'],
  ['estado_remesa_rndc', 'Estado Remesa RNDC'],
  ['estado_manifiesto_rndc', 'Estado Manifiesto RNDC'],
  ['estado_cumplido', 'Estado Cumplido'],
  ['fecha_solicitud', 'Fecha Solicitud'],
  ['fecha_despacho', 'Fecha Despacho'],
  ['fecha_cumplido', 'Fecha Cumplido'],
  ['placa', 'Placa'],
  ['conductor', 'Conductor'],
  ['tenedor', 'Tenedor'],
  ['cliente', 'Cliente (Generador)'],
  ['remitente', 'Remitente'],
  ['destinatario', 'Destinatario'],
  ['origen', 'Origen'],
  ['destino', 'Destino'],
  ['naturaleza', 'Naturaleza'],
  ['producto', 'Producto'],
  ['peso_cargado', 'Peso Cargado'],
  ['cantidad_entregada', 'Cantidad Entregada'],
  ['valor_flete', 'Valor Flete'],
  ['valor_anticipo', 'Anticipo'],
  ['retencion_fuente', 'Ret. Fuente'],
  ['retencion_ica', 'Ret. ICA'],
  ['fopat', 'FOPAT'],
  ['rndc_remesa', 'RNDC Remesa'],
  ['rndc_manifiesto', 'RNDC Manifiesto'],
];

/** Columns for the manifiesto (summary) level. */
const COLUMNS_MANIFIESTO: CsvColumn<InformeRow>[] = [
  ['id_manifiesto', 'ID Manifiesto'],
  ['num_manifiesto', 'No. Manifiesto'],
  ['consecutivo_solicitud', 'Consecutivo Solicitud'],
  ['estado_proceso', 'Estado'],
  ['estado_solicitud', 'Estado Solicitud'],
  ['estado_manifiesto_rndc', 'Estado Manifiesto RNDC'],
  ['estado_cumplido', 'Estado Cumplido'],
  ['fecha_solicitud', 'Fecha Solicitud'],
  ['fecha_despacho', 'Fecha Despacho'],
  ['fecha_cumplido', 'Fecha Cumplido'],
  ['placa', 'Placa'],
  ['conductor', 'Conductor'],
  ['tenedor', 'Tenedor'],
  ['cliente', 'Cliente (Generador)'],
  ['remitente', 'Remitente'],
  ['destinatario', 'Destinatario'],
  ['origen', 'Origen'],
  ['destino', 'Destino'],
  ['num_remesas', 'No. Remesas'],
  ['peso_total', 'Peso Total'],
  ['valor_flete', 'Valor Flete'],
  ['valor_anticipo', 'Anticipo'],
  ['retencion_fuente', 'Ret. Fuente'],
  ['retencion_ica', 'Ret. ICA'],
  ['fopat', 'FOPAT'],
  ['rndc_manifiesto', 'RNDC Manifiesto'],
];

const nivelDe = (v: unknown): InformeNivel => (String(v) === 'manifiesto' ? 'manifiesto' : 'remesa');
const columnsDe = (n: InformeNivel) => (n === 'manifiesto' ? COLUMNS_MANIFIESTO : COLUMNS_REMESA);

function parseFiltros(query: Record<string, unknown>): InformeFiltros {
  const s = (k: string) => (query[k] != null && String(query[k]) !== '' ? String(query[k]) : undefined);
  return {
    q: s('q'),
    numRemesa: s('num_remesa'),
    numManifiesto: s('num_manifiesto'),
    estado: s('estado'),
    cliente: s('cliente'),
    desde: s('desde'),
    hasta: s('hasta'),
  };
}

informeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const nivel = nivelDe(req.query.nivel);
    const filtros = parseFiltros(req.query as Record<string, unknown>);
    const pagina = Math.max(1, Number.parseInt(String(req.query.p ?? '1'), 10) || 1);
    const porPagina = 25;
    const { items, total } = await repo.listarInforme(nivel, filtros, pagina, porPagina);
    res.json({
      items,
      total,
      pagina,
      paginas: Math.ceil(total / porPagina),
      nivel,
      columns: columnsDe(nivel).map(([key, header]) => ({ key, header })),
    });
  }),
);

informeRouter.get(
  '/csv',
  asyncHandler(async (req, res) => {
    const nivel = nivelDe(req.query.nivel);
    const filtros = parseFiltros(req.query as Record<string, unknown>);
    const { rows, capped } = await repo.filasInforme(nivel, filtros);
    const csv = toCsv(rows, columnsDe(nivel));
    const stamp = String(req.query.stamp ?? `informe_${nivel}`).replace(/[^a-zA-Z0-9_-]/g, '');
    res.type('text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${stamp}.csv"`);
    if (capped) res.setHeader('X-Informe-Capped', String(repo.CSV_MAX));
    res.send(csv);
  }),
);
