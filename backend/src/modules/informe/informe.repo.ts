/**
 * Light TMS - Informe (report) queries, at two levels:
 *   - 'remesa'     : one row per remesa (detail), joined to its manifiesto,
 *                    solicitud, clients, conductor, tenedor and municipios.
 *   - 'manifiesto' : one row per manifiesto (summary), aggregating its remesas
 *                    (count + total weight) with the manifiesto-level values.
 * Both share the same filters and the derived process status.
 */

import type { RowDataPacket } from 'mysql2';
import { db } from '../../db/pool.js';

export type InformeNivel = 'remesa' | 'manifiesto';

export interface InformeFiltros {
  q?: string;
  numRemesa?: string;
  numManifiesto?: string;
  estado?: string; // '' | 'pendiente' | 'despachado' | 'cumplido' | 'anulacion_pendiente' | 'anulado'
  cliente?: string;
  desde?: string;
  hasta?: string;
}

export type InformeRow = Record<string, string | number | null>;

/** Max rows a single CSV export will contain (safety cap). */
export const CSV_MAX = 50000;

const NATURALEZAS: Record<string, string> = {
  '1': 'Carga normal',
  '2': 'Carga peligrosa',
  '3': 'Carga extradimensionada',
  '4': 'Carga extrapesada',
  '5': 'Desechos peligrosos',
  '6': 'Semovientes',
  '7': 'Refrigerada',
};

const fullName = (a: string) => `TRIM(CONCAT_WS(' ', ${a}.nombre, NULLIF(${a}.primer_apellido,''), NULLIF(${a}.segundo_apellido,'')))`;

// 'anulado'/'anulacion_pendiente' se revisan primero: son la verdad final del
// manifiesto sin importar qué tan lejos había llegado su cumplido antes.
const ESTADO_PROCESO_SQL = `CASE
    WHEN m.estado_rndc = 'anulado' THEN 'anulado'
    WHEN m.estado_rndc = 'anulacion_pendiente' THEN 'anulacion_pendiente'
    WHEN m.cumplido_estado_rndc = 'aceptado' THEN 'cumplido'
    WHEN m.estado_rndc = 'aceptado' OR s.estado = 'despachada' THEN 'despachado'
    ELSE 'pendiente'
  END`;

/** WHERE fragment for the derived process status (references m + s). */
function estadoWhere(estado?: string): string | null {
  switch (estado) {
    case 'anulado':
      return "m.estado_rndc = 'anulado'";
    case 'anulacion_pendiente':
      return "m.estado_rndc = 'anulacion_pendiente'";
    case 'cumplido':
      return "(m.estado_rndc IS NULL OR m.estado_rndc NOT IN ('anulado','anulacion_pendiente')) AND m.cumplido_estado_rndc = 'aceptado'";
    case 'despachado':
      return "(m.estado_rndc IS NULL OR m.estado_rndc NOT IN ('anulado','anulacion_pendiente')) AND (m.estado_rndc = 'aceptado' OR s.estado = 'despachada') AND (m.cumplido_estado_rndc IS NULL OR m.cumplido_estado_rndc <> 'aceptado')";
    case 'pendiente':
      return "(m.estado_rndc IS NULL OR m.estado_rndc NOT IN ('aceptado','anulado','anulacion_pendiente')) AND s.estado <> 'despachada' AND (m.cumplido_estado_rndc IS NULL OR m.cumplido_estado_rndc <> 'aceptado')";
    default:
      return null;
  }
}

// ---------- Remesa level (detail) ----------

const FROM_REMESA = `
  FROM remesa r
  JOIN solicitud_servicio s ON s.id = r.solicitud_id
  LEFT JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
  LEFT JOIN manifiesto m ON m.id = mr.manifiesto_id
  LEFT JOIN tercero rem ON rem.tipo_id = r.remitente_tipo_id AND rem.num_id = r.remitente_num_id
  LEFT JOIN tercero des ON des.tipo_id = r.destinatario_tipo_id AND des.num_id = r.destinatario_num_id
  LEFT JOIN tercero gen ON gen.tipo_id = r.propietario_tipo_id AND gen.num_id = r.propietario_num_id
  LEFT JOIN tercero con ON con.tipo_id = m.conductor_tipo_id AND con.num_id = m.conductor_num_id
  LEFT JOIN tercero ten ON ten.tipo_id = m.titular_tipo_id AND ten.num_id = m.titular_num_id
  LEFT JOIN municipio mo ON mo.codigo_rndc = r.municipio_cargue
  LEFT JOIN municipio md ON md.codigo_rndc = r.municipio_descargue`;

