/**
 * Light TMS - Store-and-forward queue to the RNDC. Faithful port of ColaRepo.php.
 *
 * On confirming a dispatch, a solicitud's documents are ENQUEUED in the order the
 * RNDC requires:  tercero(11) → vehículo(12) → remesa(3) → manifiesto(4)
 * (cumplido: cumplido_remesa(5) → cumplido_manifiesto(6)).
 *
 * The worker DRAINS the queue: it sends each pending row whose dependencies
 * (lower-`orden` rows of the same solicitud) are already 'enviado', retrying with
 * backoff up to max_intentos. Safe switch COLA_ENVIO_HABILITADO=false builds and
 * previews the XML but never sends.
 *
 * NOTE: rows here span columns added across migrations v2..v30, so document rows
 * are read as loose records (mirroring PHP's associative arrays) rather than fully
 * typed structs — verify column names against the live DB.
 */

import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db, withTransaction } from '../../db/pool.js';
import { config } from '../../config/env.js';
import { RndcClient, type RndcVars } from '../../rndc/RndcClient.js';
import { RndcRespuesta } from '../../rndc/RndcRespuesta.js';
import * as terceroRepo from '../terceros/tercero.repo.js';
import * as vehiculoRepo from '../vehiculos/vehiculo.repo.js';
import { obtener as obtenerEmpresa } from '../empresa/empresa.repo.js';

type Queryable = Pool | PoolConnection;
type Row = Record<string, any>;

/** Send order per document type. */
const ORDEN: Record<string, number> = {
  tercero: 10,
  vehiculo: 20,
  remesa: 30,
  manifiesto: 40,
  cumplido_remesa: 50,
  cumplido_manifiesto: 60,
};
/** RNDC proceso per document type. */
const PROCESO: Record<string, number> = {
  tercero: 11,
  vehiculo: 12,
  remesa: 3,
  manifiesto: 4,
  cumplido_remesa: 5,
  cumplido_manifiesto: 6,
};

async function fila(exec: Queryable, sql: string, params: unknown[]): Promise<Row | null> {
  const [rows] = await exec.query<RowDataPacket[]>(sql, params);
  return (rows[0] as Row) ?? null;
}

/** Normalises a number: drops superfluous decimals (3000000.00 → 3000000). Port of num(). */
function num(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return String(valor);
  const s = String(valor);
  if (!/^-?\d*\.?\d+$/.test(s.trim())) return s;
  return String(Number(s));
}

