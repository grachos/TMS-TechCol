/**
 * Light TMS - Spanish number-to-words converter for currency amounts, used in
 * "VALOR TOTAL DEL VIAJE EN LETRAS" on the printed manifiesto. Supports whole
 * pesos up to billions (RNDC freight values never need fractional cents here).
 */

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIECIS = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

/** Converts an integer 0-999 to words. */
function centenasATexto(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto = CENTENAS[c] ?? '';
  if (resto === 0) return texto;
  if (texto) texto += ' ';
  if (resto < 10) return texto + UNIDADES[resto];
  if (resto < 20) return texto + DIECIS[resto - 10];
  const d = Math.floor(resto / 10);
  const u = resto % 10;
  if (u === 0) return texto + DECENAS[d];
  return texto + DECENAS[d] + ' Y ' + UNIDADES[u];
}

/** Converts an integer 0-999999 to words (miles). */
function milesATexto(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  let texto = '';
  if (miles > 0) {
    texto = miles === 1 ? 'MIL' : centenasATexto(miles) + ' MIL';
  }
  if (resto > 0) {
    texto += (texto ? ' ' : '') + centenasATexto(resto);
  }
  return texto;
}

/** Converts a non-negative integer to Spanish words (up to trillions). */
export function numeroATexto(valor: number): string {
  const n = Math.round(Math.abs(valor));
  if (n === 0) return 'CERO';

  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  let texto = '';
  if (millones > 0) {
    texto = millones === 1 ? 'UN MILLÓN' : milesATexto(millones) + ' MILLONES';
  }
  if (resto > 0) {
    texto += (texto ? ' ' : '') + milesATexto(resto);
  }
  return texto.trim();
}

/** "VALOR TOTAL DEL VIAJE EN LETRAS": e.g. 5407500 -> "CINCO MILLONES CUATROCIENTOS SIETE MIL QUINIENTOS PESOS". */
export function valorEnLetras(valor: number): string {
  return `${numeroATexto(valor)} PESOS`;
}
