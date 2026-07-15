/**
 * Exact-XML characterization tests for the anulación payload builders
 * (RNDC procesos 9 / 28 / 29 / 32 / 54). Byte-for-byte so a change in tag
 * order/content is caught — these go to the RNDC and are irreversible.
 */

import { describe, it, expect } from 'vitest';
import {
  payloadAnularCumplidoManifiesto,
  payloadAnularCumplidoRemesa,
  payloadAnularCumplidoInicialRemesa,
  payloadAnularManifiesto,
  payloadAnularRemesa,
} from '../src/modules/cola/cola.repo.js';

const NIT = '8190041165';
const MANIF = '0101211090';

describe('anulación payloads', () => {
  it('29 — anular cumplido manifiesto', () => {
    // 'Error de digitación' tiene 19 caracteres; se rellena con 1 '*' para
    // llegar al mínimo de 20 que exige el RNDC (ACI052) — ver tagObservaciones().
    expect(payloadAnularCumplidoManifiesto(NIT, MANIF, 'D', 'Error de digitación')).toBe(
      '<NUMNITEMPRESATRANSPORTE>8190041165</NUMNITEMPRESATRANSPORTE>' +
        '<NUMMANIFIESTOCARGA>0101211090</NUMMANIFIESTOCARGA>' +
        '<CODMOTIVOANULACIONCUMPLIDO>D</CODMOTIVOANULACIONCUMPLIDO>' +
        '<OBSERVACIONES>Error de digitación*</OBSERVACIONES>',
    );
  });

  it('28 — anular cumplido remesa (num_remesa se formatea a consecutivo de 10 dígitos; obs vacía se rellena a 20 chars)', () => {
    expect(payloadAnularCumplidoRemesa(NIT, 'REM-00003', 'O', '')).toBe(
      '<NUMNITEMPRESATRANSPORTE>8190041165</NUMNITEMPRESATRANSPORTE>' +
        '<CONSECUTIVOREMESA>0000000003</CONSECUTIVOREMESA>' +
        '<CODMOTIVOANULACIONCUMPLIDO>O</CODMOTIVOANULACIONCUMPLIDO>' +
        '<OBSERVACIONES>********************</OBSERVACIONES>',
    );
  });

  it('54 — anular cumplido inicial remesa (incluye NUMMANIFIESTOCARGA; obs corta se rellena a 20 chars)', () => {
    expect(payloadAnularCumplidoInicialRemesa(NIT, '3', MANIF, 'D', 'x')).toBe(
      '<NUMNITEMPRESATRANSPORTE>8190041165</NUMNITEMPRESATRANSPORTE>' +
        '<CONSECUTIVOREMESA>0000000003</CONSECUTIVOREMESA>' +
        '<NUMMANIFIESTOCARGA>0101211090</NUMMANIFIESTOCARGA>' +
        '<CODMOTIVOANULACIONCUMPLIDO>D</CODMOTIVOANULACIONCUMPLIDO>' +
        '<OBSERVACIONES>x*******************</OBSERVACIONES>',
    );
  });

  it('32 — anular manifiesto (obs vacía se rellena a 20 chars)', () => {
    expect(payloadAnularManifiesto(NIT, MANIF, 'S', '')).toBe(
      '<NUMNITEMPRESATRANSPORTE>8190041165</NUMNITEMPRESATRANSPORTE>' +
        '<NUMMANIFIESTOCARGA>0101211090</NUMMANIFIESTOCARGA>' +
        '<MOTIVOANULACIONMANIFIESTO>S</MOTIVOANULACIONMANIFIESTO>' +
        '<OBSERVACIONES>********************</OBSERVACIONES>',
    );
  });

  it('9 — anular remesa (MOTIVOREVERSAREMESA=A, no L; obs vacía se rellena a 20 chars)', () => {
    expect(payloadAnularRemesa(NIT, 'REM-00003', 'D', '')).toBe(
      '<NUMNITEMPRESATRANSPORTE>8190041165</NUMNITEMPRESATRANSPORTE>' +
        '<CONSECUTIVOREMESA>0000000003</CONSECUTIVOREMESA>' +
        '<MOTIVOREVERSAREMESA>A</MOTIVOREVERSAREMESA>' +
        '<MOTIVOANULACIONREMESA>D</MOTIVOANULACIONREMESA>' +
        '<OBSERVACIONES>********************</OBSERVACIONES>',
    );
  });

  it('no rellena si ya cumple el mínimo de 20 caracteres', () => {
    const obs20 = 'Cancelación de un despacho por error'; // > 20 chars
    expect(payloadAnularManifiesto(NIT, MANIF, 'S', obs20)).toContain(`<OBSERVACIONES>${obs20}</OBSERVACIONES>`);
  });

  it('escapa caracteres XML en las observaciones (14 chars + 6 "*" de relleno)', () => {
    expect(payloadAnularManifiesto(NIT, MANIF, 'D', 'Ruta A & B <x>')).toContain(
      '<OBSERVACIONES>Ruta A &amp; B &lt;x&gt;******</OBSERVACIONES>',
    );
  });
});