/** Converts YYYY-MM-DD (or datetime) to the RNDC format DD/MM/YYYY. Port of fecha(). */
function fecha(f: unknown): string | null {
  if (f === null || f === undefined || f === '') return null;
  const s = String(f);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

/** Inserts a queue row (uses manifiesto_id instead of remesa_id). Port of insertarCola(). */
async function insertarCola(
  exec: Queryable,
  solicitudId: number,
  manifiestoId: number,
  tipo: string,
  referenciaId: number,
  payloadXml: string,
): Promise<void> {
  await exec.query(
    `INSERT INTO cola_envios
        (solicitud_id, manifiesto_id, tipo_documento, referencia_id, proceso_rndc, orden, payload_xml, estado, max_intentos)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    [solicitudId, manifiestoId, tipo, referenciaId, PROCESO[tipo], ORDEN[tipo], payloadXml, config().cola.maxIntentos],
  );
}

/**
 * Enqueues the documents of a just-dispatched solicitud. Port of encolar().
 * Must run on the transaction connection so it sees the freshly-inserted rows.
 */
export async function encolar(
  conn: Queryable,
  solicitudId: number,
  manifiestoId: number | null = null,
  remesaIds: number[] = [],
): Promise<void> {
  const s = await fila(conn, 'SELECT * FROM solicitud_servicio WHERE id = ?', [solicitudId]);
  if (s === null) throw new Error('Solicitud no encontrada para encolar.');
  if (manifiestoId === null || remesaIds.length === 0) {
    throw new Error('Se requieren manifiestoId y remesaIds para encolar.');
  }
  const manif = await fila(conn, 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manif === null) throw new Error('Manifiesto no encontrado.');

  // 1) Referenced terceros that exist in the master and aren't registered yet.
  const vistos = new Set<string>();
  for (const [ct, cn] of [
    ['remitente_tipo_id', 'remitente_num_id'],
    ['destinatario_tipo_id', 'destinatario_num_id'],
    ['conductor_tipo_id', 'conductor_num_id'],
    ['generador_tipo_id', 'generador_num_id'],
  ] as const) {
    const tipo = s[ct];
    const numero = s[cn];
    if (!tipo || !numero) continue;
    const clave = `${tipo}|${numero}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const t = await fila(conn, 'SELECT id, estado_rndc FROM tercero WHERE tipo_id = ? AND num_id = ?', [tipo, numero]);
    if (t !== null && t.estado_rndc !== 'registrado') {
      await insertarCola(conn, solicitudId, manifiestoId, 'tercero', Number(t.id), `Tercero ${tipo} ${numero}`);
    }
  }

  // 2) Vehicle from the master (if not registered).
  if (manif.placa_vehiculo) {
    const v = await fila(conn, 'SELECT id, estado_rndc FROM vehiculo WHERE placa = ?', [
      String(manif.placa_vehiculo).toUpperCase(),
    ]);
    if (v !== null && v.estado_rndc !== 'registrado') {
      await insertarCola(conn, solicitudId, manifiestoId, 'vehiculo', Number(v.id), `Vehículo ${manif.placa_vehiculo}`);
    }
  }

  // 3) Remesas (one queue row per remesa).
  for (const rid of remesaIds) {
    const rem = await fila(conn, 'SELECT * FROM remesa WHERE id = ?', [rid]);
    if (rem === null) continue;
    await insertarCola(conn, solicitudId, manifiestoId, 'remesa', rid, await payloadRemesa(rem, conn));
  }

  // 4) Manifiesto (payload XML with all remesas of the block).
  await insertarCola(conn, solicitudId, manifiestoId, 'manifiesto', manifiestoId, await payloadManifiesto(manif, conn));
}

/** Enqueues cumplido documents (procesoid 5 & 6) for an accepted manifiesto. Port of encolarCumplido(). */
export async function encolarCumplido(
  conn: Queryable,
  solicitudId: number,
  manifiestoId: number,
  remesaIds: number[],
): Promise<void> {
  for (const rid of remesaIds) {
    const rem = await fila(conn, 'SELECT * FROM remesa WHERE id = ?', [rid]);
    if (rem === null) continue;
    await insertarCola(conn, solicitudId, manifiestoId, 'cumplido_remesa', rid, await payloadCumplidoRemesa(rem));
  }
  const manif = await fila(conn, 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manif !== null) {
    await insertarCola(conn, solicitudId, manifiestoId, 'cumplido_manifiesto', manifiestoId, await payloadCumplidoManifiesto(manif));
  }
}

/** Is there a lower-`orden` row of the same solicitud not yet 'enviado'? Port of dependenciaPendiente(). */
async function dependenciaPendiente(solicitudId: number, orden: number): Promise<boolean> {
  const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
    "SELECT COUNT(*) AS n FROM cola_envios WHERE solicitud_id = ? AND orden < ? AND estado <> 'enviado'",
    [solicitudId, orden],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Sends a row by type (masters via their repos; documents via XML). Port of enviarFila(). */
async function enviarFila(rndc: RndcClient, row: Row): Promise<RndcRespuesta> {
  switch (row.tipo_documento) {
    case 'tercero':
      return terceroRepo.registrarEnRndc(Number(row.referencia_id));
    case 'vehiculo':
      return vehiculoRepo.registrarEnRndc(Number(row.referencia_id));
    default:
      return rndc.ingresarXml(Number(row.proceso_rndc), String(row.payload_xml));
  }
}

/** Propagates the result to the source document and closes the dispatch. Port of marcarOrigen(). */
async function marcarOrigen(row: Row, resp: RndcRespuesta): Promise<void> {
  const tipo = row.tipo_documento;
  if (tipo === 'remesa' || tipo === 'manifiesto') {
    await db().query(`UPDATE \`${tipo}\` SET estado_rndc = 'aceptado', rndc_ingreso_id = ? WHERE id = ?`, [
      resp.ingresoId,
      Number(row.referencia_id),
    ]);
  }
  if (tipo === 'manifiesto') {
    await db().query("UPDATE solicitud_servicio SET estado = 'despachada' WHERE id = ?", [Number(row.solicitud_id)]);
    await consultarSeguridadQr(Number(row.referencia_id));
  }
  if (tipo === 'cumplido_remesa') {
    await db().query("UPDATE remesa SET cumplido_estado_rndc = 'aceptado', cumplido_rndc_ingreso_id = ? WHERE id = ?", [
      resp.ingresoId,
      Number(row.referencia_id),
    ]);
  }
  if (tipo === 'cumplido_manifiesto') {
    await db().query(
      "UPDATE manifiesto SET cumplido_estado_rndc = 'aceptado', cumplido_rndc_ingreso_id = ? WHERE id = ?",
      [resp.ingresoId, Number(row.referencia_id)],
    );
  }
}

/** Queries the manifiesto's QR security code from the RNDC. Port of consultarSeguridadQr(). */
async function consultarSeguridadQr(manifiestoId: number): Promise<void> {
  try {
    const manif = await fila(db(), 'SELECT num_manifiesto FROM manifiesto WHERE id = ?', [manifiestoId]);
    if (!manif || !manif.num_manifiesto) return;
    const rndc = await RndcClient.desdeConfig();
    const empresa = (await obtenerEmpresa()).nit ?? '';
    if (empresa === '') return;
    const qrResp = await rndc.consultar(
      4,
      ['INGRESOID', 'FECHAING', 'OBSERVACIONES', 'SEGURIDADOR'],
      { NUMNITEMPRESATRANSPORTE: `'${empresa}'`, NUMMANIFIESTOCARGA: `'${manif.num_manifiesto}'` },
    );
    const qr = qrResp.datos[0]?.seguridadqr;
    if (qrResp.ok && qr) {
      await db().query('UPDATE manifiesto SET seguridadqr = ? WHERE id = ?', [qr, manifiestoId]);
    }
  } catch (e) {
    console.error('Error al consultar seguridadqr:', e instanceof Error ? e.message : e);
  }
}

/** Applies the outcome of one send to its queue row (success / retry-or-fail). */
async function aplicarResultado(row: Row, resp: RndcRespuesta, minutos: number): Promise<void> {
  const id = Number(row.id);
  if (resp.ok) {
    await db().query(
      `UPDATE cola_envios
       SET estado = 'enviado', rndc_ingreso_id = ?, respuesta_rndc = ?, ultimo_error = NULL,
           intentos = intentos + 1, enviado_at = NOW()
       WHERE id = ?`,
      [resp.ingresoId, resp.respuestaCruda, id],
    );
    await marcarOrigen(row, resp);
    return;
  }
  const intentos = Number(row.intentos) + 1;
  const agotado = intentos >= Number(row.max_intentos);
  if (agotado) {
    await db().query(
      'UPDATE cola_envios SET estado = ?, intentos = ?, ultimo_error = ?, respuesta_rndc = ?, programado_para = NULL WHERE id = ?',
      ['error', intentos, resp.error, resp.respuestaCruda, id],
    );
  } else {
    await db().query(
      'UPDATE cola_envios SET estado = ?, intentos = ?, ultimo_error = ?, respuesta_rndc = ?, programado_para = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
      ['pendiente', intentos, resp.error, resp.respuestaCruda, minutos, id],
    );
  }
}

/** Preview text for safe mode (documents show XML, masters a note). */
function previewSeguro(rndc: RndcClient, row: Row): string {
  return ['remesa', 'manifiesto'].includes(row.tipo_documento)
    ? rndc.previewXmlInterno(Number(row.proceso_rndc), String(row.payload_xml))
    : `(envío del maestro ${row.tipo_documento} #${row.referencia_id})`;
}

export interface DrenarResult {
  enviados: number;
  errores: number;
  esperando: number;
  previstos: number;
}

/** Drains the queue in order, respecting dependencies. Port of drenar(). */
export async function drenar(): Promise<DrenarResult> {
  const habilitado = config().cola.envioHabilitado;
  const minutos = config().cola.minutosReintento;
  const rndc = await RndcClient.desdeConfig();

  const [pendientes] = await db().query<RowDataPacket[]>(
    `SELECT * FROM cola_envios
     WHERE estado = 'pendiente' AND (programado_para IS NULL OR programado_para <= NOW())
     ORDER BY solicitud_id, orden, id`,
  );

  const res: DrenarResult = { enviados: 0, errores: 0, esperando: 0, previstos: 0 };

  for (const row of pendientes as Row[]) {
    const id = Number(row.id);
    if (!habilitado) {
      await db().query('UPDATE cola_envios SET respuesta_rndc = ?, ultimo_error = ? WHERE id = ?', [
        previewSeguro(rndc, row),
        'Modo seguro: envío deshabilitado (COLA_ENVIO_HABILITADO=false).',
        id,
      ]);
      res.previstos++;
      continue;
    }
    if (await dependenciaPendiente(Number(row.solicitud_id), Number(row.orden))) {
      res.esperando++;
      continue;
    }
    await db().query("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?", [id]);
    const resp = await enviarFila(rndc, row);
    await aplicarResultado(row, resp, minutos);
    if (resp.ok) res.enviados++;
    else res.errores++;
  }
  return res;
}

export interface ItemResult {
  ok: boolean;
  mensaje: string;
}

/** Processes a single queue item by id. Port of procesarItem(). */
export async function procesarItem(colaId: number): Promise<ItemResult> {
  const habilitado = config().cola.envioHabilitado;
  const minutos = config().cola.minutosReintento;
  const rndc = await RndcClient.desdeConfig();

  const row = await fila(db(), 'SELECT * FROM cola_envios WHERE id = ?', [colaId]);
  if (!row) return { ok: false, mensaje: `Item #${colaId} no encontrado.` };
  if (!['pendiente', 'error'].includes(row.estado)) {
    return { ok: false, mensaje: `Estado ${row.estado} no permite procesar.` };
  }
  const id = Number(row.id);
  if (!habilitado) {
    await db().query('UPDATE cola_envios SET respuesta_rndc = ?, ultimo_error = ? WHERE id = ?', [
      previewSeguro(rndc, row),
      'Modo seguro: envío deshabilitado.',
      id,
    ]);
    return { ok: true, mensaje: 'Previsualizado (modo seguro).' };
  }
  if (await dependenciaPendiente(Number(row.solicitud_id), Number(row.orden))) {
    return { ok: false, mensaje: 'Hay dependencias pendientes para esta solicitud.' };
  }
  await db().query("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?", [id]);
  const resp = await enviarFila(rndc, row);
  await aplicarResultado(row, resp, minutos);
  return resp.ok ? { ok: true, mensaje: 'Enviado correctamente.' } : { ok: false, mensaje: resp.error ?? 'Error.' };
}

/** Processes the queue items of a single dispatch. Port of procesarDespacho(). */
export async function procesarDespacho(manifiestoId: number): Promise<ItemResult> {
  const habilitado = config().cola.envioHabilitado;
  const minutos = config().cola.minutosReintento;
  const rndc = await RndcClient.desdeConfig();
  let enviados = 0;
  let errores = 0;

  const [items] = await db().query<RowDataPacket[]>(
    "SELECT * FROM cola_envios WHERE manifiesto_id = ? AND estado IN ('pendiente','error') ORDER BY orden, id",
    [manifiestoId],
  );
  for (const row of items as Row[]) {
    const id = Number(row.id);
    if (!habilitado) {
      await db().query('UPDATE cola_envios SET respuesta_rndc = ?, ultimo_error = ? WHERE id = ?', [
        previewSeguro(rndc, row),
        'Modo seguro: envío deshabilitado.',
        id,
      ]);
      errores++;
      continue;
    }
    if (await dependenciaPendiente(Number(row.solicitud_id), Number(row.orden))) continue;
    await db().query("UPDATE cola_envios SET estado = 'enviando' WHERE id = ?", [id]);
    const resp = await enviarFila(rndc, row);
    await aplicarResultado(row, resp, minutos);
    if (resp.ok) enviados++;
    else errores++;
  }
  return { ok: errores === 0, mensaje: `Enviados: ${enviados}, errores: ${errores}.` };
}

// ---------- Payload builders (RNDC variables) ----------

async function sedeTercero(conn: Queryable, tipo: unknown, numero: unknown): Promise<string> {
  if (!tipo || !numero) return '0';
  const row = await fila(conn, 'SELECT sede FROM tercero WHERE tipo_id = ? AND num_id = ?', [tipo, numero]);
  return row && row.sede ? String(row.sede) : '0';
}

/** Port of payloadRemesa(). Exported for real-data parity checks. */
export async function payloadRemesa(r: Row, conn: Queryable): Promise<string> {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    consecutivoRemesa: String(parseInt(String(r.num_remesa ?? '0').replace(/[^0-9]/g, '') || '0', 10)).padStart(10, '0'),
    codOperacionTransporte: r.operacion_transporte,
    codTipoEmpaque: r.tipo_empaque || '0',
    codNaturalezaCarga: r.naturaleza_carga,
    descripcionCortaProducto: r.descripcion_producto,
    mercanciaRemesa: r.mercancia_codigo,
    cantidadCargada: num(r.cantidad_cargada),
    unidadMedidaCapacidad: r.unidad_medida,
    pesoContenedorVacio: '2100',
    codTipoIdRemitente: r.remitente_tipo_id,
    numIdRemitente: r.remitente_num_id,
    codSedeRemitente: await sedeTercero(conn, r.remitente_tipo_id, r.remitente_num_id),
    codTipoIdDestinatario: r.destinatario_tipo_id,
    numIdDestinatario: r.destinatario_num_id,
    codSedeDestinatario: await sedeTercero(conn, r.destinatario_tipo_id, r.destinatario_num_id),
    codTipoIdPropietario: r.propietario_tipo_id,
    numIdPropietario: r.propietario_num_id,
    duenoPoliza: r.dueno_poliza ?? 'N',
    horasPactoCarga: r.horas_pacto_cargue ?? '1',
    minutospactocarga: r.minutos_pacto_cargue ?? '0',
    fechaCitaPactadaCargue: fecha(r.fecha_cita_cargue),
    horaCitaPactadaCargue: r.hora_cita_cargue,
    horasPactoDescargue: r.horas_pacto_descargue,
    minutosPactoDescargue: r.minutos_pacto_descargue ?? '0',
    fechaCitaPactadaDescargue: fecha(r.fecha_cita_descargue),
    horaCitaPactadaDescargueRemesa: r.hora_cita_descargue,
    codSedePropietario: await sedeTercero(conn, r.propietario_tipo_id, r.propietario_num_id),
    CODIGOUN: r.codigo_un,
    ESTADOMERCANCIA: r.estado_producto,
  };
  return RndcClient.renderVariables(vars);
}

/** Port of payloadManifiesto(). Exported for real-data parity checks. */
export async function payloadManifiesto(m: Row, conn: Queryable): Promise<string> {
  let remolque: RndcVars[string] = null;
  if (m.placa_vehiculo) {
    const v = await fila(conn, 'SELECT remolque_placa FROM vehiculo WHERE placa = ?', [
      String(m.placa_vehiculo).toUpperCase(),
    ]);
    remolque = v?.remolque_placa ?? null;
  }

  let tarifaIca: RndcVars[string] = null;
  if (m.solicitud_id) {
    const s = await fila(conn, 'SELECT porcentaje_ica FROM solicitud_servicio WHERE id = ?', [Number(m.solicitud_id)]);
    tarifaIca = s?.porcentaje_ica ?? null;
  }

  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    NUMMANIFIESTOCARGA: m.num_manifiesto,
    CODOPERACIONTRANSPORTE: m.operacion_transporte,
    FECHAEXPEDICIONMANIFIESTO: fecha(m.fecha_expedicion),
    CODMUNICIPIOORIGENMANIFIESTO: m.municipio_origen,
    CODMUNICIPIODESTINOMANIFIESTO: m.municipio_destino,
    CODIDTITULARMANIFIESTO: m.titular_tipo_id,
    NUMIDTITULARMANIFIESTO: m.titular_num_id,
    NUMPLACA: m.placa_vehiculo,
    NUMPLACAREMOLQUE: remolque,
    CODIDCONDUCTOR: m.conductor_tipo_id,
    NUMIDCONDUCTOR: m.conductor_num_id,
    VALORFLETEPACTADOVIAJE: num(m.valor_flete_pactado),
    RETENCIONICAMANIFIESTOCARGA: num(tarifaIca),
    RETENCIONFUENTEMANIFIESTO: num(m.retencion_fuente),
    VALORANTICIPOMANIFIESTO: num(m.valor_anticipo),
    CODMUNICIPIOPAGOSALDO: m.municipio_pago_saldo,
    FECHAPAGOSALDOMANIFIESTO: fecha(m.fecha_pago_saldo),
    CODRESPONSABLEPAGOCARGUE: m.responsable_pago_cargue,
    CODRESPONSABLEPAGODESCARGUE: m.responsable_pago_descargue,
    TIPOVALORPACTADO: m.tipo_valor_pactado,
    MANNROPOLIZA: m.nro_poliza,
    // NITMONITOREOFLOTA is also emitted here (renderVariables skips it when empty)
    // AND appended explicitly below — the PHP does both, so a non-empty EMF appears
    // twice. Preserved verbatim for byte parity with the original.
    NITMONITOREOFLOTA: m.emf,
  };

  // Remesas linked to the manifiesto (nested block) — iterate the join table.
  const [remesasRows] = await conn.query<RowDataPacket[]>(
    `SELECT r.num_remesa FROM remesa r
     JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
     WHERE mr.manifiesto_id = ?
     ORDER BY r.id`,
    [Number(m.id)],
  );
  let remesasXml = '';
  for (const rem of remesasRows as Row[]) {
    remesasXml +=
      '<REMESA><CONSECUTIVOREMESA>' +
      RndcClient.escaparXml(String(rem.num_remesa)) +
      '</CONSECUTIVOREMESA></REMESA>';
  }

  let xml = RndcClient.renderVariables(vars);
  xml += '<NITMONITOREOFLOTA>' + RndcClient.escaparXml(String(m.emf ?? '')) + '</NITMONITOREOFLOTA>';
  return xml + '<REMESASMAN procesoid="43">' + remesasXml + '</REMESASMAN>';
}

