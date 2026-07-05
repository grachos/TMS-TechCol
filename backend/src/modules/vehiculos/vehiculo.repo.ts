/**
 * Light TMS - Vehículos data access (RNDC proceso 12). Port of VehiculoRepo.php.
 * Optional fields (marca, propietario) are inherited by the RNDC from the RUNT
 * via the plate, so they may be omitted.
 */

import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../db/pool.js';
import { RndcClient } from '../../rndc/RndcClient.js';
import { RndcRespuesta } from '../../rndc/RndcRespuesta.js';
import type { Vehiculo, VehiculoListRow, Paginated } from '../../db/types.js';
import { obtener as obtenerEmpresa } from '../empresa/empresa.repo.js';

const CAMPOS = [
  'placa', 'cod_configuracion', 'marca', 'peso_vacio', 'peso_vacio_remolque', 'remolque_placa',
  'propietario_tipo_id', 'propietario_num_id', 'tenedor_tipo_id', 'tenedor_num_id',
  'conductor_tipo_id', 'conductor_num_id',
  'soat_compania', 'soat_poliza', 'soat_vencimiento',
] as const;

export type VehiculoInput = Record<string, unknown>;
type SqlValue = string | number | null;

/** Whitelist + ''→null + uppercase plate. */
function buildRow(datos: VehiculoInput): Record<string, SqlValue> {
  const fila: Record<string, SqlValue> = {};
  for (const c of CAMPOS) {
    const valor = datos[c];
    fila[c] = valor === '' || valor === undefined || valor === null ? null : String(valor);
  }
  if (fila.placa) fila.placa = String(fila.placa).toUpperCase();
  return fila;
}

/** Inserts a vehículo, returns the new id. Port of crear(). */
export async function crear(datos: VehiculoInput): Promise<number> {
  const fila = buildRow(datos);
  const cols = Object.keys(fila);
  const [res] = await db().query<ResultSetHeader>(
    `INSERT INTO vehiculo (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`,
    fila,
  );
  return res.insertId;
}

/** Updates a vehículo; resets estado_rndc to 'borrador'. Port of actualizar(). */
export async function actualizar(id: number, datos: VehiculoInput): Promise<void> {
  const fila = buildRow(datos);
  fila.estado_rndc = 'borrador';
  fila.rndc_error = null;
  const sets = Object.keys(fila).map((c) => `${c} = :${c}`).join(', ');
  await db().query(`UPDATE vehiculo SET ${sets} WHERE id = :id`, { ...fila, id });
}

export interface VehiculoBuscarRow {
  id: number;
  placa: string;
  label: string;
}

/** Plate autocomplete. Port of buscar(). */
export async function buscar(q: string, limite = 15): Promise<VehiculoBuscarRow[]> {
  const term = q.trim();
  if (term === '') return [];
  const [rows] = await db().query<(RowDataPacket & { id: number; placa: string })[]>(
    `SELECT id, placa FROM vehiculo WHERE placa LIKE :like ORDER BY placa LIMIT ${Number(limite)}`,
    { like: `%${term.toUpperCase()}%` },
  );
  return rows.map((f) => ({ id: f.id, placa: f.placa, label: f.placa }));
}

/** Paginated list with plate search. Port of listarConPaginacion(). */
export async function listarConPaginacion(q = '', pagina = 1, porPagina = 10): Promise<Paginated<VehiculoListRow>> {
  let where = '1=1';
  const params: Record<string, SqlValue> = {};
  if (q !== '') {
    params.like = `%${q}%`;
    where += ' AND placa LIKE :like';
  }
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM vehiculo WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const offset = Math.max(0, (pagina - 1) * porPagina);
  const [rows] = await db().query<(VehiculoListRow & RowDataPacket)[]>(
    `SELECT id, placa, cod_configuracion, remolque_placa, tenedor_num_id, estado_rndc, rndc_ingreso_id
     FROM vehiculo WHERE ${where} ORDER BY id DESC LIMIT ${Number(porPagina)} OFFSET ${Number(offset)}`,
    params,
  );
  return { items: rows, total };
}

/** Count of vehículos not yet registered in the RNDC. Backs the "Vehículos" nav badge. */
export async function contarPendientes(): Promise<number> {
  const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
    "SELECT COUNT(*) AS n FROM vehiculo WHERE estado_rndc <> 'registrado'",
  );
  return Number(rows[0]?.n ?? 0);
}

export interface VehiculoDetalle {
  placa: string;
  conductor_tipo_id: string | null;
  conductor_num_id: string | null;
  conductor_nombre_completo: string | null;
  tenedor_tipo_id: string;
  tenedor_num_id: string;
  tenedor_nombre_completo: string | null;
}

/**
 * Vehicle + conductor (full name) + tenedor, for despacho autofill.
 * Port of detalle().
 */
export async function detalle(placa: string): Promise<VehiculoDetalle | null> {
  const [rows] = await db().query<(VehiculoDetalle & RowDataPacket)[]>(
    `SELECT v.placa,
            v.conductor_tipo_id, v.conductor_num_id,
            CONCAT_WS(' ', c.nombre, c.primer_apellido, c.segundo_apellido) AS conductor_nombre_completo,
            v.tenedor_tipo_id, v.tenedor_num_id,
            CONCAT_WS(' ', t.nombre, t.primer_apellido, t.segundo_apellido) AS tenedor_nombre_completo
     FROM vehiculo v
     LEFT JOIN tercero c ON c.tipo_id = v.conductor_tipo_id AND c.num_id = v.conductor_num_id
     LEFT JOIN tercero t ON t.tipo_id = v.tenedor_tipo_id AND t.num_id = v.tenedor_num_id
     WHERE v.placa = :placa`,
    { placa: placa.toUpperCase() },
  );
  return rows[0] ?? null;
}

/** Fetches a full vehículo by id. Port of obtener(). */
export async function obtener(id: number): Promise<Vehiculo | null> {
  const [rows] = await db().query<(Vehiculo & RowDataPacket)[]>('SELECT * FROM vehiculo WHERE id = :id', { id });
  return rows[0] ?? null;
}

/** Registers the vehículo in the RNDC (proceso 12). Port of registrarEnRndc(). */
export async function registrarEnRndc(id: number): Promise<RndcRespuesta> {
  const v = await obtener(id);
  if (v === null) return RndcRespuesta.fallo('Vehículo no encontrado.', 0, '');

  const rndc = await RndcClient.desdeConfig();
  const vars = {
    NUMNITEMPRESATRANSPORTE: (await obtenerEmpresa()).nit,
    NUMPLACA: v.placa,
    CODCONFIGURACIONUNIDADCARGA: v.cod_configuracion,
    PESOVEHICULOVACIO: v.peso_vacio,
    CODTIPOIDPROPIETARIO: v.propietario_tipo_id,
    NUMIDPROPIETARIO: v.propietario_num_id,
    CODTIPOIDTENEDOR: v.tenedor_tipo_id,
    NUMIDTENEDOR: v.tenedor_num_id,
  };

  const resp = await rndc.ingresar(12, vars);

  await db().query('UPDATE vehiculo SET estado_rndc = :estado, rndc_ingreso_id = :ing, rndc_error = :err WHERE id = :id', {
    estado: resp.ok ? 'registrado' : 'error',
    ing: resp.ingresoId,
    err: resp.ok ? null : resp.error,
    id,
  });

  return resp;
}
