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
import { consecutivoRemesaRndc } from '../../util/consecutivoRndc.js';
import { pesoAsignadoSolicitud, pesoTotalDe } from '../../util/pesoSolicitud.js';
import { cached } from '../../util/cache.js';

type Queryable = Pool | PoolConnection;
type Row = Record<string, any>;

/** TTL for the nav-badge counts: high-frequency polls collapse to one query per window. */
const BADGE_TTL_MS = 15_000;

/**
 * Send order per document type. Anulación is the reverse of creation (LIFO):
 * you can only "pop" the top of the stack, so the anular_* orders run after the
 * forward flow and in reverse (cumplido manifiesto → cumplido remesa →
 * manifiesto → remesa). The `dependenciaPendiente()` check enforces this.
 *
 * anular_cumplido_inicial_remesa (proc 54) has no fixed slot: it is injected
 * reactively at runtime with an orden just below the step that the RNDC says
 * needs it — see the remediation logic in Phase 2.
 */
const ORDEN: Record<string, number> = {
  tercero: 10,
  vehiculo: 20,
  remesa: 30,
  manifiesto: 40,
  cumplido_remesa: 50,
  cumplido_manifiesto: 60,
  anular_cumplido_manifiesto: 70,
  anular_cumplido_remesa: 80,
  anular_cumplido_inicial_remesa: 85, // nominal; real orden set on reactive injection
  anular_manifiesto: 90,
  anular_remesa: 100,
};
/** RNDC proceso per document type. */
const PROCESO: Record<string, number> = {
  tercero: 11,
  vehiculo: 12,
  remesa: 3,
  manifiesto: 4,
  cumplido_remesa: 5,
  cumplido_manifiesto: 6,
  anular_cumplido_manifiesto: 29,
  anular_cumplido_remesa: 28,
  anular_cumplido_inicial_remesa: 54,
  anular_manifiesto: 32,
  anular_remesa: 9,
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

/**
 * Normalizes an hora value to the RNDC military format hh:mm (two digits each),
 * dropping any seconds. A TIME column / picker can yield "15:00:00", which the
 * RNDC rejects (CRE090/120/150 expect exactly hh:mm).
 */
function hora(h: unknown): string {
  if (h === null || h === undefined) return '';
  const s = String(h).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  const [, hh, mm] = m;
  return `${hh!.padStart(2, '0')}:${mm}`;
}

/**
 * Debe reflejar EXACTAMENTE el ENUM real de `cola_envios.tipo_documento` (ver
 * migracion_v37 y migracion_v43). En un MySQL sin STRICT_TRANS_TABLES, insertar
 * un valor fuera del ENUM no falla: MySQL lo guarda en silencio como '' — ya
 * pasó dos veces (cumplido en v37, anulación en v43) y corrompió filas sin
 * ningún error visible. Esta validación convierte ese silencio en una
 * excepción inmediata la próxima vez que se agregue un tipo_documento nuevo
 * sin también migrar la columna.
 */
const TIPOS_DOCUMENTO_VALIDOS = new Set([
  'remesa', 'manifiesto', 'tercero', 'vehiculo',
  'cumplido_remesa', 'cumplido_manifiesto',
  'anular_cumplido_manifiesto', 'anular_cumplido_remesa',
  'anular_cumplido_inicial_remesa', 'anular_manifiesto', 'anular_remesa',
]);

/** Inserts a queue row (uses manifiesto_id instead of remesa_id). Port of insertarCola(). */
async function insertarCola(
  exec: Queryable,
  solicitudId: number,
  manifiestoId: number,
  tipo: string,
  referenciaId: number,
  payloadXml: string,
  orden: number = ORDEN[tipo]!,
): Promise<void> {
  if (!TIPOS_DOCUMENTO_VALIDOS.has(tipo)) {
    throw new Error(
      `tipo_documento "${tipo}" no está en el ENUM de cola_envios.tipo_documento — falta una migración. Ver TIPOS_DOCUMENTO_VALIDOS en cola.repo.ts.`,
    );
  }
  await exec.query(
    `INSERT INTO cola_envios
        (solicitud_id, manifiesto_id, tipo_documento, referencia_id, proceso_rndc, orden, payload_xml, estado, max_intentos)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    [solicitudId, manifiestoId, tipo, referenciaId, PROCESO[tipo], orden, payloadXml, config().cola.maxIntentos],
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

/**
 * Removes a still-pending/errored queue row for this (manifiesto, tipo,
 * referencia) before re-enqueuing a fresh one. The Cumplido form can be
 * re-saved before it's actually sent (correcting a date, a value, etc.) —
 * without this, every re-save added a brand new row instead of replacing
 * the queued one, so the same cumplido ended up duplicated in Cola de envíos.
 * Rows already 'enviando'/'enviado' are left alone.
 */
async function reemplazarColaPendiente(
  conn: Queryable,
  manifiestoId: number,
  tipo: string,
  referenciaId: number,
): Promise<void> {
  await conn.query(
    `DELETE FROM cola_envios WHERE manifiesto_id = ? AND tipo_documento = ? AND referencia_id = ? AND estado IN ('pendiente','error')`,
    [manifiestoId, tipo, referenciaId],
  );
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
    // Skip remesas already accepted by the RNDC: re-sending a cumplido that
    // already has an ingreso id would duplicate it. Lets the user retry the
    // manifiesto cumplido without re-queuing its already-migrated remesas.
    if (rem.cumplido_rndc_ingreso_id) continue;
    await reemplazarColaPendiente(conn, manifiestoId, 'cumplido_remesa', rid);
    await insertarCola(conn, solicitudId, manifiestoId, 'cumplido_remesa', rid, await payloadCumplidoRemesa(rem));
  }
  const manif = await fila(conn, 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manif !== null && !manif.cumplido_rndc_ingreso_id) {
    await reemplazarColaPendiente(conn, manifiestoId, 'cumplido_manifiesto', manifiestoId);
    await insertarCola(conn, solicitudId, manifiestoId, 'cumplido_manifiesto', manifiestoId, await payloadCumplidoManifiesto(manif));
  }
}

/** Motivo que elige el usuario; se traduce al código RNDC según el proceso. */
export type MotivoAnulacion = 'digitacion' | 'cancelacion';

/** Código de motivo para los cumplidos (procs 28/29/54): D o O. */
function motivoCumplido(reason: MotivoAnulacion): string {
  return reason === 'digitacion' ? 'D' : 'O';
}
/** Código de motivo para el documento base (procs 32 manifiesto / 9 remesa): D o S. */
function motivoBase(reason: MotivoAnulacion): string {
  return reason === 'digitacion' ? 'D' : 'S';
}

/** Etiquetas legibles de cada paso, para el preview y para Cola. */
export const ETIQUETA_ANULACION: Record<string, string> = {
  anular_cumplido_manifiesto: 'Anular cumplido de manifiesto',
  anular_cumplido_remesa: 'Anular cumplido de remesa',
  anular_cumplido_inicial_remesa: 'Anular cumplido inicial de remesa',
  anular_manifiesto: 'Anular manifiesto',
  anular_remesa: 'Anular remesa',
};

interface PasoAnulacion {
  tipo: 'anular_cumplido_manifiesto' | 'anular_cumplido_remesa' | 'anular_manifiesto' | 'anular_remesa';
  /** id de la fila origen: manifiestoId para los dos primeros/anular_manifiesto, remesaId para anular_remesa. */
  referenciaId: number;
  /** consecutivo mostrado al usuario (num_manifiesto o el consecutivo RNDC de la remesa). */
  consecutivo: string;
}

/**
 * Calcula qué pasos de anulación aplican, en el orden inverso a la creación
 * (LIFO): anular cumplido manifiesto (29) → anular cumplido remesa (28) →
 * anular manifiesto (32) → anular remesa (9). Es la ÚNICA fuente de verdad de
 * "qué se va a anular" — la usan tanto el preview (solo lectura) como
 * encolarAnulacion() (ejecuta), para que nunca diverjan.
 */
function calcularPasosAnulacion(manif: Row, remesas: Row[]): PasoAnulacion[] {
  const pasos: PasoAnulacion[] = [];
  if (manif.cumplido_estado_rndc === 'aceptado') {
    pasos.push({ tipo: 'anular_cumplido_manifiesto', referenciaId: Number(manif.id), consecutivo: manif.num_manifiesto });
  }
  for (const rem of remesas) {
    if (rem.cumplido_estado_rndc === 'aceptado') {
      pasos.push({ tipo: 'anular_cumplido_remesa', referenciaId: Number(rem.id), consecutivo: consecutivoRemesaRndc(rem.num_remesa) });
    }
  }
  pasos.push({ tipo: 'anular_manifiesto', referenciaId: Number(manif.id), consecutivo: manif.num_manifiesto });
  for (const rem of remesas) {
    if (rem.estado_rndc === 'aceptado') {
      pasos.push({ tipo: 'anular_remesa', referenciaId: Number(rem.id), consecutivo: consecutivoRemesaRndc(rem.num_remesa) });
    }
  }
  return pasos;
}

async function manifiestoYRemesas(conn: Queryable, manifiestoId: number): Promise<{ manif: Row; remesas: Row[] } | null> {
  const manif = await fila(conn, 'SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manif === null) return null;
  const [remesaRows] = await conn.query<RowDataPacket[]>(
    `SELECT r.* FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
     WHERE mr.manifiesto_id = ? ORDER BY r.id`,
    [manifiestoId],
  );
  return { manif, remesas: remesaRows as Row[] };
}

export interface PreviewAnulacion {
  puedeAnular: boolean;
  motivoBloqueo: string | null;
  pasos: { tipo: string; label: string; consecutivo: string }[];
}

/** Preview de solo lectura: qué pasos se ejecutarían si se confirma la anulación. */
export async function previsualizarAnulacion(manifiestoId: number): Promise<PreviewAnulacion> {
  const datos = await manifiestoYRemesas(db(), manifiestoId);
  if (datos === null) return { puedeAnular: false, motivoBloqueo: 'Manifiesto no encontrado.', pasos: [] };
  if (datos.manif.estado_rndc !== 'aceptado') {
    return {
      puedeAnular: false,
      motivoBloqueo: 'Solo se puede anular un manifiesto radicado (aceptado) en el RNDC.',
      pasos: [],
    };
  }
  const pasos = calcularPasosAnulacion(datos.manif, datos.remesas);
  return {
    puedeAnular: true,
    motivoBloqueo: null,
    pasos: pasos.map((p) => ({ tipo: p.tipo, label: ETIQUETA_ANULACION[p.tipo]!, consecutivo: p.consecutivo })),
  };
}

/**
 * Encola la anulación de un despacho radicado según calcularPasosAnulacion().
 * El paso 54 (cumplido inicial) NO se encola aquí: se inyecta reactivamente si
 * el RNDC lo exige (ver la remediación en aplicarResultado()).
 *
 * Precondición dura: el manifiesto debe estar radicado ('aceptado'). Si sus
 * remesas siguen cumplidas, primero se anulan los cumplidos (pasos 29/28), lo
 * cual las deja re-cumplibles; luego se anulan manifiesto y remesas.
 */
export async function encolarAnulacion(
  conn: Queryable,
  manifiestoId: number,
  reason: MotivoAnulacion,
  observaciones: string,
  anuladoPor: number | null,
): Promise<void> {
  const datos = await manifiestoYRemesas(conn, manifiestoId);
  if (datos === null) throw new Error('Manifiesto no encontrado.');
  const { manif, remesas } = datos;
  if (manif.estado_rndc !== 'aceptado') {
    throw new Error('Solo se puede anular un manifiesto radicado (aceptado) en el RNDC.');
  }
  const solicitudId = Number(manif.solicitud_id);
  const nit = (await obtenerEmpresa()).nit;
  const obs = observaciones ?? '';
  const mBase = motivoBase(reason);
  const mCump = motivoCumplido(reason);
  const remesaPorId = new Map(remesas.map((r) => [Number(r.id), r] as const));

  for (const paso of calcularPasosAnulacion(manif, remesas)) {
    await reemplazarColaPendiente(conn, manifiestoId, paso.tipo, paso.referenciaId);
    let payload: string;
    switch (paso.tipo) {
      case 'anular_cumplido_manifiesto':
        payload = payloadAnularCumplidoManifiesto(nit, manif.num_manifiesto, mCump, obs);
        break;
      case 'anular_cumplido_remesa':
        payload = payloadAnularCumplidoRemesa(nit, remesaPorId.get(paso.referenciaId)!.num_remesa, mCump, obs);
        break;
      case 'anular_manifiesto':
        payload = payloadAnularManifiesto(nit, manif.num_manifiesto, mBase, obs);
        break;
      case 'anular_remesa':
        payload = payloadAnularRemesa(nit, remesaPorId.get(paso.referenciaId)!.num_remesa, mBase, obs);
        break;
    }
    await insertarCola(conn, solicitudId, manifiestoId, paso.tipo, paso.referenciaId, payload);
  }

  // Marca los documentos como "anulación en curso" + auditoría. El estado final
  // 'anulado' lo pone marcarOrigen() cuando el RNDC confirma cada paso.
  await conn.query(
    `UPDATE manifiesto SET estado_rndc = 'anulacion_pendiente', anulacion_motivo = ?,
       anulacion_observaciones = ?, anulado_por = ? WHERE id = ?`,
    [mBase, obs, anuladoPor, manifiestoId],
  );
  await conn.query(
    `UPDATE remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
       SET r.estado_rndc = 'anulacion_pendiente', r.anulacion_motivo = ?,
           r.anulacion_observaciones = ?, r.anulado_por = ?
     WHERE mr.manifiesto_id = ? AND r.estado_rndc = 'aceptado'`,
    [mBase, obs, anuladoPor, manifiestoId],
  );
}

// ---------- Anulación individual (por fila de Cola, sin cascada) ----------
//
// Además de la anulación completa del despacho (encolarAnulacion, arriba), el
// usuario puede anular UN solo documento ya enviado — una remesa suelta, solo
// el manifiesto, o solo un cumplido — sin arrastrar el resto. Cada tipo tiene
// su propia precondición RNDC (más estrecha que la de la cascada completa).

export interface PreviewAnulacionIndividual {
  puedeAnular: boolean;
  motivoBloqueo: string | null;
  tipoAnulacion: string | null;
  label: string | null;
  consecutivo: string | null;
}

const bloqueoIndividual = (motivo: string): PreviewAnulacionIndividual => ({
  puedeAnular: false,
  motivoBloqueo: motivo,
  tipoAnulacion: null,
  label: null,
  consecutivo: null,
});

/**
 * Preview de solo lectura para la anulación individual de una fila de Cola ya
 * enviada (`cola_envios.estado = 'enviado'`). `exec` permite reutilizar esta
 * misma validación dentro de una transacción (encolarAnulacionIndividual) o
 * suelta contra el pool (endpoint de preview).
 */
export async function previsualizarAnulacionIndividual(
  colaId: number,
  exec: Queryable = db(),
): Promise<PreviewAnulacionIndividual> {
  const row = await fila(exec, 'SELECT * FROM cola_envios WHERE id = ?', [colaId]);
  if (row === null) return bloqueoIndividual('Registro de cola no encontrado.');
  if (row.estado !== 'enviado') {
    return bloqueoIndividual('Solo se puede anular un documento que ya fue enviado y aceptado por el RNDC.');
  }
  const referenciaId = Number(row.referencia_id);

  switch (row.tipo_documento) {
    case 'remesa': {
      const rem = await fila(exec, 'SELECT * FROM remesa WHERE id = ?', [referenciaId]);
      if (rem === null) return bloqueoIndividual('Remesa no encontrada.');
      if (rem.estado_rndc !== 'aceptado') return bloqueoIndividual(`La remesa ya está en estado "${rem.estado_rndc}".`);
      if (rem.cumplido_estado_rndc === 'aceptado') {
        return bloqueoIndividual('Esta remesa ya fue cumplida. Anula primero el cumplido de la remesa.');
      }
      // RNDC: una remesa asociada a un manifiesto radicado solo se puede
      // "liberar", no anular directamente — primero hay que anular el manifiesto.
      const manif = await fila(
        exec,
        `SELECT m.estado_rndc FROM manifiesto m JOIN manifiesto_remesa mr ON mr.manifiesto_id = m.id WHERE mr.remesa_id = ?`,
        [referenciaId],
      );
      if (manif !== null && manif.estado_rndc === 'aceptado') {
        return bloqueoIndividual('Esta remesa está asociada a un manifiesto radicado. Anula primero el manifiesto.');
      }
      return {
        puedeAnular: true,
        motivoBloqueo: null,
        tipoAnulacion: 'anular_remesa',
        label: ETIQUETA_ANULACION.anular_remesa!,
        consecutivo: consecutivoRemesaRndc(rem.num_remesa),
      };
    }
    case 'manifiesto': {
      const manif = await fila(exec, 'SELECT * FROM manifiesto WHERE id = ?', [referenciaId]);
      if (manif === null) return bloqueoIndividual('Manifiesto no encontrado.');
      if (manif.estado_rndc !== 'aceptado') return bloqueoIndividual(`El manifiesto ya está en estado "${manif.estado_rndc}".`);
      if (manif.cumplido_estado_rndc === 'aceptado') {
        return bloqueoIndividual('Este manifiesto ya fue cumplido. Anula primero su cumplido.');
      }
      const [remesaRows] = await exec.query<RowDataPacket[]>(
        `SELECT r.cumplido_estado_rndc FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id WHERE mr.manifiesto_id = ?`,
        [referenciaId],
      );
      if ((remesaRows as Row[]).some((r) => r.cumplido_estado_rndc === 'aceptado')) {
        return bloqueoIndividual('Una o más remesas de este manifiesto ya fueron cumplidas. Anula esos cumplidos primero.');
      }
      return {
        puedeAnular: true,
        motivoBloqueo: null,
        tipoAnulacion: 'anular_manifiesto',
        label: ETIQUETA_ANULACION.anular_manifiesto!,
        consecutivo: manif.num_manifiesto,
      };
    }
    case 'cumplido_remesa': {
      const rem = await fila(exec, 'SELECT * FROM remesa WHERE id = ?', [referenciaId]);
      if (rem === null) return bloqueoIndividual('Remesa no encontrada.');
      if (rem.cumplido_estado_rndc !== 'aceptado') {
        return bloqueoIndividual(`El cumplido de esta remesa ya está en estado "${rem.cumplido_estado_rndc}".`);
      }
      return {
        puedeAnular: true,
        motivoBloqueo: null,
        tipoAnulacion: 'anular_cumplido_remesa',
        label: ETIQUETA_ANULACION.anular_cumplido_remesa!,
        consecutivo: consecutivoRemesaRndc(rem.num_remesa),
      };
    }
    case 'cumplido_manifiesto': {
      const manif = await fila(exec, 'SELECT * FROM manifiesto WHERE id = ?', [referenciaId]);
      if (manif === null) return bloqueoIndividual('Manifiesto no encontrado.');
      if (manif.cumplido_estado_rndc !== 'aceptado') {
        return bloqueoIndividual(`El cumplido de este manifiesto ya está en estado "${manif.cumplido_estado_rndc}".`);
      }
      return {
        puedeAnular: true,
        motivoBloqueo: null,
        tipoAnulacion: 'anular_cumplido_manifiesto',
        label: ETIQUETA_ANULACION.anular_cumplido_manifiesto!,
        consecutivo: manif.num_manifiesto,
      };
    }
    default:
      return bloqueoIndividual('Este tipo de documento no se puede anular individualmente.');
  }
}

/**
 * Encola la anulación de UN solo documento (fila de Cola ya enviada), sin
 * arrastrar el resto de la cascada. Valida con la misma función que el preview
 * para que nunca diverjan.
 */
export async function encolarAnulacionIndividual(
  conn: Queryable,
  colaId: number,
  reason: MotivoAnulacion,
  observaciones: string,
  anuladoPor: number | null,
): Promise<void> {
  const preview = await previsualizarAnulacionIndividual(colaId, conn);
  if (!preview.puedeAnular || !preview.tipoAnulacion) {
    throw new Error(preview.motivoBloqueo ?? 'No se puede anular este documento.');
  }
  const row = await fila(conn, 'SELECT * FROM cola_envios WHERE id = ?', [colaId]);
  const referenciaId = Number(row!.referencia_id);
  const solicitudId = Number(row!.solicitud_id);
  const manifiestoId = Number(row!.manifiesto_id);
  const nit = (await obtenerEmpresa()).nit;
  const obs = observaciones ?? '';
  const mBase = motivoBase(reason);
  const mCump = motivoCumplido(reason);

  let payload: string;
  switch (preview.tipoAnulacion) {
    case 'anular_remesa': {
      const rem = await fila(conn, 'SELECT num_remesa FROM remesa WHERE id = ?', [referenciaId]);
      payload = payloadAnularRemesa(nit, rem!.num_remesa, mBase, obs);
      await conn.query(
        `UPDATE remesa SET estado_rndc = 'anulacion_pendiente', anulacion_motivo = ?,
           anulacion_observaciones = ?, anulado_por = ? WHERE id = ?`,
        [mBase, obs, anuladoPor, referenciaId],
      );
      break;
    }
    case 'anular_manifiesto': {
      const manif = await fila(conn, 'SELECT num_manifiesto FROM manifiesto WHERE id = ?', [referenciaId]);
      payload = payloadAnularManifiesto(nit, manif!.num_manifiesto, mBase, obs);
      await conn.query(
        `UPDATE manifiesto SET estado_rndc = 'anulacion_pendiente', anulacion_motivo = ?,
           anulacion_observaciones = ?, anulado_por = ? WHERE id = ?`,
        [mBase, obs, anuladoPor, referenciaId],
      );
      break;
    }
    case 'anular_cumplido_remesa': {
      const rem = await fila(conn, 'SELECT num_remesa FROM remesa WHERE id = ?', [referenciaId]);
      payload = payloadAnularCumplidoRemesa(nit, rem!.num_remesa, mCump, obs);
      break;
    }
    case 'anular_cumplido_manifiesto': {
      const manif = await fila(conn, 'SELECT num_manifiesto FROM manifiesto WHERE id = ?', [referenciaId]);
      payload = payloadAnularCumplidoManifiesto(nit, manif!.num_manifiesto, mCump, obs);
      break;
    }
    default:
      throw new Error('Tipo de anulación no soportado.');
  }

  await reemplazarColaPendiente(conn, manifiestoId, preview.tipoAnulacion, referenciaId);
  await insertarCola(conn, solicitudId, manifiestoId, preview.tipoAnulacion, referenciaId, payload);
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
  // --- Anulación: propaga cada confirmación del RNDC al documento origen ---
  // Anular cumplido (28/29) deja el cumplido re-cumplible: vuelve a 'pendiente'
  // y limpia el ingreso, para que reaparezca "Cumplir" y se pueda reenviar.
  if (tipo === 'anular_cumplido_manifiesto') {
    await db().query(
      "UPDATE manifiesto SET cumplido_estado_rndc = 'pendiente', cumplido_rndc_ingreso_id = NULL WHERE id = ?",
      [Number(row.referencia_id)],
    );
  }
  if (tipo === 'anular_cumplido_remesa') {
    await db().query(
      "UPDATE remesa SET cumplido_estado_rndc = 'pendiente', cumplido_rndc_ingreso_id = NULL WHERE id = ?",
      [Number(row.referencia_id)],
    );
  }
  // anular_cumplido_inicial_remesa (54): es un paso previo exigido por el RNDC,
  // no lo modelamos como estado propio — su ingreso queda en cola_envios (Cola).
  // Anular manifiesto/remesa (32/9): estado final 'anulado' + número de anulación.
  if (tipo === 'anular_manifiesto') {
    await db().query(
      "UPDATE manifiesto SET estado_rndc = 'anulado', anulacion_rndc_id = ?, anulado_at = NOW() WHERE id = ?",
      [resp.ingresoId, Number(row.referencia_id)],
    );
    // Libera el cupo de vehículo que este despacho consumió en confirmarDespacho()
    // (que resta 1 de cantidad_vehiculos y marca 'procesada'/'despachada'). Aquí se
    // hace el inverso exacto — tope en cantidad_vehiculos_original, y solo con los
    // valores que el ENUM solicitud_servicio.estado realmente admite
    // ('borrador'|'procesada'|'despachada'|'anulada'; nunca otro).
    const solicitudId = Number(row.solicitud_id);
    const sol = await fila(
      db(),
      'SELECT cantidad_vehiculos, cantidad_vehiculos_original FROM solicitud_servicio WHERE id = ?',
      [solicitudId],
    );
    if (sol !== null) {
      const original = Number(sol.cantidad_vehiculos_original ?? 1) || 1;
      const nuevaCantidad = Math.min(Number(sol.cantidad_vehiculos ?? 0) + 1, original);
      const nuevoEstado = nuevaCantidad >= original ? 'borrador' : 'procesada';
      await db().query('UPDATE solicitud_servicio SET cantidad_vehiculos = ?, estado = ? WHERE id = ?', [
        nuevaCantidad,
        nuevoEstado,
        solicitudId,
      ]);
    }
  }
  if (tipo === 'anular_remesa') {
    await db().query(
      "UPDATE remesa SET estado_rndc = 'anulado', anulacion_rndc_id = ?, anulado_at = NOW() WHERE id = ?",
      [resp.ingresoId, Number(row.referencia_id)],
    );
  }
}

/**
 * Queries the manifiesto's QR security code from the RNDC. Port of
 * consultarSeguridadQr(), runs automatically right after the manifiesto is
 * accepted (marcarOrigen()) — but the RNDC's consultas server can lag behind
 * the expedir server it was just accepted on, so this is also exposed as a
 * retryable action (POST /despachos/:id/consultar-qr) instead of a one-shot
 * silent attempt. Any failure is stored on seguridadqr_error so it's visible
 * instead of only reaching the server console.
 */
export async function consultarSeguridadQr(manifiestoId: number): Promise<ItemResult> {
  const fallar = async (mensaje: string): Promise<ItemResult> => {
    await db().query('UPDATE manifiesto SET seguridadqr_error = ? WHERE id = ?', [mensaje, manifiestoId]);
    return { ok: false, mensaje };
  };
  try {
    const manif = await fila(db(), 'SELECT num_manifiesto, estado_rndc FROM manifiesto WHERE id = ?', [manifiestoId]);
    if (!manif) return { ok: false, mensaje: 'Manifiesto no encontrado.' };
    if (!manif.num_manifiesto) return fallar('El manifiesto aún no tiene número de manifiesto asignado.');
    if (manif.estado_rndc !== 'aceptado') {
      return fallar('El manifiesto todavía no ha sido aceptado por el RNDC.');
    }
    const rndc = await RndcClient.desdeConfig();
    const empresa = (await obtenerEmpresa()).nit ?? '';
    if (empresa === '') return fallar('Falta configurar el NIT de la empresa (módulo Empresa).');

    const qrResp = await rndc.consultar(
      4,
      ['INGRESOID', 'FECHAING', 'OBSERVACIONES', 'SEGURIDADQR'],
      { NUMNITEMPRESATRANSPORTE: `'${empresa}'`, NUMMANIFIESTOCARGA: `'${manif.num_manifiesto}'` },
    );
    if (!qrResp.ok) return fallar(qrResp.error ?? 'El RNDC rechazó la consulta.');
    const qr = qrResp.datos[0]?.seguridadqr;
    if (!qr) return fallar('El RNDC no devolvió el código de seguridad (posible demora del servidor de consultas).');

    await db().query('UPDATE manifiesto SET seguridadqr = ?, seguridadqr_error = NULL WHERE id = ?', [qr, manifiestoId]);
    return { ok: true, mensaje: 'Código de seguridad QR obtenido correctamente.' };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error('Error al consultar seguridadqr:', mensaje);
    return fallar(mensaje);
  }
}

/** Applies the outcome of one send to its queue row (success / retry-or-fail). */
/**
 * Inserta (si no existe ya) el paso 54 — anular cumplido inicial — para una
 * remesa puntual, con orden justo por debajo de `ordenDebajoDe` para que corra
 * antes. `motivo`/`obs` se heredan de la anulación que el usuario ya confirmó
 * (remesa o manifiesto, según quien haya disparado la remediación) — nunca se
 * le vuelve a preguntar nada. Devuelve true si insertó algo nuevo.
 */
async function inyectarCumplidoInicialRemesa(
  solicitudId: number,
  manifiestoId: number,
  remesaId: number,
  ordenDebajoDe: number,
  motivo: string,
  obs: string,
): Promise<boolean> {
  const ya = await fila(
    db(),
    `SELECT id FROM cola_envios WHERE manifiesto_id = ? AND tipo_documento = 'anular_cumplido_inicial_remesa' AND referencia_id = ?`,
    [manifiestoId, remesaId],
  );
  if (ya !== null) return false;

  const rem = await fila(db(), 'SELECT num_remesa FROM remesa WHERE id = ?', [remesaId]);
  const manif = await fila(db(), 'SELECT num_manifiesto FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (rem === null || manif === null) return false;

  const nit = (await obtenerEmpresa()).nit;
  const payload = payloadAnularCumplidoInicialRemesa(nit, rem.num_remesa, manif.num_manifiesto, motivo, obs);
  await insertarCola(db(), solicitudId, manifiestoId, 'anular_cumplido_inicial_remesa', remesaId, payload, ordenDebajoDe - 1);
  return true;
}

/**
 * Remediación reactiva del cumplido inicial de remesa (proc 54) — automática,
 * sin pedirle nada al usuario. El RNDC exige anular primero el "cumplido
 * inicial" en dos situaciones distintas:
 *
 *  - anular_cumplido_remesa / anular_remesa: rechazo genérico que menciona
 *    "cumplido inicial" (todavía sin código exacto confirmado — se matchea
 *    por texto y se loguea el error crudo para endurecerlo cuando aparezca).
 *  - anular_manifiesto: RNDC lo confirma con el código exacto ANM070 ("El
 *    Manifiesto tiene asociado Remesas con Cumplido Inicial") — en ese caso
 *    puede haber VARIAS remesas del manifiesto que lo necesiten, así que se
 *    inyecta un 54 por cada una que aún no lo tenga.
 *
 * En ambos casos el motivo/observaciones se heredan de la anulación ya
 * confirmada (remesa.anulacion_motivo o manifiesto.anulacion_motivo, según
 * corresponda) y el paso que falló se re-encola SIN gastarle intento — el/los
 * 54 corren primero (orden menor) y luego se reintenta solo.
 * Devuelve true si remedió (el llamador debe cortar y no contar la falla).
 */
async function remediarCumplidoInicial(row: Row, resp: RndcRespuesta): Promise<boolean> {
  const tipo = row.tipo_documento;
  const manifiestoId = Number(row.manifiesto_id);
  const solicitudId = Number(row.solicitud_id);
  const orden = Number(row.orden);
  const texto = `${resp.error ?? ''} ${resp.respuestaCruda ?? ''}`;
  let inyectoAlgo = false;

  if (tipo === 'anular_cumplido_remesa' || tipo === 'anular_remesa') {
    if (!texto.toLowerCase().includes('cumplido inicial')) return false;
    const remesaId = Number(row.referencia_id);
    const rem = await fila(db(), 'SELECT anulacion_motivo, anulacion_observaciones FROM remesa WHERE id = ?', [remesaId]);
    if (rem === null) return false;
    const motivo = rem.anulacion_motivo === 'D' ? 'D' : 'O';
    const obs = String(rem.anulacion_observaciones ?? '');
    inyectoAlgo = await inyectarCumplidoInicialRemesa(solicitudId, manifiestoId, remesaId, orden, motivo, obs);
  } else if (tipo === 'anular_manifiesto') {
    if (!texto.includes('ANM070')) return false;
    const manif = await fila(db(), 'SELECT anulacion_motivo, anulacion_observaciones FROM manifiesto WHERE id = ?', [manifiestoId]);
    if (manif === null) return false;
    const motivo = manif.anulacion_motivo === 'D' ? 'D' : 'O';
    const obs = String(manif.anulacion_observaciones ?? '');
    const [remesaRows] = await db().query<RowDataPacket[]>(
      `SELECT r.id FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id WHERE mr.manifiesto_id = ?`,
      [manifiestoId],
    );
    for (const rem of remesaRows as Row[]) {
      const inyectado = await inyectarCumplidoInicialRemesa(solicitudId, manifiestoId, Number(rem.id), orden, motivo, obs);
      inyectoAlgo = inyectoAlgo || inyectado;
    }
  } else {
    return false;
  }

  // Nada nuevo que inyectar (ya se había hecho antes para todo lo que aplica):
  // deja que el flujo normal de error/reintento maneje un rechazo persistente.
  if (!inyectoAlgo) return false;

  // Re-encola el paso que falló SIN gastarle intento.
  await db().query(
    "UPDATE cola_envios SET estado = 'pendiente', ultimo_error = ?, respuesta_rndc = ?, programado_para = NULL WHERE id = ?",
    [resp.error, resp.respuestaCruda, Number(row.id)],
  );
  // eslint-disable-next-line no-console
  console.warn(
    `[anulacion] Inyectado(s) paso 54 (cumplido inicial) por ${tipo} #${row.id}. Error RNDC crudo: ${resp.error ?? resp.respuestaCruda}`,
  );
  return true;
}

/**
 * Remediación reactiva: el RNDC rechaza anular_cumplido_remesa / anular_cumplido_manifiesto
 * con ACR070/ACM070 ("...no ha sido Cumplido") cuando el documento en realidad
 * NUNCA fue cumplido allá — nuestro estado local ('aceptado') estaba
 * desactualizado o era incorrecto. En ese caso no hay nada que anular: se
 * trata como resuelto (no bloquea la cascada hacia anular manifiesto/remesa)
 * y se corrige el estado local a 'pendiente', igual que si la anulación
 * hubiera tenido éxito — así el manifiesto/remesa quedan libres para
 * anularse aunque su cumplido nunca haya sido real.
 */
async function remediarNoCumplido(row: Row, resp: RndcRespuesta): Promise<boolean> {
  const tipo = row.tipo_documento;
  if (tipo !== 'anular_cumplido_remesa' && tipo !== 'anular_cumplido_manifiesto') return false;
  const texto = `${resp.error ?? ''} ${resp.respuestaCruda ?? ''}`;
  const codigo = tipo === 'anular_cumplido_remesa' ? 'ACR070' : 'ACM070';
  if (!texto.includes(codigo)) return false;

  const id = Number(row.id);
  await db().query(
    `UPDATE cola_envios
     SET estado = 'enviado', rndc_ingreso_id = NULL, respuesta_rndc = ?, ultimo_error = NULL,
         intentos = intentos + 1, enviado_at = NOW()
     WHERE id = ?`,
    [resp.respuestaCruda, id],
  );
  // marcarOrigen() no usa resp.ingresoId para estas dos ramas — solo vuelve el
  // cumplido a 'pendiente', que es exactamente el efecto que buscamos aquí.
  await marcarOrigen(row, resp);
  // eslint-disable-next-line no-console
  console.warn(
    `[anulacion] ${tipo} #${id} (${codigo}): el RNDC dice que nunca fue cumplido. Se omite y se libera la cascada.`,
  );
  return true;
}

/**
 * Remediación reactiva: el RNDC rechaza por observaciones muy cortas (ACI052
 * en el proceso 54: "mínimo 20 caracteres"; se aplica el mismo heurístico de
 * texto a los demás procesos de anulación por si exigen algo similar sin
 * código documentado). tagObservaciones() ya rellena con '*' toda anulación
 * NUEVA — esto solo repara una fila que quedó encolada ANTES de ese fix, con
 * el payload_xml ya grabado sin relleno: lo regenera y reintenta sin gastar
 * el intento.
 */
async function remediarObservacionesCortas(row: Row, resp: RndcRespuesta): Promise<boolean> {
  const tipo = String(row.tipo_documento);
  if (!tipo.startsWith('anular_')) return false;
  const texto = `${resp.error ?? ''} ${resp.respuestaCruda ?? ''}`.toLowerCase();
  const esObservacionesCorta =
    texto.includes('observaciones') && (texto.includes('corto') || texto.includes('mínimo') || texto.includes('minimo'));
  if (!esObservacionesCorta) return false;

  const payloadActual = String(row.payload_xml);
  const match = payloadActual.match(/<OBSERVACIONES>([\s\S]*?)<\/OBSERVACIONES>/);
  const obsActual = match ? match[1]! : '';
  if (obsActual.length >= OBSERVACIONES_MIN) return false; // ya cumple: no es esto, deja que cuente como fallo real

  const relleno = '*'.repeat(OBSERVACIONES_MIN - obsActual.length);
  const payloadNuevo = payloadActual.replace(
    /<OBSERVACIONES>[\s\S]*?<\/OBSERVACIONES>/,
    `<OBSERVACIONES>${obsActual}${relleno}</OBSERVACIONES>`,
  );
  await db().query(
    "UPDATE cola_envios SET payload_xml = ?, estado = 'pendiente', ultimo_error = ?, respuesta_rndc = ?, programado_para = NULL WHERE id = ?",
    [payloadNuevo, resp.error, resp.respuestaCruda, Number(row.id)],
  );
  // eslint-disable-next-line no-console
  console.warn(`[anulacion] ${tipo} #${row.id}: observaciones muy cortas, se regeneró el payload con relleno.`);
  return true;
}

/**
 * Inserta (si no existe ya) el paso "anular cumplido de manifiesto" (29) para
 * un manifiesto puntual, con orden justo por debajo de `ordenDebajoDe`.
 * Hereda motivo/observaciones de `manifiesto.anulacion_*` (siempre presentes:
 * se graban al encolar cualquier anulación del manifiesto). No pregunta nada.
 */
async function inyectarAnularCumplidoManifiesto(
  solicitudId: number,
  manifiestoId: number,
  ordenDebajoDe: number,
): Promise<boolean> {
  const ya = await fila(
    db(),
    `SELECT id FROM cola_envios WHERE manifiesto_id = ? AND tipo_documento = 'anular_cumplido_manifiesto' AND referencia_id = ?`,
    [manifiestoId, manifiestoId],
  );
  if (ya !== null) return false;

  const manif = await fila(
    db(),
    'SELECT num_manifiesto, cumplido_estado_rndc, anulacion_motivo, anulacion_observaciones FROM manifiesto WHERE id = ?',
    [manifiestoId],
  );
  if (manif === null || manif.cumplido_estado_rndc !== 'aceptado') return false;

  const nit = (await obtenerEmpresa()).nit;
  const motivo = manif.anulacion_motivo === 'D' ? 'D' : 'O';
  const obs = String(manif.anulacion_observaciones ?? '');
  const payload = payloadAnularCumplidoManifiesto(nit, manif.num_manifiesto, motivo, obs);
  await insertarCola(db(), solicitudId, manifiestoId, 'anular_cumplido_manifiesto', manifiestoId, payload, ordenDebajoDe - 1);
  return true;
}

/**
 * Inserta (si no existe ya) el paso "anular cumplido de remesa" (28) para una
 * remesa puntual, con orden justo por debajo de `ordenDebajoDe`. Hereda
 * motivo/observaciones de `remesa.anulacion_*`; si la remesa no los tiene
 * (p.ej. se anuló solo el manifiesto desde Cola, sin tocar sus remesas), cae
 * al motivo/observaciones del manifiesto. No pregunta nada.
 */
async function inyectarAnularCumplidoRemesa(
  solicitudId: number,
  manifiestoId: number,
  remesaId: number,
  ordenDebajoDe: number,
): Promise<boolean> {
  const ya = await fila(
    db(),
    `SELECT id FROM cola_envios WHERE manifiesto_id = ? AND tipo_documento = 'anular_cumplido_remesa' AND referencia_id = ?`,
    [manifiestoId, remesaId],
  );
  if (ya !== null) return false;

  const rem = await fila(
    db(),
    'SELECT num_remesa, cumplido_estado_rndc, anulacion_motivo, anulacion_observaciones FROM remesa WHERE id = ?',
    [remesaId],
  );
  if (rem === null || rem.cumplido_estado_rndc !== 'aceptado') return false;

  let motivoCod = rem.anulacion_motivo;
  let obsTexto = rem.anulacion_observaciones;
  if (motivoCod === null || motivoCod === undefined) {
    const manif = await fila(db(), 'SELECT anulacion_motivo, anulacion_observaciones FROM manifiesto WHERE id = ?', [manifiestoId]);
    motivoCod = manif?.anulacion_motivo ?? null;
    obsTexto = manif?.anulacion_observaciones ?? obsTexto;
  }

  const nit = (await obtenerEmpresa()).nit;
  const motivo = motivoCod === 'D' ? 'D' : 'O';
  const obs = String(obsTexto ?? '');
  const payload = payloadAnularCumplidoRemesa(nit, rem.num_remesa, motivo, obs);
  await insertarCola(db(), solicitudId, manifiestoId, 'anular_cumplido_remesa', remesaId, payload, ordenDebajoDe - 1);
  return true;
}

/**
 * Remediación reactiva: el RNDC rechaza anular_manifiesto con ANM030 ("...ya
 * fue cumplido o alguna de sus remesas ya fue cumplida") o anular_remesa con
 * ANR016 ("La Remesa se encuentra Cumplida") cuando el cumplido normal (no el
 * inicial) sigue activo — típicamente porque el usuario CANCELÓ el paso de
 * anular ese cumplido antes de que se enviara (Cola permite cancelar
 * cualquier fila que aún no se envió). En vez de bloquear esa cancelación,
 * se deja que el RNDC la rechace y aquí se re-crea el paso que falta
 * (heredando motivo/observaciones ya guardados) y se reintenta solo — el
 * despacho vuelve exactamente al mismo punto que si nunca se hubiera
 * cancelado nada.
 */
async function remediarCumplidoPendienteAntesDeAnular(row: Row, resp: RndcRespuesta): Promise<boolean> {
  const tipo = row.tipo_documento;
  const solicitudId = Number(row.solicitud_id);
  const manifiestoId = Number(row.manifiesto_id);
  const orden = Number(row.orden);
  const texto = `${resp.error ?? ''} ${resp.respuestaCruda ?? ''}`;
  let inyecto = false;

  if (tipo === 'anular_manifiesto' && texto.includes('ANM030')) {
    inyecto = await inyectarAnularCumplidoManifiesto(solicitudId, manifiestoId, orden);
    const [remesaRows] = await db().query<RowDataPacket[]>(
      `SELECT r.id FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id WHERE mr.manifiesto_id = ?`,
      [manifiestoId],
    );
    for (const rem of remesaRows as Row[]) {
      const inyectadoRem = await inyectarAnularCumplidoRemesa(solicitudId, manifiestoId, Number(rem.id), orden);
      inyecto = inyecto || inyectadoRem;
    }
  } else if (tipo === 'anular_remesa' && texto.includes('ANR016')) {
    inyecto = await inyectarAnularCumplidoRemesa(solicitudId, manifiestoId, Number(row.referencia_id), orden);
  } else {
    return false;
  }

  // Nada que inyectar (ya existía o el cumplido ya no está 'aceptado'): deja
  // que el flujo normal de error/reintento maneje un rechazo persistente.
  if (!inyecto) return false;

  await db().query(
    "UPDATE cola_envios SET estado = 'pendiente', ultimo_error = ?, respuesta_rndc = ?, programado_para = NULL WHERE id = ?",
    [resp.error, resp.respuestaCruda, Number(row.id)],
  );
  // eslint-disable-next-line no-console
  console.warn(`[anulacion] ${tipo} #${row.id}: se re-creó el/los paso(s) de anular cumplido (cancelados antes) y se libera la cascada.`);
  return true;
}

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
  // Antes de contar la falla: ¿el RNDC pide anular primero el cumplido inicial?
  if (await remediarCumplidoInicial(row, resp)) return;
  // ¿O dice que el documento nunca fue cumplido, así que no hay nada que anular?
  if (await remediarNoCumplido(row, resp)) return;
  // ¿O rechaza por observaciones muy cortas (payload viejo, de antes del relleno)?
  if (await remediarObservacionesCortas(row, resp)) return;
  // ¿O rechaza porque el cumplido normal sigue activo (se canceló ese paso antes)?
  if (await remediarCumplidoPendienteAntesDeAnular(row, resp)) return;
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
  // Los maestros (tercero/vehículo) se envían por su repo, no llevan XML propio;
  // todo lo demás (remesa/manifiesto/cumplido/anulación) sí — refleja el envío real.
  return ['tercero', 'vehiculo'].includes(row.tipo_documento)
    ? `(envío del maestro ${row.tipo_documento} #${row.referencia_id})`
    : rndc.previewXmlInterno(Number(row.proceso_rndc), String(row.payload_xml));
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
/** tipo_documento que forman el "lote de despacho": se crean y cancelan juntos. */
const LOTE_DESPACHO = ['tercero', 'vehiculo', 'remesa', 'manifiesto'];

/**
 * Cancela un envío que TODAVÍA NO se mandó al RNDC (estado 'pendiente' o
 * 'error') — a diferencia de anular, que revierte algo que el RNDC ya aceptó,
 * cancelar solo limpia la cola local: nada salió nunca, así que no hay nada
 * que reportarle al Ministerio.
 *
 * - tercero/vehiculo/remesa/manifiesto: son un lote atómico (dependenciaPendiente
 *   exige que los de orden menor ya estén 'enviado' antes de mandar los de
 *   orden mayor). Cancelar solo uno rompería esa cadena — p.ej. borrar la fila
 *   de remesa pero dejar la de manifiesto pendiente le permitiría "saltarse" la
 *   dependencia y mandar el manifiesto sin su remesa. Por eso cancelar
 *   cualquiera de estos cuatro cancela TODO el lote pendiente/error de ese
 *   manifiesto, y deja remesa/manifiesto en 'pendiente' — editable y
 *   reenviable de nuevo (no hay ningún radicado del RNDC que proteger).
 * - cumplido_remesa/cumplido_manifiesto: se cancela solo esa fila; su
 *   cumplido_estado_rndc ya está en 'pendiente' (nunca llegó a 'aceptado'
 *   mientras la fila siga sin enviar), no hay nada más que revertir.
 * - anular_*: se cancela solo esa fila (sin cascada). Si eso deja la cascada
 *   incompleta (p.ej. se cancela "anular cumplido de manifiesto" pero sigue
 *   pendiente "anular manifiesto"), el propio RNDC lo va a rechazar con un
 *   código conocido (ANM030/ANR016/ANM070/ACR070...) — y la remediación
 *   reactiva de aplicarResultado() re-crea automáticamente el paso que falta
 *   y reintenta sola, sin pedirle nada al usuario. No hace falta bloquear la
 *   cancelación de antemano: el sistema se autorepara cuando de verdad hace falta.
 *   Además, si tras cancelar ya no queda NADA activo de la anulación (ver
 *   revertirAnulacionSiNoQuedaNadaActivo), el despacho vuelve a 'aceptado'
 *   -botón "Anular" disponible de nuevo- sin necesidad de cancelar todo el lote.
 *   EXCEPCIÓN — punto sin retorno: si el MANIFIESTO ya fue anulado por el
 *   RNDC (proc 32 'enviado'), el despacho ya desapareció de Despachos, así
 *   que no se permite cancelar los pasos de anulación de sus remesas
 *   (9/28/54) — quedarían colgadas sin una forma clara de retomar el trámite.
 *   En ese caso hay que dejar que terminen o reintentarlos desde Cola.
 */

const TIPOS_ANULACION_MANIFIESTO = ['anular_cumplido_manifiesto', 'anular_manifiesto'];
const TIPOS_ANULACION_REMESA = ['anular_cumplido_remesa', 'anular_cumplido_inicial_remesa', 'anular_remesa'];

/**
 * Tras cancelar un paso de anulación, revisa si al manifiesto (y a cada una
 * de sus remesas) ya no le queda NADA activo de su intento de anulación
 * (pendiente/error/enviando) — sin importar si algún paso anterior ya llegó a
 * 'enviado' — y, de ser así, revierte estado_rndc de 'anulacion_pendiente' a
 * 'aceptado': el despacho vuelve a ser uno normal, con "Anular" disponible de
 * nuevo. No hace falta cancelar TODOS los pasos a la vez — basta con que, tras
 * esta cancelación puntual, no quede ninguno más en curso. Si se vuelve a
 * pedir "Anular", calcularPasosAnulacion() recalcula desde el estado actual y
 * solo crea los pasos que de verdad faltan (los que ya tuvieron éxito quedan
 * reflejados en cumplido_estado_rndc/estado_rndc y no se repiten en Cola).
 */
async function revertirAnulacionSiNoQuedaNadaActivo(conn: Queryable, manifiestoId: number): Promise<void> {
  const quedaAlgoActivo = async (referenciaId: number, tipos: string[]): Promise<boolean> => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM cola_envios WHERE manifiesto_id = ? AND referencia_id = ? AND tipo_documento IN (?)
         AND estado IN ('pendiente','error','enviando') LIMIT 1`,
      [manifiestoId, referenciaId, tipos],
    );
    return rows.length > 0;
  };

  const manif = await fila(conn, 'SELECT estado_rndc FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manif?.estado_rndc === 'anulacion_pendiente' && !(await quedaAlgoActivo(manifiestoId, TIPOS_ANULACION_MANIFIESTO))) {
    await conn.query(
      "UPDATE manifiesto SET estado_rndc = 'aceptado', anulacion_motivo = NULL, anulacion_observaciones = NULL, anulado_por = NULL WHERE id = ?",
      [manifiestoId],
    );
  }

  const [remesaRows] = await conn.query<RowDataPacket[]>(
    `SELECT r.id, r.estado_rndc FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id WHERE mr.manifiesto_id = ?`,
    [manifiestoId],
  );
  for (const rem of remesaRows as Row[]) {
    if (rem.estado_rndc !== 'anulacion_pendiente') continue;
    if (await quedaAlgoActivo(Number(rem.id), TIPOS_ANULACION_REMESA)) continue;
    await conn.query(
      "UPDATE remesa SET estado_rndc = 'aceptado', anulacion_motivo = NULL, anulacion_observaciones = NULL, anulado_por = NULL WHERE id = ?",
      [rem.id],
    );
  }
}

/** Pasos de anulación que son "de la remesa", no del manifiesto en sí. */
const TIPOS_ANULACION_DE_REMESA = ['anular_remesa', 'anular_cumplido_remesa', 'anular_cumplido_inicial_remesa'];

export async function cancelarItem(colaId: number): Promise<ItemResult> {
  const row = await fila(db(), 'SELECT * FROM cola_envios WHERE id = ?', [colaId]);
  if (!row) return { ok: false, mensaje: `Item #${colaId} no encontrado.` };
  if (!['pendiente', 'error'].includes(row.estado)) {
    return { ok: false, mensaje: `No se puede cancelar: ya está en estado "${row.estado}".` };
  }

  return withTransaction(async (conn) => {
    // Si el MANIFIESTO de este despacho ya fue anulado por el RNDC (proc 32
    // 'enviado'), el despacho ya desapareció de Despachos — es un punto sin
    // retorno. Cancelar un paso de anulación de sus remesas (9/28/54) las
    // dejaría "colgadas": ni anuladas ni con una forma clara de retomar el
    // trámite desde la pantalla de Despachos (el registro ya no existe ahí).
    // En ese caso no se permite cancelar: hay que dejar que termine o
    // reintentarlo desde Cola.
    if (TIPOS_ANULACION_DE_REMESA.includes(row.tipo_documento)) {
      const manifiestoAnulado = await fila(
        conn,
        `SELECT id FROM cola_envios WHERE manifiesto_id = ? AND referencia_id = ? AND tipo_documento = 'anular_manifiesto' AND estado = 'enviado' LIMIT 1`,
        [row.manifiesto_id, row.manifiesto_id],
      );
      if (manifiestoAnulado !== null) {
        return {
          ok: false,
          mensaje: 'El manifiesto de este despacho ya fue anulado por el RNDC. Sus remesas deben terminar de anularse también — reintenta el envío en vez de cancelarlo.',
        };
      }
    }

    if (LOTE_DESPACHO.includes(row.tipo_documento)) {
      const manifiestoId = Number(row.manifiesto_id);
      await conn.query(
        `DELETE FROM cola_envios WHERE manifiesto_id = ? AND tipo_documento IN ('tercero','vehiculo','remesa','manifiesto')
           AND estado IN ('pendiente','error')`,
        [manifiestoId],
      );
      // Nunca llegaron a 'aceptado' (si no, esta fila ya estaría 'enviado'),
      // así que vuelven a su valor por defecto — deja el despacho editable.
      await conn.query(
        `UPDATE remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id
         SET r.estado_rndc = 'pendiente' WHERE mr.manifiesto_id = ?`,
        [manifiestoId],
      );
      await conn.query("UPDATE manifiesto SET estado_rndc = 'pendiente' WHERE id = ?", [manifiestoId]);
      return { ok: true, mensaje: 'Despacho cancelado — puedes editarlo y volver a enviarlo.' };
    }

    await conn.query('DELETE FROM cola_envios WHERE id = ?', [colaId]);
    if (String(row.tipo_documento).startsWith('anular_')) {
      await revertirAnulacionSiNoQuedaNadaActivo(conn, Number(row.manifiesto_id));
    }
    return { ok: true, mensaje: 'Envío cancelado.' };
  });
}

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
  const manif = await fila(db(), 'SELECT estado_rndc FROM manifiesto WHERE id = ?', [manifiestoId]);
  if (manif?.estado_rndc === 'anulacion_pendiente' || manif?.estado_rndc === 'anulado') {
    // Progresar la anulación se hace desde Cola (por fila o "Procesar ahora"),
    // no desde este botón de despacho — evita reenviar por la vía equivocada.
    return { ok: false, mensaje: 'Este despacho está en proceso de anulación; procesa sus pasos desde Cola de envíos.' };
  }

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
    consecutivoRemesa: consecutivoRemesaRndc(r.num_remesa),
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
    horaCitaPactadaCargue: hora(r.hora_cita_cargue),
    horasPactoDescargue: r.horas_pacto_descargue,
    minutosPactoDescargue: r.minutos_pacto_descargue ?? '0',
    fechaCitaPactadaDescargue: fecha(r.fecha_cita_descargue),
    horaCitaPactadaDescargueRemesa: hora(r.hora_cita_descargue),
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
    MANNROPOLIZA: m.nro_poliza,
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
      RndcClient.escaparXml(consecutivoRemesaRndc(rem.num_remesa)) +
      '</CONSECUTIVOREMESA></REMESA>';
  }

  let xml = RndcClient.renderVariables(vars);
  xml += '<NITMONITOREOFLOTA>' + RndcClient.escaparXml(String(m.emf ?? '')) + '</NITMONITOREOFLOTA>';
  xml += '<RETENCIONFOPAT>' + RndcClient.escaparXml(String(num(m.fopat) ?? '')) + '</RETENCIONFOPAT>';
  xml += '<observaciones>' + RndcClient.escaparXml(String(m.observaciones ?? '')) + '</observaciones>';
  xml += '<ACEPTACIONELECTRONICA>SI</ACEPTACIONELECTRONICA>';
  return xml + '<REMESASMAN procesoid="43">' + remesasXml + '</REMESASMAN>';
}

