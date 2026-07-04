/**
 * Light TMS - Minimal RFC-4180 CSV builder. Quotes cells containing comma/quote/
 * newline, doubles inner quotes, and prepends a UTF-8 BOM so Excel shows accents.
 */

export type CsvColumn<T> = [key: keyof T & string, header: string];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Serialises rows to a CSV string using the given ordered columns. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map(([, h]) => cell(h)).join(',');
  const body = rows.map((r) => columns.map(([k]) => cell(r[k])).join(','));
  return '﻿' + [header, ...body].join('\r\n');
}
