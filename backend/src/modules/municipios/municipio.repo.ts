/**
 * Light TMS - Municipios (DIVIPOLA). Port of MunicipioRepo.php.
 */

import type { RowDataPacket } from 'mysql2';
import { db } from '../../db/pool.js';

export interface MunicipioRow {
  codigo_rndc: string;
  nombre_completo: string;
  nombre_mpio: string;
  nombre: string;
  departamento: string;
}

export interface MunicipioBuscarRow extends MunicipioRow {
  label: string;
}

/** Search municipios by name or code (autocomplete). Port of buscar(). */
export async function buscar(q: string, limite = 15): Promise<MunicipioBuscarRow[]> {
  const term = q.trim();
  if (term === '') return [];
  const like = `%${term}%`;
  const prefix = `${term}%`;
  const [rows] = await db().query<(MunicipioRow & RowDataPacket)[]>(
    `SELECT codigo_rndc, nombre_completo, nombre_mpio, nombre, departamento
     FROM municipio
     WHERE nombre LIKE :like OR nombre_completo LIKE :like OR codigo_rndc LIKE :like OR nombre_mpio LIKE :like
     ORDER BY (nombre LIKE :prefix) DESC, nombre
     LIMIT ${Number(limite)}`,
    { like, prefix },
  );
  return rows.map((f) => ({
    ...f,
    label: f.nombre !== f.nombre_mpio ? `${f.nombre} – ${f.nombre_mpio}, ${f.departamento}` : f.nombre_completo,
  }));
}

/** Full name of a municipio by its code. Port of nombre(). */
export async function nombre(codigo: string): Promise<string | null> {
  const [rows] = await db().query<(RowDataPacket & { nombre_completo: string })[]>(
    'SELECT nombre_completo FROM municipio WHERE codigo_rndc = :codigo',
    { codigo },
  );
  return rows[0]?.nombre_completo ?? null;
}
