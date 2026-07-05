/**
 * Light TMS - HTML → PDF via puppeteer-core using the system Chrome.
 *
 * We avoid bundling Chromium: puppeteer-core drives an installed Chrome/Edge.
 * If none is found the caller falls back to serving printable HTML (identical
 * layout; the browser's Print → Save as PDF produces the document).
 */

import { existsSync } from 'node:fs';
import type { Browser } from 'puppeteer-core';

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
 * Renders an HTML string to a PDF Buffer (A4 portrait). Throws if no Chrome or if
 * the browser doesn't come up within the timeout — callers catch and fall back to
 * serving printable HTML, so a flaky/sandboxed Chrome can never hang a request.
 */
export async function htmlToPdf(html: string, timeoutMs = 12000): Promise<Buffer> {
  const executablePath = findChrome();
  if (!executablePath) throw new Error('No se encontró Chrome/Edge para generar el PDF.');
  const puppeteer = (await import('puppeteer-core')).default;
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      timeout: timeoutMs,
      protocolTimeout: timeoutMs,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
      timeout: timeoutMs,
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
