/**
 * Light TMS - Solicitud de Servicio. Faithful port of SolicitudRepo.php.
 *
 * A Solicitud is captured ONCE; confirming its dispatch SEEDS one Manifiesto and
 * N Remesas (one per product), linked via manifiesto_remesa, marks the solicitud
 * 'procesada'/'despachada', and enqueues the documents for the RNDC. Retentions
 * are computed server-side (never trusted from the client).
 */

import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db, withTransaction } from '../../db/pool.js';
import * as terceroRepo from '../terceros/tercero.repo.js';
import * as empresaRepo from '../empresa/empresa.repo.js';
import * as cola from '../cola/cola.repo.js';

type Queryable = Pool | PoolConnection;
type Row = Record<string, any>;
type SqlValue = string | number | null;

/** Dispatch fields completed when confirming (deferred from capture). */
const CAMPOS_DESPACHO = [
  'placa_vehiculo',
  'conductor_tipo_id',
  'conductor_num_id',
  'responsable_pago_cargue',
  'responsable_pago_descargue',
  'emf',
] as const;

/** Whitelisted capture fields (mirror SolicitudRepo::CAMPOS). */
const CAMPOS = [
  'consecutivo', 'fecha_solicitud', 'operacion_transporte', 'tipo_viaje',
  'municipio_pago_saldo',
  'remitente_tipo_id', 'remitente_num_id',
  'destinatario_tipo_id', 'destinatario_num_id',
  'generador_tipo_id', 'generador_num_id',
  'naturaleza_carga', 'tipo_empaque', 'mercancia_codigo',
  'descripcion_producto', 'cantidad_vehiculos', 'unidad_medida', 'peso',
  'valor_mercancia',
  'valor_flete', 'porcentaje_ica',
  'retencion_ica', 'retencion_fuente', 'fopat',
  'tipo_flete', 'tipo_valor_pactado', 'fecha_pago_saldo',
  'observaciones', 'dueno_poliza',
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const hoy = () => new Date().toISOString().slice(0, 10);

/** Dynamic INSERT with named placeholders. */
async function insertNamed(exec: Queryable, tabla: string, fila: Record<string, SqlValue>): Promise<number> {
  const cols = Object.keys(fila);
  const [res] = await exec.query<ResultSetHeader>(
    `INSERT INTO \`${tabla}\` (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`,
    fila,
  );
  return res.insertId;
}

/**
 * Normalises form input and computes retentions. Port of prepararFila().
 * Reads use the pool (committed master data), like the PHP.
 */
async function prepararFila(datos: Row): Promise<Record<string, SqlValue>> {
  const fila: Record<string, SqlValue> = {};
  for (const c of CAMPOS) {
    const valor = datos[c];
    fila[c] = valor === '' || valor === undefined || valor === null ? null : (valor as SqlValue);
  }
  if (!fila.fecha_solicitud) fila.fecha_solicitud = hoy();

  // Retentions computed on the server (not trusted from the client).
  const flete = Number(fila.valor_flete ?? 0) || 0;
  const pIca = Number(fila.porcentaje_ica ?? 0) || 0; // ICA tariff per mil
  fila.retencion_ica = round2((flete * pIca) / 1000);
  fila.retencion_fuente = round2(flete * 0.01); // 1%
  fila.fopat = round2(flete * 0.001); // 0.1%

  // Municipios from the terceros (remitente → origin, destinatario → destination).
  if (fila.remitente_num_id) {
    const t = await terceroRepo.obtenerPorTipoNum(String(fila.remitente_tipo_id ?? ''), String(fila.remitente_num_id));
    fila.municipio_origen = t?.cod_municipio ?? (fila.municipio_origen as SqlValue) ?? null;
  }
  if (fila.destinatario_num_id) {
    const t = await terceroRepo.obtenerPorTipoNum(
      String(fila.destinatario_tipo_id ?? ''),
      String(fila.destinatario_num_id),
    );
    fila.municipio_destino = t?.cod_municipio ?? (fila.municipio_destino as SqlValue) ?? null;
  }
  return fila;
}

/** Inserts the solicitud (auto-consecutivo = id if none). Port of crear(). */
export async function crear(datos: Row): Promise<number> {
  const fila = await prepararFila(datos);
  fila.cantidad_vehiculos_original = Number(fila.cantidad_vehiculos ?? 1) || 1;

  return withTransaction(async (conn) => {
    const id = await insertNamed(conn, 'solicitud_servicio', fila);
    if (!fila.consecutivo) {
      await conn.query('UPDATE solicitud_servicio SET consecutivo = ? WHERE id = ?', [String(id), id]);
    }
    return id;
  });
}

/** Updates the solicitud. Port of actualizar(). */
export async function actualizar(id: number, datos: Row): Promise<void> {
  const fila = await prepararFila(datos);
  await withTransaction(async (conn) => {
    const sets = Object.keys(fila).map((c) => `${c} = :${c}`).join(', ');
    await conn.query(`UPDATE solicitud_servicio SET ${sets} WHERE id = :id`, { ...fila, id });
  });
}

async function tenedorCampo(conn: Queryable, placa: string, col: 'tenedor_tipo_id' | 'tenedor_num_id'): Promise<string | null> {
  if (placa === '') return null;
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${col} FROM vehiculo WHERE placa = ?`, [placa.toUpperCase()]);
  const v = (rows[0] as Row | undefined)?.[col];
  return v ?? null;
}

/** Seeds the manifiesto (one per dispatch). Port of sembrarManifiesto(). */
async function sembrarManifiesto(conn: Queryable, solicitudId: number, s: Row): Promise<number> {
  const empresa = await empresaRepo.obtener(conn);
  const manifiesto: Record<string, SqlValue> = {
    solicitud_id: solicitudId,
    num_manifiesto: s.num_manifiesto ?? null,
    fecha_expedicion: s.fecha_solicitud ?? null,
    operacion_transporte: s.operacion_transporte ?? null,
    municipio_origen: s.municipio_origen ?? null,
    municipio_destino: s.municipio_destino ?? null,
    titular_tipo_id: await tenedorCampo(conn, String(s.placa_vehiculo ?? ''), 'tenedor_tipo_id'),
    titular_num_id: await tenedorCampo(conn, String(s.placa_vehiculo ?? ''), 'tenedor_num_id'),
    valor_flete_pactado: s.valor_flete ?? null,
    valor_anticipo: s.valor_anticipo ?? null,
    retencion_ica: s.retencion_ica ?? null,
    retencion_fuente: s.retencion_fuente ?? null,
    fopat: s.fopat ?? null,
    tipo_valor_pactado: s.tipo_valor_pactado ?? null,
    municipio_pago_saldo: s.municipio_pago_saldo ?? null,
    fecha_pago_saldo: s.fecha_pago_saldo ?? null,
    nro_poliza: empresa.nro_poliza ?? null,
    emf: s.emf ?? empresa.emf ?? null,
    placa_vehiculo: s.placa_vehiculo ?? null,
    conductor_tipo_id: s.conductor_tipo_id ?? null,
    conductor_num_id: s.conductor_num_id ?? null,
    responsable_pago_cargue: s.responsable_pago_cargue ?? null,
    responsable_pago_descargue: s.responsable_pago_descargue ?? null,
  };
  return insertNamed(conn, 'manifiesto', manifiesto);
}

/** Seeds a remesa (one per product). Port of sembrarRemesa(). */
async function sembrarRemesa(conn: Queryable, solicitudId: number, rd: Row, s: Row): Promise<number> {
  // Inherit codigo_un / estado_producto from the product when dangerous.
  let codigoUn: SqlValue = null;
  let estadoProducto: SqlValue = null;
  if (rd.mercancia_codigo) {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT codigo_un, estado_producto FROM producto WHERE codigo = ?',
      [rd.mercancia_codigo],
    );
    const p = rows[0] as Row | undefined;
    if (p) {
      codigoUn = p.codigo_un || null;
      estadoProducto = p.estado_producto || null;
    }
  }
  const remesa: Record<string, SqlValue> = {
    solicitud_id: solicitudId,
    num_remesa: rd.num_remesa ?? null,
    operacion_transporte: s.operacion_transporte ?? null,
    naturaleza_carga: rd.naturaleza_carga ?? null,
    tipo_empaque: rd.tipo_empaque ?? null,
    mercancia_codigo: rd.mercancia_codigo ?? null,
    descripcion_producto: rd.descripcion_producto ?? null,
    cantidad_cargada: 1,
    unidad_medida: rd.unidad_medida ?? null,
    peso: rd.peso ?? null,
    valor_mercancia: rd.valor_mercancia ?? null,
    remitente_tipo_id: rd.remitente_tipo_id ?? s.remitente_tipo_id ?? null,
    remitente_num_id: rd.remitente_num_id ?? s.remitente_num_id ?? null,
    destinatario_tipo_id: rd.destinatario_tipo_id ?? s.destinatario_tipo_id ?? null,
    destinatario_num_id: rd.destinatario_num_id ?? s.destinatario_num_id ?? null,
    municipio_cargue: s.municipio_origen ?? null,
    municipio_descargue: s.municipio_destino ?? null,
    propietario_tipo_id: rd.generador_tipo_id ?? s.generador_tipo_id ?? null,
    propietario_num_id: rd.generador_num_id ?? s.generador_num_id ?? null,
    fecha_cita_cargue: rd.fecha_cita_cargue ?? null,
    hora_cita_cargue: rd.hora_cita_cargue ?? null,
    fecha_cita_descargue: rd.fecha_cita_descargue ?? null,
    hora_cita_descargue: rd.hora_cita_descargue ?? null,
    horas_pacto_cargue: rd.horas_pacto_cargue ?? null,
    minutos_pacto_cargue: rd.minutos_pacto_cargue ?? null,
    horas_pacto_descargue: rd.horas_pacto_descargue ?? null,
    minutos_pacto_descargue: rd.minutos_pacto_descargue ?? null,
    dueno_poliza: s.dueno_poliza ?? 'N',
    codigo_un: codigoUn,
    estado_producto: estadoProducto,
  };
  return insertNamed(conn, 'remesa', remesa);
}

/**
 * Confirms the dispatch: saves deferred fields, decrements the vehicle counter,
 * seeds 1 manifiesto + N remesas, links them, and enqueues for the RNDC.
 * Port of confirmarDespacho().
 */
export async function confirmarDespacho(id: number, datos: Row): Promise<void> {
  await withTransaction(async (conn) => {
    // 1) Save dispatch fields on the solicitud.
    const fila: Record<string, SqlValue> = {};
    for (const c of CAMPOS_DESPACHO) {
      const valor = datos[c];
      fila[c] = valor === '' || valor === undefined || valor === null ? null : (valor as SqlValue);
    }

    // Decrement remaining vehicles; mark despachada when it reaches 0.
    const [restRows] = await conn.query<RowDataPacket[]>(
      'SELECT cantidad_vehiculos FROM solicitud_servicio WHERE id = ?',
      [id],
    );
    const restantes = Number((restRows[0] as Row | undefined)?.cantidad_vehiculos ?? 1) || 1;
    const nuevosRestantes = Math.max(0, restantes - 1);
    fila.cantidad_vehiculos = nuevosRestantes;
    fila.estado = nuevosRestantes > 0 ? 'procesada' : 'despachada';

    const sets = Object.keys(fila).map((c) => `${c} = :${c}`).join(', ');
    await conn.query(`UPDATE solicitud_servicio SET ${sets} WHERE id = :id`, { ...fila, id });

    // 2) Read the full solicitud to feed remesas/manifiesto.
    const [sRows] = await conn.query<RowDataPacket[]>('SELECT * FROM solicitud_servicio WHERE id = ?', [id]);
    const s = sRows[0] as Row;
    s.valor_anticipo = datos.valor_anticipo ?? null;
    s.cantidad_vehiculos = nuevosRestantes;

    // Company consecutivos (reserved on the same connection).
    s.num_manifiesto = await empresaRepo.siguienteManifiesto(conn);

    // 3) Seed the manifiesto (one per dispatch).
    const manifiestoId = await sembrarManifiesto(conn, id, s);

    // 4) Remesas from POST (or one default from the solicitud).
    let remesasData: Row[] = Array.isArray(datos.remesas) ? datos.remesas : [];
    if (remesasData.length === 0) {
      remesasData = [
        {
          naturaleza_carga: s.naturaleza_carga ?? null,
          tipo_empaque: s.tipo_empaque ?? null,
          mercancia_codigo: s.mercancia_codigo ?? null,
          descripcion_producto: s.descripcion_producto ?? null,
          unidad_medida: s.unidad_medida ?? null,
          peso: s.peso ?? null,
          valor_mercancia: datos.valor_mercancia ?? s.valor_mercancia ?? null,
        },
      ];
    }

    const remesaIds: number[] = [];
    for (const rd of remesasData) {
      rd.num_remesa = await empresaRepo.siguienteRemesa(conn);
      remesaIds.push(await sembrarRemesa(conn, id, rd, s));
    }

    // 5) Link remesas to the manifiesto.
    for (const rid of remesaIds) {
      await conn.query('INSERT INTO manifiesto_remesa (manifiesto_id, remesa_id) VALUES (?, ?)', [manifiestoId, rid]);
    }

    // 6) Enqueue tercero(11) → vehículo(12) → remesas(3) → manifiesto(4).
    await cola.encolar(conn, id, manifiestoId, remesaIds);
  });
}

// ---------- Reads ----------

const LIST_FROM = `FROM solicitud_servicio s
  LEFT JOIN tercero r ON r.tipo_id = s.remitente_tipo_id AND r.num_id = s.remitente_num_id
  LEFT JOIN tercero d ON d.tipo_id = s.destinatario_tipo_id AND d.num_id = s.destinatario_num_id
  LEFT JOIN tercero g ON g.tipo_id = s.generador_tipo_id AND g.num_id = s.generador_num_id
  LEFT JOIN municipio om ON om.codigo_rndc = s.municipio_origen
  LEFT JOIN municipio dm ON dm.codigo_rndc = s.municipio_destino`;

const LIST_COLS = `s.id, s.consecutivo, s.fecha_solicitud,
  s.municipio_origen, s.municipio_destino,
  s.valor_flete, s.placa_vehiculo, s.estado,
  s.cantidad_vehiculos, s.cantidad_vehiculos_original,
  s.generador_tipo_id, s.generador_num_id,
  r.nombre AS remitente_nombre,
  d.nombre AS destinatario_nombre,
  g.nombre AS generador_nombre,
  om.nombre_completo AS origen_nombre,
  dm.nombre_completo AS destino_nombre`;

/** Paginated list with search + date range. Port of listarConPaginacion(). */
export async function listarConPaginacion(
  q = '',
  pagina = 1,
  porPagina = 10,
  desde: string | null = null,
  hasta: string | null = null,
): Promise<{ items: Row[]; total: number }> {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (q !== '') {
    where += ' AND s.consecutivo LIKE ?';
    params.push(`%${q}%`);
  }
  if (desde !== null) {
    where += ' AND s.fecha_solicitud >= ?';
    params.push(desde);
  }
  if (hasta !== null) {
    where += ' AND s.fecha_solicitud <= ?';
    params.push(hasta);
  }
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total ${LIST_FROM} ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const offset = Math.max(0, (pagina - 1) * porPagina);
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT ${LIST_COLS} ${LIST_FROM} ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, porPagina, offset],
  );
  return { items: rows as Row[], total };
}

/** Fetches a solicitud with its manifiesto + remesas. Port of obtener(). */
export async function obtener(
  id: number,
  manifiestoId: number | null = null,
): Promise<{ solicitud: Row; manifiesto: Row | null; remesas: Row[] } | null> {
  const [sRows] = await db().query<RowDataPacket[]>('SELECT * FROM solicitud_servicio WHERE id = ?', [id]);
  const solicitud = sRows[0] as Row | undefined;
  if (!solicitud) return null;

  let manifiesto: Row | null;
  if (manifiestoId !== null) {
    const [m] = await db().query<RowDataPacket[]>('SELECT * FROM manifiesto WHERE id = ? AND solicitud_id = ?', [
      manifiestoId,
      id,
    ]);
    manifiesto = (m[0] as Row) ?? null;
  } else {
    const [m] = await db().query<RowDataPacket[]>('SELECT * FROM manifiesto WHERE solicitud_id = ?', [id]);
    manifiesto = (m[0] as Row) ?? null;
  }

  let remesas: Row[] = [];
  if (manifiesto) {
    const [rs] = await db().query<RowDataPacket[]>(
      `SELECT r.* FROM remesa r
       JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
       WHERE mr.manifiesto_id = ?
       ORDER BY r.id`,
      [manifiesto.id],
    );
    remesas = rs as Row[];
  }
  return { solicitud, manifiesto, remesas };
}
