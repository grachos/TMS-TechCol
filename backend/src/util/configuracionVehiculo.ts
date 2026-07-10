/**
 * Light TMS - Combined vehicle configuration code ("2S2", "3R2", "4B2", ...).
 *
 * A cargo vehicle's RNDC configuration always joins a power unit (Cabezote/
 * Tractocamión or Rígido/Camión) with a towed unit (Semirremolque, Remolque,
 * or Remolque Balanceado) — each registered as its OWN vehículo record with
 * its own individual configuracion_vehiculo code (e.g. tractor "2S", trailer
 * "S2"). The combined code shown on the printed Manifiesto and embedded in
 * its QR ("Config:") is computed from the pair, not stored directly:
 *
 *   Rule A — Cabezote + Semirremolque/SemiRemolque Modular:
 *     [primer dígito del cabezote] + [código completo del semirremolque]
 *     e.g. Cabezote "3S" + Semirremolque "S2" -> "3S2"
 *
 *   Rule B — Rígido + Remolque/Remolque Modular/Remolque Balanceado:
 *     [código completo del rígido] + [código completo del remolque]
 *     e.g. Rígido "3" + Remolque "R2" -> "3R2"
 *
 *   Rule C — no towed unit (Rígido/Volqueta/Camioneta/Motocarro solo):
 *     el propio código, sin combinar.
 */

export interface ConfigCatalogoEntry {
  nombre: string;
  tipo: string | null;
}

/** Combines a power unit + towed unit's own catalog entries into the final RNDC config code. */
export function combinarConfiguracionVehiculo(
  tractor: ConfigCatalogoEntry | null,
  remolque: ConfigCatalogoEntry | null,
): string {
  if (!tractor) return '';
  if (!remolque) return tractor.nombre; // Rule C: independent vehicle.

  if (tractor.tipo === 'Cabezote') {
    // Rule A: only the leading digit of the cabezote's own code is used.
    const digito = tractor.nombre.match(/^\d+/)?.[0] ?? tractor.nombre;
    return digito + remolque.nombre;
  }

  // Rule B (and fallback for any other power-unit type): full codes joined.
  return tractor.nombre + remolque.nombre;
}