/** Port of payloadCumplidoRemesa(). */
async function payloadCumplidoRemesa(r: Row): Promise<string> {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    NUMMANIFIESTOCARGA: r.num_manifiesto ?? '',
    CONSECUTIVOREMESA: consecutivoRemesaRndc(r.num_remesa),
    TIPOCUMPLIDOREMESA: r.cumplido_tipo ?? 'C',
    NOMUNIDADMEDIDACAPACIDAD: r.unidad_medida ?? '1',
    CANTIDADCARGADA: num(r.peso),
    CANTIDADENTREGADA: num(r.cantidad_entregada ?? r.peso),
  };
  let xml = RndcClient.renderVariables(vars);
  if (r.fecha_llegada_descargue) {
    xml += '<FECHALLEGADADESCARGUE>' + fecha(r.fecha_llegada_descargue) + '</FECHALLEGADADESCARGUE>';
    xml += '<HORALLEGADADESCARGUECUMPLIDO>' + hora(r.hora_llegada_descargue) + '</HORALLEGADADESCARGUECUMPLIDO>';
  }
  if (r.fecha_entrada_descargue) {
    xml += '<FECHAENTRADADESCARGUE>' + fecha(r.fecha_entrada_descargue) + '</FECHAENTRADADESCARGUE>';
    xml += '<HORAENTRADADESCARGUECUMPLIDO>' + hora(r.hora_entrada_descargue) + '</HORAENTRADADESCARGUECUMPLIDO>';
  }
  if (r.fecha_salida_descargue) {
    xml += '<FECHASALIDADESCARGUE>' + fecha(r.fecha_salida_descargue) + '</FECHASALIDADESCARGUE>';
    xml += '<HORASALIDADESCARGUECUMPLIDO>' + hora(r.hora_salida_descargue) + '</HORASALIDADESCARGUECUMPLIDO>';
  }
  if (r.fecha_llegada_cargue) {
    xml += '<FECHALLEGADACARGUE>' + fecha(r.fecha_llegada_cargue) + '</FECHALLEGADACARGUE>';
    xml += '<HORALLEGADACARGUEREMESA>' + hora(r.hora_llegada_cargue) + '</HORALLEGADACARGUEREMESA>';
  }
  if (r.fecha_entrada_cargue) {
    xml += '<FECHAENTRADACARGUE>' + fecha(r.fecha_entrada_cargue) + '</FECHAENTRADACARGUE>';
    xml += '<HORAENTRADACARGUEREMESA>' + hora(r.hora_entrada_cargue) + '</HORAENTRADACARGUEREMESA>';
  }
  if (r.fecha_salida_cargue) {
    xml += '<FECHASALIDACARGUE>' + fecha(r.fecha_salida_cargue) + '</FECHASALIDACARGUE>';
    xml += '<HORASALIDACARGUEREMESA>' + hora(r.hora_salida_cargue) + '</HORASALIDACARGUEREMESA>';
  }
  return xml;
}

