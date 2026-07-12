/**
 * Light TMS - Terceros data access (RNDC proceso 11). Port of TerceroRepo.php.
 */

import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../db/pool.js';
import { RndcClient } from '../../rndc/RndcClient.js';
import { RndcRespuesta } from '../../rndc/RndcRespuesta.js';
import type { Tercero, TerceroListRow, Paginated } from '../../db/types.js';
import { obtener as obtenerEmpresa } from '../empresa/empresa.repo.js';
import { cached } from '../../util/cache.js';

/** Whitelisted columns accepted from the form (mirrors TerceroRepo::CAMPOS). */
const CAMPOS = [
  'tipo_id', 'num_id', 'nombre', 'primer_apellido', 'segundo_apellido', 'regimen_simple',
  'direccion', 'cod_municipio', 'municipio_nombre', 'sede', 'nombre_sede',
  'telefono', 'celular', 'email', 'latitud', 'longitud',
  'es_conductor', 'categoria_licencia', 'num_licencia', 'fecha_venc_licencia',
] as const;

export type TerceroInput = Record<string, unknown>;
/** Values accepted by mysql2 named placeholders. */
type SqlValue = string | number | null;

/**
 * Full display name: razón social / nombres + apellidos (empty apellidos are
 * dropped so companies show just their nombre, without trailing spaces). Mirrors
 * the nomTerc() helper used in the PDFs.
 */
const NOMBRE_COMPLETO_SQL =
  "TRIM(CONCAT_WS(' ', nombre, NULLIF(primer_apellido, ''), NULLIF(segundo_apellido, '')))";

/** Normalises form input: whitelist + ''→null + es_conductor 0/1. */
function buildRow(datos: TerceroInput): Record<string, SqlValue> {
  const fila: Record<string, SqlValue> = {};
  for (const c of CAMPOS) {
    const valor = datos[c];
    fila[c] = valor === '' || valor === undefined || valor === null ? null : String(valor);
  }
  fila.es_conductor = datos.es_conductor ? 1 : 0;
  return fila;
}

/** Inserts a tercero, returns the new id. Port of crear(). */
export async function crear(datos: TerceroInput): Promise<number> {
  const fila = buildRow(datos);
  const cols = Object.keys(fila);
  const placeholders = cols.map((c) => `:${c}`).join(', ');
  const [res] = await db().query<ResultSetHeader>(
    `INSERT INTO tercero (${cols.join(', ')}) VALUES (${placeholders})`,
    fila,
  );
  return res.insertId;
}

/** Updates a tercero; resets estado_rndc to 'borrador' so it re-sends. Port of actualizar(). */
export async function actualizar(id: number, datos: TerceroInput): Promise<void> {
  const fila = buildRow(datos);
  fila.estado_rndc = 'borrador';
  fila.rndc_error = null;
  const sets = Object.keys(fila).map((c) => `${c} = :${c}`).join(', ');
  await db().query(`UPDATE tercero SET ${sets} WHERE id = :id`, { ...fila, id });
}

export interface TerceroBuscarRow {
  id: number;
  tipo_id: string;
  num_id: string;
  nombre: string;
  municipio_nombre: string | null;
  cod_municipio: string;
  label: string;
}

/**
 * Builds a SQL LIKE pattern from a user search term. Accepts SQL's own `%`
 * (any run of characters) and `_` (single character) wildcards as-is, and
 * also `*` as a friendlier alias for `%` since that's what most users expect
 * from file/shell search. Always wraps with `%...%` so a plain term (no
 * wildcards) still matches anywhere in the field.
 */
function likePattern(term: string): string {
  return `%${term.replace(/\*/g, '%')}%`;
}

/** Autocomplete search. Port of buscar(). Matches name, last names, or ID. */
export async function buscar(q: string, soloConductor = false, limite = 15): Promise<TerceroBuscarRow[]> {
  const term = q.trim();
  if (term === '') return [];
  const like = likePattern(term);
  let sql =
    `SELECT id, tipo_id, num_id, ${NOMBRE_COMPLETO_SQL} AS nombre, municipio_nombre, cod_municipio FROM tercero WHERE (${NOMBRE_COMPLETO_SQL} LIKE :like OR num_id LIKE :like)`;
  if (soloConductor) sql += ' AND es_conductor = 1';
  sql += ` ORDER BY nombre LIMIT ${Number(limite)}`;
  const [rows] = await db().query<(TerceroBuscarRow & RowDataPacket)[]>(sql, { like });
  return rows.map((f) => ({ ...f, label: `${f.nombre} (${f.tipo_id} ${f.num_id})` }));
}

