/** Shared API types (mirror server/src/db/types.ts). */

export type EstadoMaestroRndc = 'borrador' | 'pendiente' | 'registrado' | 'error';

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

export interface PagedResponse<T> {
  items: T[];
  total: number;
  pagina: number;
  paginas: number;
}

export interface Vehiculo {
  id: number;
  placa: string;
  cod_configuracion: string;
  marca: string | null;
  peso_vacio: number | null;
  peso_vacio_remolque: number | null;
  propietario_tipo_id: string | null;
  propietario_num_id: string | null;
  tenedor_tipo_id: string;
  tenedor_num_id: string;
  conductor_tipo_id: string | null;
  conductor_num_id: string | null;
  remolque_placa: string | null;
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

export interface ConfiguracionVehiculo {
  codigo: string;
  nombre: string;
  descripcion: string;
}

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

/** Item returned by autocomplete /buscar endpoints. */
export interface AcItem {
  label: string;
  [key: string]: string | number | null;
}
