/**
 * Light TMS - RNDC consecutivo formatting, shared between the queue payload
 * builders (cola.repo.ts) and anywhere the remesa's consecutivo is displayed
 * (Despachos list, printed Manifiesto/Remesa PDFs).
 */

/**
 * Formats a remesa's own num_remesa ("REM-00001") as the 10-digit numeric
 * consecutivo the RNDC expects and actually registers it under ("0000000001").
 * Since that's the number the RNDC recognizes for this remesa, it's also what
 * must be shown to the user — not the internal "REM-00001" label, which no
 * longer matches what was actually sent/accepted.
 */
export function consecutivoRemesaRndc(numRemesa: unknown): string {
  return String(parseInt(String(numRemesa ?? '0').replace(/[^0-9]/g, '') || '0', 10)).padStart(10, '0');
}