const SELECT_REMESA = `
  r.id AS id_remesa,
  r.num_remesa,
  m.id AS id_manifiesto,
  m.num_manifiesto,
  s.consecutivo AS consecutivo_solicitud,
  ${ESTADO_PROCESO_SQL} AS estado_proceso,
  s.estado AS estado_solicitud,
  r.estado_rndc AS estado_remesa_rndc,
  m.estado_rndc AS estado_manifiesto_rndc,
  m.cumplido_estado_rndc AS estado_cumplido,
  s.fecha_solicitud,
  m.fecha_expedicion AS fecha_despacho,
  m.fecha_entrega_documentos AS fecha_cumplido,
  m.placa_vehiculo AS placa,
  ${fullName('con')} AS conductor,
  ${fullName('ten')} AS tenedor,
  ${fullName('gen')} AS cliente,
  ${fullName('rem')} AS remitente,
  ${fullName('des')} AS destinatario,
  mo.nombre_completo AS origen,
  md.nombre_completo AS destino,
  r.naturaleza_carga,
  r.descripcion_producto AS producto,
  r.peso AS peso_cargado,
  r.cantidad_entregada,
  m.valor_flete_pactado AS valor_flete,
  m.valor_anticipo,
  m.retencion_fuente,
  m.retencion_ica,
  m.fopat,
  r.rndc_ingreso_id AS rndc_remesa,
  m.rndc_ingreso_id AS rndc_manifiesto`;

// ---------- Manifiesto level (summary) ----------

const FROM_MANIF = `
  FROM manifiesto m
  JOIN solicitud_servicio s ON s.id = m.solicitud_id
  LEFT JOIN (
    SELECT mr.manifiesto_id, COUNT(*) AS num_remesas, SUM(r.peso) AS peso_total
    FROM manifiesto_remesa mr JOIN remesa r ON r.id = mr.remesa_id
    GROUP BY mr.manifiesto_id
  ) agg ON agg.manifiesto_id = m.id
  LEFT JOIN tercero con ON con.tipo_id = m.conductor_tipo_id AND con.num_id = m.conductor_num_id
  LEFT JOIN tercero ten ON ten.tipo_id = m.titular_tipo_id AND ten.num_id = m.titular_num_id
  LEFT JOIN tercero gen ON gen.tipo_id = s.generador_tipo_id AND gen.num_id = s.generador_num_id
  LEFT JOIN tercero rem ON rem.tipo_id = s.remitente_tipo_id AND rem.num_id = s.remitente_num_id
  LEFT JOIN tercero des ON des.tipo_id = s.destinatario_tipo_id AND des.num_id = s.destinatario_num_id
  LEFT JOIN municipio mo ON mo.codigo_rndc = m.municipio_origen
  LEFT JOIN municipio md ON md.codigo_rndc = m.municipio_destino`;

const SELECT_MANIF = `
  m.id AS id_manifiesto,
  m.num_manifiesto,
  s.consecutivo AS consecutivo_solicitud,
  ${ESTADO_PROCESO_SQL} AS estado_proceso,
  s.estado AS estado_solicitud,
  m.estado_rndc AS estado_manifiesto_rndc,
  m.cumplido_estado_rndc AS estado_cumplido,
  s.fecha_solicitud,
  m.fecha_expedicion AS fecha_despacho,
  m.fecha_entrega_documentos AS fecha_cumplido,
  m.placa_vehiculo AS placa,
  ${fullName('con')} AS conductor,
  ${fullName('ten')} AS tenedor,
  ${fullName('gen')} AS cliente,
  ${fullName('rem')} AS remitente,
  ${fullName('des')} AS destinatario,
  mo.nombre_completo AS origen,
  md.nombre_completo AS destino,
  COALESCE(agg.num_remesas, 0) AS num_remesas,
  agg.peso_total AS peso_total,
  m.valor_flete_pactado AS valor_flete,
  m.valor_anticipo,
  m.retencion_fuente,
  m.retencion_ica,
  m.fopat,
  m.rndc_ingreso_id AS rndc_manifiesto`;

