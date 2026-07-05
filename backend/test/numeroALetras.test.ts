/**
 * Locks the Spanish number-to-words converter used for "VALOR TOTAL DEL VIAJE
 * EN LETRAS" on the printed manifiesto — verified against a real RNDC document.
 */

import { describe, it, expect } from 'vitest';
import { numeroATexto, valorEnLetras } from '../src/util/numeroALetras.js';

describe('numeroATexto / valorEnLetras', () => {
  it('matches the real manifiesto sample: 5,407,500 -> CINCO MILLONES CUATROCIENTOS SIETE MIL QUINIENTOS', () => {
    expect(numeroATexto(5_407_500)).toBe('CINCO MILLONES CUATROCIENTOS SIETE MIL QUINIENTOS');
    expect(valorEnLetras(5_407_500)).toBe('CINCO MILLONES CUATROCIENTOS SIETE MIL QUINIENTOS PESOS');
  });

  it('handles zero, one, and round hundreds', () => {
    expect(numeroATexto(0)).toBe('CERO');
    expect(numeroATexto(1)).toBe('UN');
    expect(numeroATexto(100)).toBe('CIEN');
    expect(numeroATexto(500)).toBe('QUINIENTOS');
  });

  it('handles exactly one million and one thousand', () => {
    expect(numeroATexto(1_000_000)).toBe('UN MILLÓN');
    expect(numeroATexto(1_000)).toBe('MIL');
    expect(numeroATexto(2_000)).toBe('DOS MIL');
  });

  it('handles multi-million values', () => {
    expect(numeroATexto(23_000_000)).toContain('MILLONES');
    expect(numeroATexto(1_508_692)).toBe('UN MILLÓN QUINIENTOS OCHO MIL SEISCIENTOS NOVENTA Y DOS');
  });
});