/** Port of payloadCumplidoManifiesto(). */
async function payloadCumplidoManifiesto(m: Row): Promise<string> {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    NUMMANIFIESTOCARGA: m.num_manifiesto,
    TIPOCUMPLIDOMANIFIESTO: m.cumplido_tipo ?? 'C',
    // FOPAT (0.1% del valor a pagar) es obligatorio en el cumplido — CMA271/CMA273.
    // Reusa el valor calculado al expedir el manifiesto; se omite si no aplica (null).
    RETENCIONFOPAT: num(m.fopat),
    FECHAENTREGADOCUMENTOS: fecha(m.fecha_entrega_documentos),
  };
  let xml = RndcClient.renderVariables(vars);
  xml += '<VALORADICIONALHORASCARGUE>0</VALORADICIONALHORASCARGUE>';
  xml += '<VALORADICIONALFLETE>' + num(m.valor_adicional_flete ?? 0) + '</VALORADICIONALFLETE>';
  xml += '<VALORDESCUENTOFLETE>' + num(m.valor_descuento_flete ?? 0) + '</VALORDESCUENTOFLETE>';
  // Motivo del descuento: solo se reporta si hay un descuento distinto de cero.
  if (Number(m.valor_descuento_flete ?? 0) !== 0) {
    xml +=
      '<MOTIVOVALORDESCUENTOMANIFIESTO>' +
      RndcClient.escaparXml(String(m.motivo_descuento_manifiesto ?? 'F')) +
      '</MOTIVOVALORDESCUENTOMANIFIESTO>';
  }
  xml += '<OBSERVACIONES>' + RndcClient.escaparXml(String(m.observaciones_cumplido ?? '')) + '</OBSERVACIONES>';
  return xml;
}

