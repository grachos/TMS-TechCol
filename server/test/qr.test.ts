/**
 * Locks the RNDC manifiesto QR structured-text format (port of the $qrText
 * assembly in manifiesto_pdf.php). This is what authorities scan, so the exact
 * field order, CRLF separators and truncation must not drift.
 */

import { describe, it, expect } from 'vitest';
import { buildManifiestoQrText } from '../src/modules/pdf/qr.js';

describe('buildManifiestoQrText', () => {
  it('assembles all fields with CRLF separators and Y/m/d date', () => {
    const t = buildManifiestoQrText({
      mec: 'ING123',
      fechaExpedicion: '2026-07-04',
      placa: 'ABC123',
      remolque: 'R99',
      config: '2',
      origen: 'BOGOTA, D.C.',
      destino: 'MEDELLIN',
      descripcionProducto: 'ARROZ BLANCO PREMIUM',
      conductorNumId: '79123456',
      razonSocial: 'TRANSPORTES ACME S.A.S',
      observaciones: 'Entrega urgente',
      seguridadqr: 'SQR-XYZ',
    });
    expect(t).toBe(
      'MEC:ING123\r\n' +
        'Fecha:2026/07/04\r\n' +
        'Placa:ABC123\r\n' +
        'Remolque:R99\r\n' +
        'Config:2\r\n' +
        'Orig:BOGOTA, D.C.\r\n' +
        'Dest:MEDELLIN\r\n' +
        'Mercancia:ARROZ BLANCO PREMIUM\r\n' +
        'Conductor:79123456\r\n' +
        'Empresa:TRANSPORTES ACME S.A.S\r\n' +
        'Obs:Entrega urgente\r\n' +
        'Seguro:SQR-XYZ',
    );
  });

  it('omits Remolque and Obs when empty, and truncates long fields', () => {
    const t = buildManifiestoQrText({
      mec: 'X',
      fechaExpedicion: null,
      placa: 'P1',
      remolque: '',
      config: '3',
      origen: 'A-MUNICIPIO-CON-NOMBRE-LARGISIMO',
      destino: 'D',
      descripcionProducto: 'PRODUCTO-CON-DESCRIPCION-EXCESIVAMENTE-LARGA',
      conductorNumId: '1',
      razonSocial: 'EMPRESA-CON-RAZON-SOCIAL-DEMASIADO-LARGA',
      observaciones: '   ',
      seguridadqr: '',
    });
    expect(t).toContain('Orig:A-MUNICIPIO-CON-NOMB\r\n'); // 20 chars
    expect(t).toContain('Mercancia:PRODUCTO-CON-DESCRIPCION-EXCES\r\n'); // 30 chars
    expect(t).toContain('Empresa:EMPRESA-CON-RAZON-SOCIAL-DEMAS\r\n'); // 30 chars
    expect(t).not.toContain('Remolque:');
    expect(t).not.toContain('Obs:');
    expect(t.endsWith('Seguro:')).toBe(true);
  });
});
