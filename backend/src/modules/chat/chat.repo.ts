/**
 * Light TMS - Chatbot data access (read-only, LLM-driven).
 *
 * The chatbot lets a staff user ask questions in natural language ("¿cuántos
 * manifiestos he creado?", "¿qué falta por cumplir?"). The LLM writes a SELECT,
 * we validate + execute it against the read-only pool, and feed the rows back.
 *
 * SECURITY — layered:
 *   1. Read-only DB user (config().dbReadonly). Grant it SELECT only, and only on
 *      the non-sensitive tables below. This is the real boundary — a generated
 *      DELETE/UPDATE simply can't run. Recommended setup (run once as admin):
 *        CREATE USER 'tms_ro'@'localhost' IDENTIFIED BY '...';
 *        GRANT SELECT ON light_tms.solicitud_servicio TO 'tms_ro'@'localhost';
 *        GRANT SELECT ON light_tms.manifiesto          TO 'tms_ro'@'localhost';
 *        ... (repeat for the tables in ESQUEMA; do NOT grant staff_users)
 *   2. SELECT-only guard (validarSelect): rejects anything but a single SELECT/WITH.
 *   3. multipleStatements:false on the pool: blocks `;`-stacked statements.
 *   4. Row cap + per-query timeout: bounds data volume and runtime.
 *
 * staff_users (password hashes) and maestro_empresa's rndc_username/rndc_password
 * are intentionally excluded from ESQUEMA and must not be granted to the RO user.
 */

import type { RowDataPacket } from 'mysql2';
import { dbReadonly } from '../../db/pool.js';
import { config } from '../../config/env.js';

/**
 * Schema map handed to the LLM so it writes correct SQL. Only non-sensitive
 * tables/columns. Keep in sync with the DB when columns change.
 */
export const ESQUEMA = `Tablas disponibles (solo lectura). Usa exactamente estos nombres:

solicitud_servicio(id, consecutivo, estado, cantidad_vehiculos, created_at)
  -- estado: 'borrador' | 'confirmada' | 'despachada' | 'anulada'
manifiesto(id, solicitud_id, num_manifiesto, placa_vehiculo, estado_rndc, cumplido_estado_rndc, valor_flete_pactado, fecha_expedicion, created_at)
  -- estado_rndc: 'pendiente' | 'enviado' | 'aceptado' | 'rechazado'
  -- cumplido_estado_rndc: 'pendiente' | 'aceptado'
remesa(id, solicitud_id, num_remesa, descripcion_producto, cantidad_cargada, unidad_medida, estado_rndc, created_at)
manifiesto_remesa(manifiesto_id, remesa_id)  -- une manifiestos con sus remesas
tercero(id, tipo_id, num_id, nombre, municipio_nombre, es_conductor, estado_rndc)
  -- estado_rndc: 'borrador' | 'pendiente' | 'registrado' | 'error'
vehiculo(id, placa, cod_configuracion, remolque_placa, estado_rndc)
cola_envios(id, solicitud_id, manifiesto_id, tipo_documento, estado, intentos, created_at)
  -- tipo_documento: 'tercero' | 'vehiculo' | 'remesa' | 'manifiesto' | 'cumplido_remesa' | 'cumplido_manifiesto'
  -- estado: 'pendiente' | 'enviando' | 'enviado' | 'error'
producto(id, codigo, nombre, tipo, peligrosa)
municipio(codigo_rndc, departamento, nombre, nombre_completo)

Notas:
- Fechas en formato 'YYYY-MM-DD HH:MM:SS'. Usa CURDATE(), DATE(created_at), etc.
- Para "despachos pendientes de cumplido": manifiesto WHERE cumplido_estado_rndc='pendiente'.
- Para "cola con errores": cola_envios WHERE estado='error'.
- Devuelve siempre agregados o pocas columnas; evita SELECT *.`;

/** Palabras que jamás deben aparecer en una consulta del chatbot (defensa en profundidad). */
const PROHIBIDAS =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|set|call|lock|rename|load|into\s+outfile|information_schema|mysql\.)\b/i;

/**
 * Identificadores sensibles bloqueados aunque el usuario de BD tuviera acceso
 * (por si el chatbot se habilita antes de crear el usuario de solo-lectura).
 * staff_users guarda hashes de contraseña; las columnas rndc_* guardan las
 * credenciales del RNDC en texto plano.
 */
const SENSIBLES = /\b(staff_users|password_hash|rndc_username|rndc_password)\b/i;

export interface SqlValidacion {
  ok: boolean;
  sql?: string;
  error?: string;
}

/** Valida que sea UNA sola sentencia SELECT/WITH de solo lectura. */
export function validarSelect(entrada: unknown): SqlValidacion {
  if (typeof entrada !== 'string') return { ok: false, error: 'La consulta debe ser texto.' };
  let sql = entrada.trim().replace(/;+\s*$/, ''); // quita ; final(es)
  if (sql === '') return { ok: false, error: 'Consulta vacía.' };
  if (sql.includes(';')) return { ok: false, error: 'Solo se permite una sentencia.' };
  if (!/^(select|with)\b/i.test(sql)) return { ok: false, error: 'Solo se permiten consultas SELECT.' };
  if (PROHIBIDAS.test(sql)) return { ok: false, error: 'La consulta contiene operaciones no permitidas.' };
  if (SENSIBLES.test(sql)) return { ok: false, error: 'No se puede consultar información sensible.' };
  return { ok: true, sql };
}

export interface ResultadoConsulta {
  columnas: string[];
  filas: Record<string, unknown>[];
  truncado: boolean;
}

/**
 * Ejecuta una consulta ya validada contra el pool de solo-lectura, con tope de
 * filas y timeout. Devuelve columnas + filas para que el LLM las interprete.
 */
export async function ejecutarSelect(sql: string): Promise<ResultadoConsulta> {
  const cap = config().chat.maxFilas;
  // Añade LIMIT si no hay uno propio; si lo hay, truncamos en JS igualmente.
  const conLimite = /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${cap}`;
  const [rows] = await dbReadonly().query<RowDataPacket[]>({ sql: conLimite, timeout: 8000 });
  const filas = (rows as Record<string, unknown>[]) ?? [];
  const truncado = filas.length > cap;
  const recortadas = truncado ? filas.slice(0, cap) : filas;
  const columnas = recortadas.length > 0 ? Object.keys(recortadas[0]!) : [];
  return { columnas, filas: recortadas, truncado };
}