// ---------- Anulación payloads (RNDC procesos 9 / 28 / 29 / 32 / 54) ----------
//
// Pure builders (NIT + motivo + observaciones as params) so they can be
// characterization-tested for exact XML without a DB. Motivo codes differ per
// proceso: cumplidos (28/29/54) usan D/O; manifiesto (32) D/S/R; remesa (9) D/S.
// OBSERVACIONES es opcional en el RNDC pero siempre se emite (aunque vacía) para
// calzar con los XML de referencia del Ministerio.

/**
 * Mínimo de caracteres que el RNDC exige en OBSERVACIONES de anulación
 * (confirmado en el proceso 54 — ACI052: "mínimo 20 caracteres"). Se aplica
 * igual a los demás procesos de anulación (9/28/29/32) como salvaguarda ante
 * el mismo tipo de rechazo, aunque su mínimo exacto no esté documentado.
 */
const OBSERVACIONES_MIN = 20;

/**
 * Always-present <OBSERVACIONES> tag (matches the RNDC reference XMLs).
 * Si el texto queda más corto que el mínimo que exige el RNDC, se completa
 * con '*' hasta alcanzarlo — evita el rechazo sin inventar contenido real
 * cuando el usuario dejó las observaciones vacías o breves.
 */
function tagObservaciones(obs: string): string {
  const texto = obs ?? '';
  const relleno = texto.length < OBSERVACIONES_MIN ? '*'.repeat(OBSERVACIONES_MIN - texto.length) : '';
  return '<OBSERVACIONES>' + RndcClient.escaparXml(texto + relleno) + '</OBSERVACIONES>';
}