/** WHERE + params for the remesa level. */
function whereRemesa(f: InformeFiltros): { where: string; params: Record<string, string> } {
  const c: string[] = ['1=1'];
  const p: Record<string, string> = {};
  if (f.q?.trim()) {
    p.q = `%${f.q.trim()}%`;
    c.push('(r.num_remesa LIKE :q OR m.num_manifiesto LIKE :q OR s.consecutivo LIKE :q)');
  }
  if (f.numRemesa?.trim()) {
    p.numRemesa = `%${f.numRemesa.trim()}%`;
    c.push('r.num_remesa LIKE :numRemesa');
  }
  if (f.numManifiesto?.trim()) {
    p.numManifiesto = `%${f.numManifiesto.trim()}%`;
    c.push('m.num_manifiesto LIKE :numManifiesto');
  }
  if (f.cliente?.trim()) {
    p.cliente = `%${f.cliente.trim()}%`;
    c.push(`(${fullName('rem')} LIKE :cliente OR ${fullName('des')} LIKE :cliente OR ${fullName('gen')} LIKE :cliente)`);
  }
  if (f.desde) {
    p.desde = f.desde;
    c.push('m.fecha_expedicion >= :desde');
  }
  if (f.hasta) {
    p.hasta = f.hasta;
    c.push('m.fecha_expedicion <= :hasta');
  }
  const est = estadoWhere(f.estado);
  if (est) c.push(`(${est})`);
  return { where: c.join(' AND '), params: p };
}

/** WHERE + params for the manifiesto level (num_remesa becomes an EXISTS). */
function whereManifiesto(f: InformeFiltros): { where: string; params: Record<string, string> } {
  const c: string[] = ['1=1'];
  const p: Record<string, string> = {};
  if (f.q?.trim()) {
    p.q = `%${f.q.trim()}%`;
    c.push('(m.num_manifiesto LIKE :q OR s.consecutivo LIKE :q)');
  }
  if (f.numManifiesto?.trim()) {
    p.numManifiesto = `%${f.numManifiesto.trim()}%`;
    c.push('m.num_manifiesto LIKE :numManifiesto');
  }
  if (f.numRemesa?.trim()) {
    p.numRemesa = `%${f.numRemesa.trim()}%`;
    c.push(
      'EXISTS (SELECT 1 FROM manifiesto_remesa mrx JOIN remesa rx ON rx.id = mrx.remesa_id WHERE mrx.manifiesto_id = m.id AND rx.num_remesa LIKE :numRemesa)',
    );
  }
  if (f.cliente?.trim()) {
    p.cliente = `%${f.cliente.trim()}%`;
    c.push(`(${fullName('rem')} LIKE :cliente OR ${fullName('des')} LIKE :cliente OR ${fullName('gen')} LIKE :cliente)`);
  }
  if (f.desde) {
    p.desde = f.desde;
    c.push('m.fecha_expedicion >= :desde');
  }
  if (f.hasta) {
    p.hasta = f.hasta;
    c.push('m.fecha_expedicion <= :hasta');
  }
  const est = estadoWhere(f.estado);
  if (est) c.push(`(${est})`);
  return { where: c.join(' AND '), params: p };
}

/** Adds the naturaleza name (remesa level only). */
function decorate(rows: InformeRow[]): InformeRow[] {
  return rows.map((r) =>
    'naturaleza_carga' in r
      ? { ...r, naturaleza: NATURALEZAS[String(r.naturaleza_carga ?? '')] ?? (r.naturaleza_carga ?? '') }
      : r,
  );
}

function parts(nivel: InformeNivel, f: InformeFiltros) {
  return nivel === 'manifiesto'
    ? { select: SELECT_MANIF, from: FROM_MANIF, order: 'm.id', ...whereManifiesto(f) }
    : { select: SELECT_REMESA, from: FROM_REMESA, order: 'r.id', ...whereRemesa(f) };
}

/** Paginated report rows (on-screen preview). */
export async function listarInforme(
  nivel: InformeNivel,
  f: InformeFiltros,
  pagina = 1,
  porPagina = 25,
): Promise<{ items: InformeRow[]; total: number }> {
  const { select, from, where, params, order } = parts(nivel, f);
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const offset = Math.max(0, (pagina - 1) * porPagina);
  const [rows] = await db().query<(InformeRow & RowDataPacket)[]>(
    `SELECT ${select} ${from} WHERE ${where} ORDER BY ${order} DESC LIMIT ${Number(porPagina)} OFFSET ${Number(offset)}`,
    params,
  );
  return { items: decorate(rows), total };
}

/** All matching rows (CSV export), capped at CSV_MAX. */
export async function filasInforme(
  nivel: InformeNivel,
  f: InformeFiltros,
): Promise<{ rows: InformeRow[]; capped: boolean; total: number }> {
  const { select, from, where, params, order } = parts(nivel, f);
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await db().query<(InformeRow & RowDataPacket)[]>(
    `SELECT ${select} ${from} WHERE ${where} ORDER BY ${order} DESC LIMIT ${CSV_MAX}`,
    params,
  );
  return { rows: decorate(rows), capped: total > CSV_MAX, total };
}