/** Port of payloadCumplidoRemesa(). */
async function payloadCumplidoRemesa(r: Row): Promise<string> {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    NUMMANIFIESTOCARGA: r.num_manifiesto ?? '',
    CONSECUTIVOREMESA: RndcClient.escaparXml(String(r.num_remesa ?? '')),
    TIPOCUMPLIDOREMESA: r.cumplido_tipo ?? 'C',
    NOMUNIDADMEDIDACAPACIDAD: r.unidad_medida ?? '1',
    CANTIDADCARGADA: num(r.peso),
    CANTIDADENTREGADA: num(r.cantidad_entregada ?? r.peso),
  };
  let xml = RndcClient.renderVariables(vars);
  if (r.fecha_llegada_descargue) {
    xml += '<FECHALLEGADADESCARGUE>' + fecha(r.fecha_llegada_descargue) + '</FECHALLEGADADESCARGUE>';
    xml += '<HORALLEGADADESCARGUECUMPLIDO>' + RndcClient.escaparXml(String(r.hora_llegada_descargue ?? '')) + '</HORALLEGADADESCARGUECUMPLIDO>';
  }
  if (r.fecha_entrada_descargue) {
    xml += '<FECHAENTRADADESCARGUE>' + fecha(r.fecha_entrada_descargue) + '</FECHAENTRADADESCARGUE>';
    xml += '<HORAENTRADADESCARGUECUMPLIDO>' + RndcClient.escaparXml(String(r.hora_entrada_descargue ?? '')) + '</HORAENTRADADESCARGUECUMPLIDO>';
  }
  if (r.fecha_salida_descargue) {
    xml += '<FECHASALIDADESCARGUE>' + fecha(r.fecha_salida_descargue) + '</FECHASALIDADESCARGUE>';
    xml += '<HORASALIDADESCARGUECUMPLIDO>' + RndcClient.escaparXml(String(r.hora_salida_descargue ?? '')) + '</HORASALIDADESCARGUECUMPLIDO>';
  }
  if (r.fecha_llegada_cargue) {
    xml += '<FECHALLEGADACARGUE>' + fecha(r.fecha_llegada_cargue) + '</FECHALLEGADACARGUE>';
    xml += '<HORALLEGADACARGUEREMESA>' + RndcClient.escaparXml(String(r.hora_llegada_cargue ?? '')) + '</HORALLEGADACARGUEREMESA>';
  }
  return xml;
}

