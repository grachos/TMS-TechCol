import { describe, it, expect } from 'vitest';
import { combinarConfiguracionVehiculo } from '../src/util/configuracionVehiculo.js';

describe('combinarConfiguracionVehiculo', () => {
  it('Rule A: Cabezote + Semirremolque -> [primer dígito] + [código completo]', () => {
    expect(
      combinarConfiguracionVehiculo({ nombre: '3S', tipo: 'Cabezote' }, { nombre: 'S2', tipo: 'Semiremolque' }),
    ).toBe('3S2');
  });

  it('Rule A: Cabezote + SemiRemolque Modular', () => {
    expect(
      combinarConfiguracionVehiculo(
        { nombre: '2S', tipo: 'Cabezote' },
        { nombre: 'SM4', tipo: 'SemiRemolque Modular' },
      ),
    ).toBe('2SM4');
  });

  it('Rule B: Rígido + Remolque -> [código completo] + [código completo]', () => {
    expect(
      combinarConfiguracionVehiculo({ nombre: '3', tipo: 'Rígido' }, { nombre: 'R2', tipo: 'Remolque' }),
    ).toBe('3R2');
  });

  it('Rule B: Rígido + Remolque Balanceado', () => {
    expect(
      combinarConfiguracionVehiculo(
        { nombre: '4', tipo: 'Rígido' },
        { nombre: 'B2', tipo: 'Remolque Balanceado' },
      ),
    ).toBe('4B2');
  });

  it('Rule C: no towed unit -> own base code, unchanged', () => {
    expect(combinarConfiguracionVehiculo({ nombre: '3', tipo: 'Rígido' }, null)).toBe('3');
    expect(combinarConfiguracionVehiculo({ nombre: 'V2', tipo: 'Rígido' }, null)).toBe('V2');
    expect(combinarConfiguracionVehiculo({ nombre: 'CA', tipo: 'Rígido' }, null)).toBe('CA');
  });

  it('returns empty string when the tractor itself has no config', () => {
    expect(combinarConfiguracionVehiculo(null, { nombre: 'S2', tipo: 'Semiremolque' })).toBe('');
  });
});
