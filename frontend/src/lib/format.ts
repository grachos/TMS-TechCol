/** Shared formatting + domain option maps (mirror the PHP views). */

export const OPERACIONES: Record<string, string> = {
  G: 'General',
  P: 'Paqueteo',
  C: 'Contenedor Cargado',
  V: 'Contenedor Vacío',
};

export const NATURALEZAS: Record<string, string> = {
  '1': 'Carga normal',
  '2': 'Carga peligrosa',
  '3': 'Carga extradimensionada',
  '4': 'Carga extrapesada',
  '5': 'Desechos peligrosos',
  '6': 'Semovientes',
  '7': 'Refrigerada',
};

export const UNIDADES: Record<string, string> = { '1': 'Kilogramos', '2': 'Galones' };

export const TIPOS_FLETE: Record<string, string> = {
  G: 'General',
  M: 'Multiparada',
  W: 'Viaje Vacío',
  D: 'Varios Viajes en el Día',
  I: 'Viaje de Ida y Regreso',
  U: 'Viaje Municipal o Urbano',
  V: 'Varios Viajes Urbanos en el día',
};

export const TIPOS_PACTADO: Record<string, string> = { V: 'Por Viaje', K: 'Por Kilogramo', G: 'Por Galón' };

export const RESPONSABLES: Record<string, string> = {
  E: 'Empresa de transporte',
  R: 'Remitente',
  D: 'Destinatario',
};

/** Money formatting like the PHP number_format($x, 2). */
export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return '$ ' + n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Retentions computed exactly like initCalculos()/prepararFila. */
export function calcularRetenciones(flete: number, tarifaIcaPorMil: number) {
  return {
    retencion_ica: (flete * tarifaIcaPorMil) / 1000,
    retencion_fuente: flete * 0.01,
    fopat: flete * 0.001,
  };
}
