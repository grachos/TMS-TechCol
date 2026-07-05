/**
 * Light TMS - Official Mintransporte/SuperTransporte logos for the printed
 * manifiesto/remesa headers, embedded as base64 data URLs (same approach as the
 * QR code) so puppeteer never needs to resolve a file:// path at render time.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPngDataUrl(filename: string): string {
  const bytes = readFileSync(path.join(__dirname, 'assets', filename));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

export const LOGO_MINTRANSPORTE = loadPngDataUrl('logo-mintransporte.png');
export const LOGO_SUPERTRANSPORTE = loadPngDataUrl('logo-supertransporte.png');