/** Port of payloadCumplidoManifiesto(). */
async function payloadCumplidoManifiesto(m: Row): Promise<string> {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    NUMMANIFIESTOCARGA: m.num_manifiesto,
    NOMTIPOCUMPLIDOMANIFIESTO: m.cumplido_tipo ?? 'C',
    FECHAENTREGADOCUMENTOS: fecha(m.fecha_entrega_documentos),
  };
  let xml = RndcClient.renderVariables(vars);
  xml += '<VALORADICIONALFLETE>' + num(m.valor_adicional_flete ?? 0) + '</VALORADICIONALFLETE>';
  xml += '<VALORDESCUENTOFLETE>' + num(m.valor_descuento_flete ?? 0) + '</VALORDESCUENTOFLETE>';
  xml += '<OBSERVACIONES>' + RndcClient.escaparXml(String(m.observaciones_cumplido ?? '')) + '</OBSERVACIONES>';
  return xml;
}

// ---------- Reads for the monitor ----------

const FILTROS: Record<string, string[]> = {
  despacho: ['remesa', 'manifiesto'],
  cumplido: ['cumplido_remesa', 'cumplido_manifiesto'],
};

/** Lists the queue. Port of listar(). */
export async function listar(proceso = 'despacho', limite = 200): Promise<Row[]> {
  let where = "WHERE c.tipo_documento NOT IN ('tercero','vehiculo')";
  const filtro = FILTROS[proceso];
  if (filtro) where += ` AND c.tipo_documento IN (${filtro.map((t) => `'${t}'`).join(',')})`;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT c.*, s.consecutivo
     FROM cola_envios c
     LEFT JOIN solicitud_servicio s ON s.id = c.solicitud_id
     ${where}
     ORDER BY c.id DESC LIMIT ${Number(limite)}`,
  );
  return rows as Row[];
}

/** Count by estado. Port of resumen(). */
export async function resumen(proceso = 'despacho'): Promise<Record<string, number>> {
  let where = "WHERE tipo_documento NOT IN ('tercero','vehiculo')";
  const filtro = FILTROS[proceso];
  if (filtro) where += ` AND tipo_documento IN (${filtro.map((t) => `'${t}'`).join(',')})`;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT estado, COUNT(*) n FROM cola_envios ${where} GROUP BY estado`,
  );
  const out: Record<string, number> = {};
  for (const f of rows as Row[]) out[f.estado] = Number(f.n);
  return out;
}