/** procesoid 29 — Anular Cumplido de Manifiesto. */
export function payloadAnularCumplidoManifiesto(nit: string, numManifiesto: string, motivo: string, obs = ''): string {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: nit,
    NUMMANIFIESTOCARGA: numManifiesto,
    CODMOTIVOANULACIONCUMPLIDO: motivo, // D / O
  };
  return RndcClient.renderVariables(vars) + tagObservaciones(obs);
}

/** procesoid 28 — Anular Cumplido de Remesa. */
export function payloadAnularCumplidoRemesa(nit: string, numRemesa: unknown, motivo: string, obs = ''): string {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: nit,
    CONSECUTIVOREMESA: consecutivoRemesaRndc(numRemesa),
    CODMOTIVOANULACIONCUMPLIDO: motivo, // D / O
  };
  return RndcClient.renderVariables(vars) + tagObservaciones(obs);
}

/**
 * procesoid 54 — Anular Cumplido Inicial de Remesa. Se envía sólo de forma
 * reactiva: cuando el RNDC rechaza un anular_cumplido_remesa / anular_remesa
 * exigiendo que primero se anule el cumplido inicial (ver remediación, Fase 2).
 */
export function payloadAnularCumplidoInicialRemesa(
  nit: string,
  numRemesa: unknown,
  numManifiesto: string,
  motivo: string,
  obs = '',
): string {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: nit,
    CONSECUTIVOREMESA: consecutivoRemesaRndc(numRemesa),
    NUMMANIFIESTOCARGA: numManifiesto,
    CODMOTIVOANULACIONCUMPLIDO: motivo, // D / O
  };
  return RndcClient.renderVariables(vars) + tagObservaciones(obs);
}

