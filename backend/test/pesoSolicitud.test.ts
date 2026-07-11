import { describe, it, expect } from 'vitest';
import { pesoTotalDe } from '../src/util/pesoSolicitud.js';

describe('pesoTotalDe', () => {
  it('sums the peso field across remesas', () => {
    expect(pesoTotalDe([{ peso: '1000' }, { peso: 2500.5 }, { peso: '500' }])).toBe(4000.5);
  });

  it('treats missing/blank/non-numeric peso as 0', () => {
    expect(pesoTotalDe([{ peso: '' }, { peso: undefined }, {}, { peso: 'abc' }])).toBe(0);
  });

  it('returns 0 for a non-array input', () => {
    expect(pesoTotalDe(null)).toBe(0);
    expect(pesoTotalDe(undefined)).toBe(0);
    expect(pesoTotalDe('not an array')).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(pesoTotalDe([])).toBe(0);
  });
});