/** Raw XML preview + RNDC response for a queue row. Backs GET /cola/:id/xml. */
export async function xmlDe(colaId: number): Promise<{ found: boolean; text: string }> {
  const f = await fila(db(), 'SELECT * FROM cola_envios WHERE id = ?', [colaId]);
  if (!f) return { found: false, text: 'No encontrado.' };
  let text = '';
  try {
    const rndc = await RndcClient.desdeConfig();
    text = '=== PREVISUALIZACIÓN XML ===\n\n' + rndc.previewXmlInterno(Number(f.proceso_rndc), String(f.payload_xml));
  } catch {
    text = '(Fragmento <variables>):\n' + String(f.payload_xml);
  }
  if (f.respuesta_rndc) {
    text += '\n\n=== RESPUESTA DEL RNDC ===\n\n' + String(f.respuesta_rndc);
  }
  return { found: true, text };
}

/** Paginated dispatches (grouped by manifiesto). Port of listarDespachosConPaginacion(). */
export async function listarDespachosConPaginacion(
  q = '',
  pagina = 1,
  porPagina = 10,
  desde: string | null = null,
  hasta: string | null = null,
): Promise<{ items: Row[]; total: number }> {
  const from = `FROM remesa r
                JOIN solicitud_servicio s ON s.id = r.solicitud_id
                LEFT JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
                LEFT JOIN manifiesto m ON m.id = mr.manifiesto_id`;
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (q !== '') {
    where += ' AND (r.num_remesa LIKE ? OR m.num_manifiesto LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (desde !== null) {
    where += ' AND r.created_at >= ?';
    params.push(desde);
  }
  if (hasta !== null) {
    where += ' AND r.created_at <= ?';
    params.push(`${hasta} 23:59:59`);
  }
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total ${from} ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const offset = Math.max(0, (pagina - 1) * porPagina);
  const cols = `r.id AS remesa_id, r.solicitud_id, s.consecutivo,
                r.num_remesa, m.num_manifiesto, m.id AS manifiesto_id,
                r.created_at, r.estado_rndc AS estado_remesa, m.estado_rndc AS estado_manifiesto`;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT ${cols} ${from} ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, porPagina, offset],
  );
  return { items: rows as Row[], total };
}

