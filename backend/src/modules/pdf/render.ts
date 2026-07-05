/**
 * Light TMS - HTML → PDF via puppeteer-core using the system Chrome.
 *
 * We avoid bundling Chromium: puppeteer-core drives an installed Chrome/Edge.
 * If none is found the caller falls back to serving printable HTML (identical
 * layout; the browser's Print → Save as PDF produces the document).
 *
 * IMPORTANT: rendering runs in a separate OS process (render-worker.mjs), not
 * in-process. Some environments (sandboxes, restricted sessions, missing
 * window-station access) can make Chrome's launch hang indefinitely at the OS
 * level — a hang that neither puppeteer's own timeout options nor an in-process
 * Promise.race can interrupt, because it blocks the Node event loop itself
 * (verified: while stuck, even unrelated API requests stopped responding).
 * Isolating it in a child process lets the parent enforce a hard kill via
 * execFile's `timeout`/`killSignal`, which works regardless of what the child
 * is doing internally — the main API server's event loop is never at risk.
 */

import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'render-worker.mjs');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : undefined,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

/** Returns the first existing Chrome/Edge executable, or null. */
export function findChrome(): string | null {
  for (const p of CANDIDATES) {
    try {
      if (existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** True if a headless browser is available for real PDF rendering. */
export function pdfEngineAvailable(): boolean {
  return findChrome() !== null;
}

/**
 * Renders an HTML string to a PDF Buffer (A4 portrait) by spawning an isolated
 * worker process. Throws if no Chrome is found, the worker times out (killed
 * with SIGKILL — guaranteed to terminate it regardless of internal state), or
 * it exits with an error — callers catch and fall back to serving printable
 * HTML, so a flaky/sandboxed Chrome can never hang a request or the server.
 */
export async function htmlToPdf(html: string, timeoutMs = 15000): Promise<Buffer> {
  const executablePath = findChrome();
  if (!executablePath) throw new Error('No se encontró Chrome/Edge para generar el PDF.');

  return new Promise<Buffer>((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [WORKER_PATH, executablePath],
      { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 30 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr && (stderr as Buffer).length ? (stderr as Buffer).toString('utf8').slice(0, 500) : err.message;
          reject(new Error(`El renderizador de PDF falló o excedió el tiempo límite: ${detail}`));
          return;
        }
        const buf = stdout as unknown as Buffer;
        if (!buf || buf.length === 0) {
          reject(new Error('El renderizador de PDF no produjo salida.'));
          return;
        }
        resolve(Buffer.from(buf));
      },
    );
    child.stdin?.end(html, 'utf8');
  });
}
