/**
 * Light TMS - TypeScript row types for the MySQL tables.
 *
 * These mirror the canonical schema (sql/schema.sql + maestros.sql + catalogos +
 * municipios + migraciones v2..v31). DECIMAL/BIGINT come back as strings from
 * mysql2 (decimalNumbers:false, to preserve precision), so money/ids are typed
 * as string. Verify against the live DB with SHOW CREATE TABLE when available.
 */

export type EstadoMaestroRndc = 'borrador' | 'pendiente' | 'registrado' | 'error';
export type EstadoDocRndc = 'pendiente' | 'enviado' | 'aceptado' | 'rechazado';

/** tercero — RNDC proceso 11. */
export interface Tercero {
  id: number;
  tipo_id: string;
  num_id: string;
  nombre: string;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  regimen_simple: string | null;
  direccion: string;
  cod_municipio: string;
  municipio_nombre: string | null;
  sede: string | null;
  nombre_sede: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  latitud: string | null;
  longitud: string | null;
  es_conductor: 0 | 1;
  categoria_licencia: string | null;
  num_licencia: string | null;
  fecha_venc_licencia: string | null;
  rndc_ingreso_id: string | null;
  estado_rndc: EstadoMaestroRndc;
  rndc_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape used by list views / autocomplete. */
export interface TerceroListRow {
  id: number;
  tipo_id: string;
  num_id: string;
  nombre: string;
  municipio_nombre: string | null;
  es_conductor: 0 | 1;
  estado_rndc: EstadoMaestroRndc;
  rndc_ingreso_id: string | null;
}

/** vehiculo — RNDC proceso 12. */
export interface Vehiculo {
  id: number;
  placa: string;
  cod_configuracion: string;
  marca: string | null;
  peso_vacio: number | null;
  propietario_tipo_id: string | null;
  propietario_num_id: string | null;
  tenedor_tipo_id: string;
  tenedor_num_id: string;
  conductor_tipo_id: string | null;
  conductor_num_id: string | null;
  remolque_placa: string | null;
  /** Datos del SOAT, solo para impresión del manifiesto (no viajan al RNDC). */
  soat_compania: string | null;
  soat_poliza: string | null;
  soat_vencimiento: string | null;
  rndc_ingreso_id: string | null;
  estado_rndc: EstadoMaestroRndc;
  rndc_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehiculoListRow {
  id: number;
  placa: string;
  cod_configuracion: string;
  remolque_placa: string | null;
  tenedor_num_id: string;
  estado_rndc: EstadoMaestroRndc;
  rndc_ingreso_id: string | null;
}

/** producto — RNDC product catalog (with dangerous-goods fields). */
export interface Producto {
  codigo: string;
  nombre: string;
  tipo: string | null;
  peligrosa: string | null;
  clase_division: string | null;
  peligro_secundario: string | null;
  grupo_embalaje: string | null;
  alerta: string | null;
  codigo_un: string | null;
  estado_producto: string | null;
}

export interface ProductoListRow {
  codigo: string;
  nombre: string;
  tipo: string | null;
  codigo_un: string | null;
  estado_producto: string | null;
}

/** Reference catalog rows. */
export interface CatalogoCodigoDesc {
  codigo: string;
  descripcion: string;
}
export interface ConfiguracionVehiculo {
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: string | null;
}

/** Standard paginated result envelope (mirrors listarConPaginacion). */
export interface Paginated<T> {
  items: T[];
  total: number;
}