/** Fetches a despacho (manifiesto + its solicitud + linked remesas), for editing. */
export async function obtenerDespacho(manifiestoId: number): Promise<{ solicitud: Row; manifiesto: Row; remesas: Row[] } | null> {
  const manifiesto = await fila(db(), 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manifiesto === null) return null;
  const solicitud = await fila(db(), 'SELECT * FROM solicitud_servicio WHERE id = ?', [manifiesto.solicitud_id]);
  if (solicitud === null) return null;
  const [rs] = await db().query<RowDataPacket[]>(
    `SELECT r.* FROM remesa r
     JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
     WHERE mr.manifiesto_id = ?
     ORDER BY r.id`,
    [manifiestoId],
  );
  return { solicitud, manifiesto, remesas: rs as Row[] };
}

async function tenedorCampo(conn: Queryable, placa: string, col: 'tenedor_tipo_id' | 'tenedor_num_id'): Promise<string | null> {
  if (placa === '') return null;
  const v = await fila(conn, `SELECT ${col} FROM vehiculo WHERE placa = ?`, [placa.toUpperCase()]);
  return (v?.[col] as string | undefined) ?? null;
}

/** Editable manifiesto fields (mirrors CAMPOS_DESPACHO in solicitud.repo.ts). */
const CAMPOS_MANIFIESTO_EDITABLES = [
  'placa_vehiculo', 'conductor_tipo_id', 'conductor_num_id',
  'responsable_pago_cargue', 'responsable_pago_descargue',
  'valor_anticipo', 'emf',
] as const;

