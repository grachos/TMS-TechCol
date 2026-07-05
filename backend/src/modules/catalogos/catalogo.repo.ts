/**
 * Light TMS - RNDC catalogs (empaque, carrocería, configuración) and the
 * producto catalog. Port of CatalogoRepo.php.
 */

import type { RowDataPacket } from 'mysql2';
import { db } from '../../db/pool.js';
import type {
  CatalogoCodigoDesc,
  ConfiguracionVehiculo,
  Producto,
  ProductoListRow,
  Paginated,
} from '../../db/types.js';

/** Packaging types. Port of empaques(). */
export async function empaques(): Promise<CatalogoCodigoDesc[]> {
  const [rows] = await db().query<(CatalogoCodigoDesc & RowDataPacket)[]>(
    'SELECT codigo, descripcion FROM empaque ORDER BY descripcion',
  );
  return rows;
}

/** Packaging description by code. Port of empaquePorCodigo(). */
export async function empaquePorCodigo(codigo: string): Promise<string | null> {
  if (codigo === '') return null;
  const [rows] = await db().query<(RowDataPacket & { descripcion: string })[]>(
    'SELECT descripcion FROM empaque WHERE codigo = :codigo',
    { codigo },
  );
  return rows[0]?.descripcion ?? null;
}

/** Body types. Port of carrocerias(). */
export async function carrocerias(): Promise<CatalogoCodigoDesc[]> {
  const [rows] = await db().query<(CatalogoCodigoDesc & RowDataPacket)[]>(
    'SELECT codigo, descripcion FROM carroceria ORDER BY descripcion',
  );
  return rows;
}

/** Vehicle configurations. Port of configuraciones(). */
export async function configuraciones(): Promise<ConfiguracionVehiculo[]> {
  const [rows] = await db().query<(ConfiguracionVehiculo & RowDataPacket)[]>(
    'SELECT codigo, nombre, descripcion FROM configuracion_vehiculo ORDER BY tipo, nombre',
  );
  return rows;
}

/** Full product by code. Port of productoPorCodigo(). */
export async function productoPorCodigo(codigo: string): Promise<Producto | null> {
  if (codigo === '') return null;
  const [rows] = await db().query<(Producto & RowDataPacket)[]>(
    `SELECT codigo, nombre, tipo, peligrosa, clase_division,
            peligro_secundario, grupo_embalaje, alerta, codigo_un, estado_producto
     FROM producto WHERE codigo = :codigo`,
    { codigo },
  );
  return rows[0] ?? null;
}

export interface ProductoBuscarRow extends Producto {
  label: string;
}

/** Product autocomplete by name/code. Port of buscarProductos(). */
export async function buscarProductos(q: string, limite = 15): Promise<ProductoBuscarRow[]> {
  const term = q.trim();
  if (term === '') return [];
  const like = `%${term}%`;
  const [rows] = await db().query<(Producto & RowDataPacket)[]>(
    `SELECT codigo, nombre, tipo, peligrosa, clase_division,
            peligro_secundario, grupo_embalaje, alerta, codigo_un, estado_producto
     FROM producto
     WHERE nombre <> '' AND (nombre LIKE :like OR codigo LIKE :like)
     ORDER BY nombre LIMIT ${Number(limite)}`,
    { like },
  );
  return rows.map((f) => ({ ...f, label: `${f.codigo} — ${f.nombre}` }));
}

/** Updates codigo_un + estado_producto of a product. Port of actualizarProducto(). */
export async function actualizarProducto(
  codigo: string,
  datos: { codigo_un?: string | null; estado_producto?: string | null },
): Promise<void> {
  await db().query('UPDATE producto SET codigo_un = :un, estado_producto = :estado WHERE codigo = :codigo', {
    un: (datos.codigo_un ?? '').toString().trim() || null,
    estado: (datos.estado_producto ?? '').toString().trim() || null,
    codigo,
  });
}

/** Paginated product list. Port of listarProductos(). */
export async function listarProductos(q = '', pagina = 1, porPagina = 10): Promise<Paginated<ProductoListRow>> {
  const offset = Math.max(0, (pagina - 1) * porPagina);
  let where = "WHERE nombre <> ''";
  const params: Record<string, string> = {};
  if (q !== '') {
    params.like = `%${q}%`;
    where += ' AND (nombre LIKE :like OR codigo LIKE :like)';
  }
  const [countRows] = await db().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM producto ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await db().query<(ProductoListRow & RowDataPacket)[]>(
    `SELECT codigo, nombre, tipo, codigo_un, estado_producto
     FROM producto ${where} ORDER BY codigo LIMIT ${Number(porPagina)} OFFSET ${Number(offset)}`,
    params,
  );
  return { items: rows, total };
}
