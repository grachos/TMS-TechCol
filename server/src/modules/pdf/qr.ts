/**
 * Light TMS - Manifiesto QR. Port of the $qrText assembly in manifiesto_pdf.php.
 *
 * The RNDC structured text is business-critical (it's what authorities scan), so
 * buildManifiestoQrText is pure + unit-tested for byte parity with the PHP.
 */

import QRCode from 'qrcode';

export interface QrParams {
  mec: string; // rndc_ingreso_id
  fechaExpedicion: string | null; // YYYY-MM-DD
  placa: string;
  remolque: string;
  config: string;
  origen: string; // full municipio name (already resolved)
  destino: string;
  descripcionProducto: string; // remesa[0]
  conductorNumId: string;
  razonSocial: string;
  observaciones: string;
  seguridadqr: string;
}

/** DD-agnostic: converts YYYY-MM-DD to YYYY/MM/DD (PHP date('Y/m/d')). */
function fechaY(f: string | null): string {
  if (!f) return '';
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : f;
}

const cut = (s: string, n: number) => (s ?? '').slice(0, n);

/** Builds the exact RNDC QR payload text. */
export function buildManifiestoQrText(p: QrParams): string {
  let t = 'MEC:' + p.mec + '\r\n';
  t += 'Fecha:' + fechaY(p.fechaExpedicion) + '\r\n';
  t += 'Placa:' + p.placa + '\r\n';
  if (p.remolque) t += 'Remolque:' + p.remolque + '\r\n';
  t += 'Config:' + p.config + '\r\n';
  t += 'Orig:' + cut(p.origen, 20) + '\r\n';
  t += 'Dest:' + cut(p.destino, 20) + '\r\n';
  t += 'Mercancia:' + cut(p.descripcionProducto, 30) + '\r\n';
  t += 'Conductor:' + p.conductorNumId + '\r\n';
  t += 'Empresa:' + cut(p.razonSocial, 30) + '\r\n';
  if ((p.observaciones ?? '').trim() !== '') t += 'Obs:' + cut(p.observaciones, 120) + '\r\n';
  t += 'Seguro:' + p.seguridadqr;
  return t;
}

/** Renders the QR text to a PNG data URL for embedding in the PDF HTML. */
export async function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
}