/** Editable remesa fields — everything captured on the Confirmar Despacho screen. */
const CAMPOS_REMESA_EDITABLES = [
  'naturaleza_carga', 'tipo_empaque', 'mercancia_codigo', 'descripcion_producto',
  'unidad_medida', 'peso', 'valor_mercancia',
  'remitente_tipo_id', 'remitente_num_id',
  'destinatario_tipo_id', 'destinatario_num_id',
  'fecha_cita_cargue', 'hora_cita_cargue', 'horas_pacto_cargue', 'minutos_pacto_cargue',
  'fecha_cita_descargue', 'hora_cita_descargue', 'horas_pacto_descargue', 'minutos_pacto_descargue',
] as const;

/**
 * Updates a confirmed despacho's manifiesto + remesa fields, then regenerates the
 * still-pending queue rows' stored XML so the next send reflects the edits (the
 * queue stores a frozen payload_xml snapshot at enqueue time — see encolar()).
 *
 * Gated per document: a manifiesto already 'aceptado' by the RNDC can't be
 * edited at all; a remesa already 'aceptado' is silently left untouched (its
 * fields are locked) while the rest of the despacho can still be corrected.
 */
export async function actualizarDespacho(manifiestoId: number, datos: Row): Promise<ItemResult> {
  return withTransaction(async (conn) => {
    const manifiesto = await fila(conn, 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
    if (manifiesto === null) return { ok: false, mensaje: 'Despacho no encontrado.' };
    if (manifiesto.estado_rndc === 'aceptado') {
      return { ok: false, mensaje: 'El manifiesto ya fue aceptado por el RNDC; no se puede editar.' };
    }

    const filaManif: Row = {};
    for (const c of CAMPOS_MANIFIESTO_EDITABLES) {
      const valor = datos[c];
      filaManif[c] = valor === '' || valor === undefined || valor === null ? null : valor;
    }
    if (filaManif.placa_vehiculo) {
      filaManif.titular_tipo_id = await tenedorCampo(conn, String(filaManif.placa_vehiculo), 'tenedor_tipo_id');
      filaManif.titular_num_id = await tenedorCampo(conn, String(filaManif.placa_vehiculo), 'tenedor_num_id');
    }
    const setsManif = Object.keys(filaManif).map((c) => `${c} = ?`).join(', ');
    await conn.query(`UPDATE manifiesto SET ${setsManif} WHERE id = ?`, [...Object.values(filaManif), manifiestoId]);

    const remesasBody: Row[] = Array.isArray(datos.remesas) ? datos.remesas : [];
    let omitidas = 0;
    for (const rd of remesasBody) {
      const rid = Number(rd.id ?? 0);
      if (!rid) continue;
      const actual = await fila(conn, 'SELECT estado_rndc FROM remesa WHERE id = ?', [rid]);
      if (actual === null || actual.estado_rndc === 'aceptado') {
        omitidas++;
        continue;
      }

      const filaRem: Row = {};
      for (const c of CAMPOS_REMESA_EDITABLES) {
        const valor = rd[c];
        filaRem[c] = valor === '' || valor === undefined || valor === null ? null : valor;
      }
      // cantidadCargada travels to the RNDC as the loaded quantity — the remesa's
      // own peso, not a separate value.
      filaRem.cantidad_cargada = filaRem.peso ?? 1;
      if (filaRem.mercancia_codigo) {
        const p = await fila(conn, 'SELECT codigo_un, estado_producto FROM producto WHERE codigo = ?', [filaRem.mercancia_codigo]);
        filaRem.codigo_un = p?.codigo_un || null;
        filaRem.estado_producto = p?.estado_producto || null;
      }
      const setsRem = Object.keys(filaRem).map((c) => `${c} = ?`).join(', ');
      await conn.query(`UPDATE remesa SET ${setsRem} WHERE id = ?`, [...Object.values(filaRem), rid]);
    }

    // Regenerate the queued XML for anything not yet sent, and give it a clean
    // slate to retry (this is exactly the recovery path for a rejected send
    // like "Error REM382: La cantidad es muy pequeña").
    const manifiestoActualizado = (await fila(conn, 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]))!;
    const [colaRows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM cola_envios WHERE manifiesto_id = ? AND tipo_documento IN ('remesa','manifiesto') AND estado IN ('pendiente','error')`,
      [manifiestoId],
    );
    for (const cr of colaRows as Row[]) {
      let xml: string;
      if (cr.tipo_documento === 'remesa') {
        const rem = await fila(conn, 'SELECT * FROM remesa WHERE id = ?', [cr.referencia_id]);
        if (rem === null) continue;
        xml = await payloadRemesa(rem, conn);
      } else {
        xml = await payloadManifiesto(manifiestoActualizado, conn);
      }
      await conn.query(
        `UPDATE cola_envios SET payload_xml = ?, estado = 'pendiente', ultimo_error = NULL, respuesta_rndc = NULL, programado_para = NULL WHERE id = ?`,
        [xml, cr.id],
      );
    }

    const mensaje =
      omitidas > 0
        ? `Despacho actualizado (${omitidas} remesa(s) ya aceptada(s) por el RNDC no se modificaron).`
        : 'Despacho actualizado correctamente.';
    return { ok: true, mensaje };
  });
}

/** Count of remesas not yet accepted by the RNDC. Backs the "Despachos" nav badge. */
export async function contarDespachosPendientes(): Promise<number> {
  const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
    "SELECT COUNT(*) AS n FROM remesa WHERE estado_rndc <> 'aceptado'",
  );
  return Number(rows[0]?.n ?? 0);
}

/** Count of manifiestos pending cumplido. Backs the "Cumplido" nav badge. */
export async function contarPendientesCumplido(): Promise<number> {
  const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
    "SELECT COUNT(*) AS n FROM manifiesto WHERE cumplido_estado_rndc = 'pendiente'",
  );
  return Number(rows[0]?.n ?? 0);
}

/** Dispatches whose manifiesto was accepted but cumplido is pending. Port of listarPendientesCumplido(). */
export async function listarPendientesCumplido(): Promise<Row[]> {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT m.id AS manifiesto_id, m.solicitud_id, s.consecutivo,
            m.num_manifiesto, m.placa_vehiculo AS placa,
            (SELECT COUNT(*) FROM manifiesto_remesa mr WHERE mr.manifiesto_id = m.id) AS remesas,
            COUNT(r2.id) AS remesas_cumplidas
     FROM manifiesto m
     JOIN solicitud_servicio s ON s.id = m.solicitud_id
     JOIN manifiesto_remesa mr2 ON mr2.manifiesto_id = m.id
     JOIN remesa r2 ON r2.id = mr2.remesa_id
     WHERE m.cumplido_estado_rndc = 'pendiente'
     GROUP BY m.id, m.solicitud_id, s.consecutivo, m.num_manifiesto, m.placa_vehiculo
     ORDER BY m.id DESC`,
  );
  return rows as Row[];
}

/** Remesas of a manifiesto with their cumplido data. Port of obtenerRemesasCumplido(). */
export async function obtenerRemesasCumplido(manifiestoId: number): Promise<Row[]> {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT r.* FROM remesa r
     JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
     WHERE mr.manifiesto_id = ?
     ORDER BY r.id`,
    [manifiestoId],
  );
  return rows as Row[];
}
