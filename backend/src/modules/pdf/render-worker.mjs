#!/usr/bin/env node
/**
 * Light TMS - Isolated Chrome PDF renderer (plain JS, no TS build step needed).
 *
 * Runs as its OWN OS process, spawned by render.ts. Reads HTML on stdin, writes
 * the rendered PDF bytes to stdout. Kept out-of-process so that if launching
 * Chrome ever blocks (sandboxed/restricted environments, missing window station,
 * flaky machines), the hang is confined to THIS process — the parent API server
 * enforces a hard kill timeout and its own event loop is never affected, so every
 * other request keeps working while a stuck PDF render gets killed and falls
 * back to printable HTML.
 *
 * Usage: node render-worker.mjs <chromeExecutablePath>  (HTML piped via stdin)
 */

import puppeteer from 'puppeteer-core';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const executablePath = process.argv[2];
  if (!executablePath) {
    process.stderr.write('render-worker: falta la ruta del ejecutable de Chrome/Edge.');
    process.exit(2);
  }
  const html = await readStdin();

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    });
    process.stdout.write(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(String((e && e.stack) || e));
  process.exit(1);
});