/** procesoid 32 — Anular Manifiesto de Carga. */
export function payloadAnularManifiesto(nit: string, numManifiesto: string, motivo: string, obs = ''): string {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: nit,
    NUMMANIFIESTOCARGA: numManifiesto,
    MOTIVOANULACIONMANIFIESTO: motivo, // D / S / R
  };
  return RndcClient.renderVariables(vars) + tagObservaciones(obs);
}

/**
 * procesoid 9 — Anular Remesa Terrestre de Carga. MOTIVOREVERSAREMESA='A'
 * (anular; 'L' sería liberar para transbordo, que no usamos aquí).
 */
export function payloadAnularRemesa(nit: string, numRemesa: unknown, motivo: string, obs = ''): string {
  const vars: RndcVars = {
    NUMNITEMPRESATRANSPORTE: nit,
    CONSECUTIVOREMESA: consecutivoRemesaRndc(numRemesa),
    MOTIVOREVERSAREMESA: 'A',
    MOTIVOANULACIONREMESA: motivo, // D / S
  };
  return RndcClient.renderVariables(vars) + tagObservaciones(obs);
}

// ---------- Reads for the monitor ----------

const FILTROS: Record<string, string[]> = {
  despacho: ['remesa', 'manifiesto'],
  cumplido: ['cumplido_remesa', 'cumplido_manifiesto'],
  anulacion: [
    'anular_cumplido_manifiesto',
    'anular_cumplido_remesa',
    'anular_cumplido_inicial_remesa',
    'anular_manifiesto',
    'anular_remesa',
  ],
};