/** Finds a tercero by tipo_id + num_id. Port of obtenerPorTipoNum(). */
export async function obtenerPorTipoNum(tipo: string, num: string): Promise<Tercero | null> {
  const [rows] = await db().query<(Tercero & RowDataPacket)[]>(
    'SELECT * FROM tercero WHERE tipo_id = :tipo AND num_id = :num',
    { tipo, num },
  );
  return rows[0] ?? null;
}

/** Paginated list with search. Port of listarConPaginacion(). */
export async function listarConPaginacion(q = '', pagina = 1, porPagina = 10): Promise<Paginated<TerceroListRow>> {
  let where = '1=1';
  const params: Record<string, SqlValue> = {};
  if (q !== '') {
    params.like = likePattern(q);
    where += ` AND (${NOMBRE_COMPLETO_SQL} LIKE :like OR num_id LIKE :like OR CONCAT_WS(' ', tipo_id, num_id) LIKE :like)`;
  }
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM tercero WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const offset = Math.max(0, (pagina - 1) * porPagina);
  const [rows] = await db().query<(TerceroListRow & RowDataPacket)[]>(
    `SELECT id, tipo_id, num_id, ${NOMBRE_COMPLETO_SQL} AS nombre, municipio_nombre, es_conductor, estado_rndc, rndc_ingreso_id
     FROM tercero WHERE ${where} ORDER BY id DESC LIMIT ${Number(porPagina)} OFFSET ${Number(offset)}`,
    params,
  );
  return { items: rows, total };
}

/** Count of terceros not yet registered in the RNDC. Backs the "Terceros" nav badge. */
export async function contarPendientes(): Promise<number> {
  return cached('badge:terceros', 15_000, async () => {
    const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) AS n FROM tercero WHERE estado_rndc <> 'registrado'",
    );
    return Number(rows[0]?.n ?? 0);
  });
}

/** Fetches a full tercero by id. Port of obtener(). */
export async function obtener(id: number): Promise<Tercero | null> {
  const [rows] = await db().query<(Tercero & RowDataPacket)[]>('SELECT * FROM tercero WHERE id = :id', { id });
  return rows[0] ?? null;
}

/**
 * Registers the tercero in the RNDC (proceso 11) and stores the result.
 * Port of registrarEnRndc().
 */
export async function registrarEnRndc(id: number): Promise<RndcRespuesta> {
  const t = await obtener(id);
  if (t === null) {
    return RndcRespuesta.fallo('Tercero no encontrado.', 0, '');
  }

  const rndc = await RndcClient.desdeConfig();
  const vars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    CODTIPOIDTERCERO: t.tipo_id,
    NUMIDTERCERO: t.num_id,
    NOMIDTERCERO: t.nombre,
    PRIMERAPELLIDOIDTERCERO: t.primer_apellido,
    SEGUNDOAPELLIDOIDTERCERO: t.segundo_apellido,
    REGIMENSIMPLE: t.regimen_simple,
    NOMENCLATURADIRECCION: t.direccion,
    CODMUNICIPIORNDC: t.cod_municipio,
    CODSEDETERCERO: t.sede,
    NOMSEDETERCERO: t.nombre_sede,
    NUMTELEFONOCONTACTO: t.telefono,
    NUMCELULARPERSONA: t.celular,
    LATITUD: t.latitud,
    LONGITUD: t.longitud,
  };

  const resp = await rndc.ingresar(11, vars);

  await db().query('UPDATE tercero SET estado_rndc = :estado, rndc_ingreso_id = :ing, rndc_error = :err WHERE id = :id', {
    estado: resp.ok ? 'registrado' : 'error',
    ing: resp.ingresoId,
    err: resp.ok ? null : resp.error,
    id,
  });

  return resp;
}