/** Lists the queue. Port of listar(). */
export async function listar(proceso = 'despacho', limite = 200): Promise<Row[]> {
  let where = "WHERE c.tipo_documento NOT IN ('tercero','vehiculo')";
  const filtro = FILTROS[proceso];
  if (filtro) where += ` AND c.tipo_documento IN (${filtro.map((t) => `'${t}'`).join(',')})`;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT c.*, s.consecutivo,
       -- Estado actual del documento origen (no de la fila de cola), para que el
       -- frontend sepa si todavía tiene sentido ofrecer "Anular" en esta fila:
       -- ya anulado/anulándose no debería mostrar el botón otra vez.
       CASE c.tipo_documento
         WHEN 'remesa' THEN r_o.estado_rndc
         WHEN 'cumplido_remesa' THEN r_o.cumplido_estado_rndc
         WHEN 'manifiesto' THEN m_o.estado_rndc
         WHEN 'cumplido_manifiesto' THEN m_o.cumplido_estado_rndc
         ELSE NULL
       END AS estado_origen
     FROM cola_envios c
     LEFT JOIN solicitud_servicio s ON s.id = c.solicitud_id
     LEFT JOIN remesa r_o ON r_o.id = c.referencia_id AND c.tipo_documento IN ('remesa','cumplido_remesa')
     LEFT JOIN manifiesto m_o ON m_o.id = c.referencia_id AND c.tipo_documento IN ('manifiesto','cumplido_manifiesto')
     ${where}
     ORDER BY c.id DESC LIMIT ${Number(limite)}`,
  );
  return rows as Row[];
}

/** Count by estado. Port of resumen(). */
export async function resumen(proceso = 'despacho'): Promise<Record<string, number>> {
  return cached(`badge:cola:${proceso}`, BADGE_TTL_MS, async () => {
    let where = "WHERE tipo_documento NOT IN ('tercero','vehiculo')";
    const filtro = FILTROS[proceso];
    if (filtro) where += ` AND tipo_documento IN (${filtro.map((t) => `'${t}'`).join(',')})`;
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT estado, COUNT(*) n FROM cola_envios ${where} GROUP BY estado`,
    );
    const out: Record<string, number> = {};
    for (const f of rows as Row[]) out[f.estado] = Number(f.n);
    return out;
  });
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
  // Un manifiesto totalmente anulado desaparece de Despachos — ya no es un
  // despacho activo; su remesa vuelve a estar disponible para uno nuevo
  // (ver el ajuste de cantidad_vehiculos en marcarOrigen()).
  let where = "WHERE (m.estado_rndc IS NULL OR m.estado_rndc <> 'anulado')";
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
                r.created_at, r.estado_rndc AS estado_remesa, m.estado_rndc AS estado_manifiesto,
                m.seguridadqr, m.seguridadqr_error`;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT ${cols} ${from} ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, porPagina, offset],
  );
  // Show the number the RNDC actually registers this remesa under, not the
  // internal "REM-00001" label — see consecutivoRemesaRndc().
  const items = (rows as Row[]).map((r) => ({ ...r, num_remesa: consecutivoRemesaRndc(r.num_remesa) }));
  return { items, total };
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
  // Weight budget: exclude this manifiesto's own remesas so editing them
  // doesn't count against itself.
  const pesoAsignado = await pesoAsignadoSolicitud(db(), Number(manifiesto.solicitud_id), manifiestoId);
  solicitud.peso_asignado = pesoAsignado;
  solicitud.peso_disponible = Number(solicitud.peso ?? 0) - pesoAsignado;

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
  'valor_anticipo', 'emf', 'observaciones',
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
    if (manifiesto.estado_rndc === 'anulacion_pendiente' || manifiesto.estado_rndc === 'anulado') {
      // El RNDC ya tiene (o está por confirmar) este consecutivo como anulado;
      // reeditarlo y reenviarlo reutilizaría ese mismo número — evitarlo por completo.
      return { ok: false, mensaje: 'Este despacho está en proceso de anulación; no se puede editar ni reenviar.' };
    }

    const remesasBody: Row[] = Array.isArray(datos.remesas) ? datos.remesas : [];

    // Weight budget: don't let an edit push this despacho's total weight past
    // what the solicitud has left available (its own current remesas are
    // excluded from "already assigned", since they're being replaced here).
    const solicitud = await fila(conn, 'SELECT peso FROM solicitud_servicio WHERE id = ?', [manifiesto.solicitud_id]);
    const pesoTotalSolicitud = Number(solicitud?.peso ?? 0);
    if (pesoTotalSolicitud > 0) {
      const pesoNuevo = pesoTotalDe(remesasBody);
      const asignadoOtros = await pesoAsignadoSolicitud(conn, Number(manifiesto.solicitud_id), manifiestoId);
      const disponible = pesoTotalSolicitud - asignadoOtros;
      if (pesoNuevo - disponible > 0.001) {
        return {
          ok: false,
          mensaje:
            `El peso de las remesas (${pesoNuevo.toLocaleString('es-CO')} kg) supera el peso disponible ` +
            `(${disponible.toLocaleString('es-CO')} kg) de esta solicitud.`,
        };
      }
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
  return cached('badge:despachos', BADGE_TTL_MS, async () => {
    const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) AS n FROM remesa WHERE estado_rndc <> 'aceptado'",
    );
    return Number(rows[0]?.n ?? 0);
  });
}

/** Count of manifiestos pending cumplido. Backs the "Cumplido" nav badge. */
export async function contarPendientesCumplido(): Promise<number> {
  return cached('badge:cumplido', BADGE_TTL_MS, async () => {
    const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
      // estado_rndc = 'aceptado': un manifiesto en anulacion_pendiente/anulado
      // no debe seguir apareciendo como pendiente por cumplir (su cumplido_estado_rndc
      // puede seguir en 'pendiente' por defecto si nunca se cumplió antes de anularse).
      "SELECT COUNT(*) AS n FROM manifiesto WHERE cumplido_estado_rndc = 'pendiente' AND estado_rndc = 'aceptado'",
    );
    return Number(rows[0]?.n ?? 0);
  });
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
     WHERE m.cumplido_estado_rndc = 'pendiente' AND m.estado_rndc = 'aceptado'
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
