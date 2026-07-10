/**
 * Light TMS - PDF HTML templates matching the OFFICIAL RNDC printed formats
 * (Manifiesto Electrónico de Carga / Remesa de Carga), reproduced field-by-field
 * from real Ministerio de Transporte / SuperTransporte documents.
 */

import { valorEnLetras } from '../../util/numeroALetras.js';
import { LOGO_MINTRANSPORTE, LOGO_SUPERTRANSPORTE } from './logos.js';

type Row = Record<string, any>;

/** HTML escape (port of e()). */
export function e(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const NAT: Record<string, string> = {
  '1': 'Carga',
  '2': 'Carga Peligrosa',
  '3': 'Carga Extradimensionada',
  '4': 'Carga Extrapesada',
  '5': 'Desechos Peligrosos',
  '6': 'Semovientes',
  '7': 'Refrigerada',
};
const ESTADOS_PROD: Record<string, string> = { L: 'Liquido', S: 'Sólido/semi-sólido', G: 'Gaseoso' };
/** Full unit name (manifiesto's "Unidad Medida" column). */
const UNIDADES: Record<string, string> = { '1': 'Kilogramos', '2': 'Galones' };
/** RNDC short abbreviation (remesa's "U/M Mercancia" field). */
const UNIDADES_ABREV: Record<string, string> = { '1': 'KGM', '2': 'GLL' };

const LEGAL_TEXT =
  '"La impresión en soporte cartular (papel) de este acto administrativo producido por medios ' +
  'electrónicos en cumplimiento de la ley 527 de 1999 (Articulos 6 a 13) y de la ley 962 de 2005 ' +
  '(Articulo 6), es una reproducción del documento original que se encuentra en formato electrónico, ' +
  'cuya representación digital goza de autenticidad, integridad y no repudio".';

const DENUNCIA_TEXT =
  'Si es víctima de algún fraude o conoce de alguna irregularidad en el Registro Nacional de ' +
  'Despachos de Carga RNDC denúncielo a la Superintendencia de Puertos y Transporte, en la línea ' +
  'gratuita nacional 018000 915615 y a través del correo electrónico: atencionciudadano@supertransporte.gov.co';

/** number_format($v, 2, ',', '.') style used across both documents. */
function money(v: unknown): string {
  const n = Number(v ?? 0) || 0;
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** DD/MM/YYYY-agnostic: renders a stored YYYY-MM-DD as YYYY/MM/DD like the RNDC. */
function fechaRndc(f: unknown): string {
  const s = String(f ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : s;
}

const nomTerc = (t: Row | null): string => {
  if (!t) return '';
  return (
    [t.nombre, t.primer_apellido, t.segundo_apellido].filter(Boolean).join(' ').trim() || (t.nombre_completo ?? '')
  );
};

/** "{tipo_id} {num_id}", e.g. "NIT 8300952130" — tipo spelled out for NIT. */
const idTexto = (t: Row | null): string => {
  if (!t) return '';
  const tipo = t.tipo_id === 'N' ? 'NIT' : (t.tipo_id ?? '');
  return `${tipo} ${t.num_id ?? ''}`.trim();
};

/** "{nombre_sede} {sede}" (e.g. "SANTA MARTA 75"), trimmed. */
const sedeTexto = (t: Row | null): string => `${t?.nombre_sede ?? ''} ${t?.sede ?? ''}`.trim();

/** "{categoria_licencia}-{num_licencia}" e.g. "C3-1094272125". */
const licenciaTexto = (t: Row | null): string => {
  if (!t?.num_licencia) return '';
  return t.categoria_licencia ? `${t.categoria_licencia}-${t.num_licencia}` : t.num_licencia;
};

/** First part of "MUNICIPIO, DEPARTAMENTO" (drops the department for a short city name). */
const ciudadTexto = (nombreCompleto: string | null | undefined): string =>
  (nombreCompleto ?? '').split(',')[0]?.trim() ?? '';

const COMMON_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 8.5px; color: #000; line-height: 1.3; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 2px 4px; text-align: left; vertical-align: middle; }
  .no-border, .no-border td, .no-border th { border: none; }
  .grid-table { margin-bottom: 0; }
  .lbl { font-weight: bold; background-color: #f2f2f2; white-space: nowrap; }
  .section-title { font-weight: bold; text-decoration: underline; padding: 3px 0; font-size: 9px; }
  .header-box { border: 2px solid #000; padding: 4px 8px; text-align: center; font-weight: bold; }
  .header-box .num { font-size: 11px; }
  .center { text-align: center; }
  .right { text-align: right; }
  .small { font-size: 7px; }
  .legal { font-size: 6.5px; font-style: italic; text-align: justify; }
  .logo-box { text-align: center; padding: 2px 4px; }
  .logo-box img { max-width: 100%; display: block; margin: 0 auto; }
  .logo-mintransporte { margin-bottom: 3px; }
  .page-break { page-break-before: always; }
`;

// ==================================================================
// MANIFIESTO ELECTRÓNICO DE CARGA
// ==================================================================

export interface ManifiestoCtx {
  m: Row;
  remesas: Row[];
  solicitud: Row;
  vehiculo: Row;
  empresa: Row;
  tipoManifiesto: string;
  responsables: Record<string, string>;
  configDsc: string;
  origen: string;
  destino: string;
  lugarPago: string;
  titular: Row | null;
  conductor: Row | null;
  tenedor: Row | null;
  qrImg: string; // data URL or ''
  muniNombre: (cod: string | null) => string;
  terceroPorTipoNum: (tipo: string, num: string) => Row | null;
  empaquePorCodigo: (cod: string) => string;
}

function empresaEncabezado(emp: Row, titulo: string): string {
  return `
    <div style="font-size:12px;font-weight:bold;">${e(titulo)}</div>
    <div style="font-size:9px;font-weight:bold;">${e(emp.razon_social ?? '')}</div>
    <div style="font-size:8px;">Nit: ${e(emp.nit ?? '')}</div>
    <div style="font-size:7.5px;">${e(emp.direccion ?? '')}</div>
    <div style="font-size:7.5px;">Tel: ${e(emp.telefono ?? '')} ${e(emp.municipio_nombre ?? '')}</div>`;
}

/** Faithful reproduction of the official MANIFIESTO ELECTRONICO DE CARGA (1 page). */
export function renderManifiestoHtml(c: ManifiestoCtx): string {
  const { m, remesas, solicitud: s, vehiculo: v, empresa: emp } = c;
  const flete = Number(m.valor_flete_pactado ?? 0) || 0;
  const reteFuente = Number(m.retencion_fuente ?? 0) || 0;
  const reteIca = Number(m.retencion_ica ?? 0) || 0;
  const fopat = Number(m.fopat ?? 0) || 0;
  const anticipo = Number(m.valor_anticipo ?? 0) || 0;
  const valorNeto = flete - reteFuente - reteIca - fopat;
  const saldo = valorNeto - anticipo;
  const autoriz = m.rndc_ingreso_id ?? '';

  const titularTel = [c.titular?.telefono, c.titular?.celular].filter(Boolean).join(' / ');
  const conductorTel = [c.conductor?.telefono, c.conductor?.celular].filter(Boolean).join(' / ');
  const tenedorTel = [c.tenedor?.telefono, c.tenedor?.celular].filter(Boolean).join(' / ');

  let mercanciaRows = '';
  for (const rem of remesas) {
    const natu = NAT[rem.naturaleza_carga ?? ''] ?? '';
    const empq = c.empaquePorCodigo(rem.tipo_empaque ?? '') || (rem.tipo_empaque ?? '');
    const remt = c.terceroPorTipoNum(rem.remitente_tipo_id ?? '', rem.remitente_num_id ?? '');
    const dest = c.terceroPorTipoNum(rem.destinatario_tipo_id ?? '', rem.destinatario_num_id ?? '');
    // dueno_poliza='N': the carrier (empresa) is the policy holder; 'S': the
    // shipper/generador holds its own policy.
    const generador = c.terceroPorTipoNum(
      rem.propietario_tipo_id ?? s.generador_tipo_id ?? '',
      rem.propietario_num_id ?? s.generador_num_id ?? '',
    );
    const duenoPoliza = rem.dueno_poliza === 'S' ? nomTerc(generador) : (emp.razon_social ?? '');
    mercanciaRows += `<tr>
      <td>${e(rem.num_remesa ?? '')}</td>
      <td>${e(UNIDADES[rem.unidad_medida ?? ''] ?? rem.unidad_medida ?? '')}</td>
      <td class="right">${money(rem.peso)}</td>
      <td>${e(natu)}${rem.naturaleza_carga === '2' ? '<br><span class="small">Permiso INVIAS:</span>' : ''}</td>
      <td>${e(empq)}<br>${e(rem.mercancia_codigo ?? '')} ${e(rem.descripcion_producto ?? '')}</td>
      <td>${e(remt?.num_id ?? '')} ${e(nomTerc(remt))}<br>${e(remt?.direccion ?? '')} ${e(c.muniNombre(remt?.cod_municipio ?? null))}</td>
      <td>${e(dest?.num_id ?? '')} ${e(nomTerc(dest))}<br>${e(dest?.direccion ?? '')} ${e(c.muniNombre(dest?.cod_municipio ?? null))}</td>
      <td>${e(duenoPoliza)}</td>
    </tr>`;
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>${COMMON_STYLES}
    .top-header td { border: none; vertical-align: top; }
  </style></head><body>

  <table class="no-border top-header"><tr>
    <td width="16%">
      <div class="logo-box logo-mintransporte"><img src="${LOGO_MINTRANSPORTE}" style="width:24mm;"></div>
      <div class="logo-box logo-supertransporte"><img src="${LOGO_SUPERTRANSPORTE}" style="width:24mm;"></div>
    </td>
    <td width="46%" class="center">
      <div style="font-size:13px;font-weight:bold;">MANIFIESTO ELECTRONICO DE CARGA</div>
      <div style="font-size:9px;font-weight:bold;">${e(emp.razon_social ?? '')}</div>
      <div style="font-size:8px;">Nit: ${e(emp.nit ?? '')}</div>
      <div style="font-size:7.5px;">${e(emp.direccion ?? '')}</div>
      <div style="font-size:7.5px;">Tel: ${e(emp.telefono ?? '')} ${e(emp.municipio_nombre ?? '')}</div>
    </td>
    <td width="38%">
      <div class="legal">${LEGAL_TEXT}</div>
      ${c.qrImg ? `<div class="right"><img src="${c.qrImg}" style="width:22mm;height:22mm;"></div>` : ''}
      <table style="margin-top:2px;"><tr><td class="header-box">Manifiesto: <span class="num">${e(m.num_manifiesto ?? '')}</span></td></tr>
        <tr><td class="header-box">Autorización <span class="num">${e(autoriz || '')}</span></td></tr></table>
    </td>
  </tr></table>

  <table class="grid-table"><tr>
    <td class="lbl">FECHA DE EXPEDICIÓN</td><td class="lbl">TIPO MANIFIESTO</td>
    <td class="lbl">ORIGEN DEL VIAJE</td><td class="lbl">MUNICIPIO INTERMEDIO</td><td class="lbl">DESTINO FINAL DEL VIAJE</td>
  </tr><tr>
    <td>${e(fechaRndc(m.fecha_expedicion))}</td><td>${e(c.tipoManifiesto)}</td>
    <td>${e(c.origen)}</td><td></td><td>${e(c.destino)}</td>
  </tr></table>

  <table class="grid-table"><tr>
    <td class="lbl" colspan="2">TRAYECTO EN VACIO ANTES DEL CARGUE: ORIGEN</td><td class="lbl" colspan="2">DESTINO</td>
    <td class="lbl" colspan="2">TRAYECTO EN VACIO DESPUES DEL DESCARGUE: ORIGEN</td><td class="lbl" colspan="2">DESTINO</td>
  </tr><tr>
    <td colspan="2"></td><td colspan="2"></td><td colspan="2"></td><td colspan="2"></td>
  </tr></table>

  <div class="section-title">VIA SELECCIONADA A UTILIZAR PARA LA RUTA DEL VIAJE</div>
  <table class="grid-table"><tr>
    <td class="lbl" width="20%">CODIGO VIA</td><td class="lbl">DESCRIPCION RUTA</td>
  </tr><tr>
    <td></td><td></td>
  </tr></table>

  <div class="section-title">INFORMACION DEL VEHICULO Y CONDUCTOR</div>
  <table class="grid-table"><tr>
    <td class="lbl">TITULAR DEL MANIFIESTO</td><td class="lbl">DOCUMENTO</td>
    <td class="lbl">DIRECCIÓN</td><td class="lbl">TELÉFONO</td><td class="lbl">CIUDAD</td>
  </tr><tr>
    <td>${e(nomTerc(c.titular))}</td><td>${e(c.titular?.num_id ?? '')}</td>
    <td>${e(c.titular?.direccion ?? '')}</td><td>${e(titularTel)}</td><td>${e(ciudadTexto(c.muniNombre(c.titular?.cod_municipio ?? null)))}</td>
  </tr></table>

  <table class="grid-table"><tr>
    <td class="lbl">PLACA</td><td class="lbl">MARCA</td><td class="lbl">PLACA SEMIREMOLQUE</td><td class="lbl">CONFIGURACIÓN</td>
    <td class="lbl">Peso Vacío</td><td class="lbl">PesoVacíoRemolque</td>
    <td class="lbl">No. PÓLIZA</td><td class="lbl">COMPAÑÍA SEGUROS SOAT</td><td class="lbl">F.Vencim/SOAT</td>
  </tr><tr>
    <td>${e(m.placa_vehiculo ?? '')}</td><td>${e(v.marca ?? '')}</td><td>${e(v.remolque_placa ?? '')}</td><td>${e(v.cod_configuracion ?? '')}</td>
    <td>${e(v.peso_vacio ?? '')}</td><td>${e(v.peso_vacio_remolque ?? '')}</td>
    <td>${e(v.soat_poliza ?? '')}</td><td>${e(v.soat_compania ?? '')}</td><td>${e(fechaRndc(v.soat_vencimiento))}</td>
  </tr></table>

  <table class="grid-table"><tr>
    <td class="lbl">CONDUCTOR</td><td class="lbl">DOCUMENTO</td><td class="lbl">DIRECCIÓN</td>
    <td class="lbl">TELÉFONO</td><td class="lbl">No. de LICENCIA</td><td class="lbl">CIUDAD</td>
  </tr><tr>
    <td>${e(nomTerc(c.conductor))}</td><td>${e(c.conductor?.num_id ?? '')}</td><td>${e(c.conductor?.direccion ?? '')}</td>
    <td>${e(conductorTel)}</td><td>${e(licenciaTexto(c.conductor))}</td><td>${e(ciudadTexto(c.muniNombre(c.conductor?.cod_municipio ?? null)))}</td>
  </tr>
  <tr style="color:#666;"><td class="lbl">CONDUCTOR NRO 2</td><td class="lbl">DOCUMENTO</td><td class="lbl">DIRECCIÓN CONDUCTOR 2</td>
    <td class="lbl">TELEFONO</td><td class="lbl">No. de LICENCIA</td><td class="lbl">CIUDAD CONDUCTOR 2</td></tr>
  <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </table>

  <table class="grid-table"><tr>
    <td class="lbl">POSEEDOR O TENEDOR VEHICULO</td><td class="lbl">DOCUMENTO</td>
    <td class="lbl">DIRECCIÓN</td><td class="lbl">TELEFONO</td><td class="lbl">CIUDAD</td>
  </tr><tr>
    <td>${e(nomTerc(c.tenedor))}</td><td>${e(c.tenedor?.num_id ?? '')}</td>
    <td>${e(c.tenedor?.direccion ?? '')}</td><td>${e(tenedorTel)}</td><td>${e(ciudadTexto(c.muniNombre(c.tenedor?.cod_municipio ?? null)))}</td>
  </tr></table>

  <div class="section-title">INFORMACION DE LA MERCANCIA TRANSPORTADA</div>
  <table class="grid-table"><thead><tr>
    <td class="lbl">Nro.Remesa</td><td class="lbl">UnidadMedida</td><td class="lbl">Cantidad</td><td class="lbl">Naturaleza Carga</td>
    <td class="lbl">Empaque - Producto Transportado</td>
    <td class="lbl">Información Remitente<br><span class="small">Identificación - Nombre - Direccion - Municipio</span></td>
    <td class="lbl">Información Destinatario<br><span class="small">Identificación - Nombre - Direccion - Municipio</span></td>
    <td class="lbl">Dueño Poliza</td>
  </tr></thead><tbody>${mercanciaRows}</tbody></table>

  <table class="no-border" style="margin-top:4px;"><tr>
    <td width="45%" style="vertical-align:top;">
      <div class="section-title">VALORES</div>
      <table class="grid-table">
        <tr><td class="lbl">VALOR TOTAL DEL VIAJE</td><td class="right">${money(flete)}</td></tr>
        <tr><td class="lbl">RETENCION EN LA FUENTE</td><td class="right">${money(reteFuente)}</td></tr>
        <tr><td class="lbl">RETENCION ICA</td><td class="right">${money(reteIca)}</td></tr>
        <tr><td class="lbl">RETENCION FOPAT</td><td class="right">${money(fopat)}</td></tr>
        <tr><td class="lbl">VALOR NETO A PAGAR</td><td class="right">${money(valorNeto)}</td></tr>
        <tr><td class="lbl">VALOR ANTICIPO</td><td class="right">${money(anticipo)}</td></tr>
        <tr><td class="lbl">SALDO A PAGAR</td><td class="right">${money(saldo)}</td></tr>
      </table>
    </td>
    <td width="55%" style="vertical-align:top;padding-left:4px;">
      <div class="section-title">OBSERVACIONES</div>
      <table class="grid-table">
        <tr><td class="lbl">LUGAR DE PAGO</td><td>${e(c.lugarPago)}</td><td class="lbl">FECHA DE PAGO</td><td>${e(fechaRndc(m.fecha_pago_saldo))}</td></tr>
        <tr><td class="lbl">N° Poliza</td><td>${e(emp.poliza_carga_numero ?? '')}</td><td class="lbl">Aseguradora</td><td>${e(emp.aseguradora_carga_nombre ?? '')}</td></tr>
        <tr><td class="lbl">CARGUE PAGADO POR</td><td colspan="3">${e(c.responsables[m.responsable_pago_cargue ?? ''] ?? '')}</td></tr>
        <tr><td class="lbl">DESCARGUE PAGADO POR</td><td colspan="3">${e(c.responsables[m.responsable_pago_descargue ?? ''] ?? '')}</td></tr>
        <tr><td class="lbl">FECHA DE PAGO:</td><td colspan="3"></td></tr>
      </table>
      <table class="grid-table" style="margin-top:2px;">
        <tr><td style="height:20px;">${e(m.observaciones ?? s.observaciones ?? '')}</td></tr>
      </table>
    </td>
  </tr></table>

  <table class="grid-table" style="margin-top:2px;">
    <tr><td class="lbl" width="20%">VALOR TOTAL DEL VIAJE EN LETRAS:</td><td>${e(valorEnLetras(flete))}</td></tr>
  </table>

  <table class="grid-table" style="margin-top:4px;"><tr>
    <td class="center" style="height:40px;">FIRMA Y SELLO DE LA EMPRESA</td>
    <td class="center">Firma TITULAR MANIFIESTO o ACEPTACION DIGITAL</td>
    <td class="center">Firma del CONDUCTOR o ACEPTACION DIGITAL</td>
    <td class="small" style="width:35%;">${DENUNCIA_TEXT}</td>
  </tr></table>

  </body></html>`;
}

// ==================================================================
// REMESA DE CARGA
// ==================================================================

export interface RemesaCtx {
  remesas: Row[];
  solicitud: Row;
  empresa: Row;
  opNombre: string;
  muniNombre: (cod: string | null) => string;
  terceroPorTipoNum: (tipo: string, num: string) => Row | null;
  empaquePorCodigo: (cod: string) => string;
  /** grupo_embalaje / estado_producto / peligro_secundario keyed by mercancia_codigo. */
  productoPorCodigo: (codigo: string) => Row | null;
}

/** Faithful reproduction of the official REMESA de CARGA - RNDC format. */
export function renderRemesaHtml(c: RemesaCtx): string {
  const { solicitud: s, empresa: emp } = c;
  let body = '';

  c.remesas.forEach((r, idx) => {
    if (idx > 0) body += '<div class="page-break"></div>';
    const remitente = c.terceroPorTipoNum(r.remitente_tipo_id ?? '', r.remitente_num_id ?? '');
    const destinatario = c.terceroPorTipoNum(r.destinatario_tipo_id ?? '', r.destinatario_num_id ?? '');
    const generador = c.terceroPorTipoNum(
      r.propietario_tipo_id ?? s.generador_tipo_id ?? '',
      r.propietario_num_id ?? s.generador_num_id ?? '',
    );
    const producto = c.productoPorCodigo(r.mercancia_codigo ?? '');
    const natu = NAT[r.naturaleza_carga ?? ''] ?? '';
    const estadoMerc = ESTADOS_PROD[r.estado_producto ?? producto?.estado_producto ?? ''] ?? '';
    const empq = c.empaquePorCodigo(r.tipo_empaque ?? '') || (r.tipo_empaque ?? '');
    const esPeligrosa = r.naturaleza_carga === '2';
    const esResiduo = r.naturaleza_carga === '5';

    const horasPacto = (h: unknown, m2: unknown) =>
      h != null && h !== '' ? `${h} Horas ${m2 ?? 0} Minutos` : '';

    body += `
    <table class="no-border top-header"><tr>
      <td width="14%">
        <div class="logo-box logo-mintransporte"><img src="${LOGO_MINTRANSPORTE}" style="width:24mm;"></div>
        <div class="logo-box logo-supertransporte"><img src="${LOGO_SUPERTRANSPORTE}" style="width:24mm;"></div>
      </td>
      <td width="56%">
        <div class="center" style="font-size:12px;font-weight:bold;">REMESA de CARGA - RNDC</div>
        <div class="center" style="font-size:9px;font-weight:bold;">${e(emp.razon_social ?? '')}</div>
        <div class="center" style="font-size:8px;">Nit: ${e(emp.nit ?? '')}</div>
        <div class="center" style="font-size:7.5px;">${e(emp.direccion ?? '')}</div>
        <div class="center" style="font-size:7.5px;">Tel: ${e(emp.telefono ?? '')}</div>
        <div class="center" style="font-size:7.5px;">${e(emp.municipio_nombre ?? '')}</div>
      </td>
      <td width="30%">
        <table><tr><td class="header-box">Consecutivo REMESA<br><span class="num">${e(r.num_remesa ?? '')}</span></td></tr>
        <tr><td class="header-box">Núm. AUTORIZACION<br><span class="num">${e(r.rndc_ingreso_id ?? '')}</span></td></tr></table>
      </td>
    </tr></table>

    <table class="grid-table" style="margin-top:4px;">
      <tr><td class="lbl" width="16%">Tipo de Operación:</td><td width="16%"></td>
          <td class="lbl" width="16%">Tipo Empaque:</td><td width="16%"></td>
          <td class="lbl" rowspan="2" width="36%" style="text-align:center;">Orden Servicio</td></tr>
      <tr><td colspan="2">${e(c.opNombre)}</td><td colspan="2">${e(empq)}</td></tr>
    </table>

    <table class="grid-table">
      <tr><td class="lbl" width="20%">Contratante/Generador:</td><td>${e(idTexto(generador))}</td></tr>
      <tr><td class="lbl">Nombre o Razón Social:</td><td>${e(nomTerc(generador))}</td></tr>
      <tr><td class="lbl">Direccion:</td><td>${e(generador?.direccion ?? '')}</td></tr>
    </table>

    <div class="section-title">Información de la Carga</div>
    <table class="grid-table">
      <tr><td class="lbl" width="16%">Naturaleza:</td><td width="34%">${e(natu)}</td>
          <td class="lbl" width="30%">Código Producto (Cod. Armonizada)</td><td>${e(r.mercancia_codigo ?? '')}</td></tr>
      <tr><td class="lbl">Cantidad Kilos:</td><td>${money(r.peso)}</td>
          <td class="lbl">U/M Mercancia</td><td>${e(UNIDADES_ABREV[r.unidad_medida ?? ''] ?? '')}
            &nbsp;&nbsp;<span class="lbl" style="background:none;">Cantidad:</span> ${money(r.peso)}</td></tr>
      <tr><td class="lbl">Código UN:</td><td>${e(r.codigo_un ?? producto?.codigo_un ?? '')}</td>
          <td class="lbl">Estado Producto:</td><td>${e(estadoMerc)}
            &nbsp;&nbsp;<span class="lbl" style="background:none;">Grupo Embalaje / Envase</span> ${e(producto?.grupo_embalaje ?? '')}</td></tr>
      <tr><td class="lbl">Designación</td><td colspan="3">${e(r.descripcion_producto ?? '')}</td></tr>
      <tr><td class="lbl">Descripción Residuo Peligroso</td><td colspan="3">${esResiduo ? e(producto?.alerta ?? '') : ''}</td></tr>
      <tr><td class="lbl">Caracteristica Peligrosidad</td><td colspan="3">${esPeligrosa ? e(producto?.peligro_secundario ?? '') : ''}</td></tr>
    </table>

    <table class="grid-table">
      <tr><td class="lbl section-title" colspan="2">Remitente / Lugar de Cargue:</td>
          <td class="lbl section-title" colspan="2">Destinatario / Lugar de Descargue:</td></tr>
      <tr><td class="lbl" width="14%">Nombre:</td><td width="36%">${e(nomTerc(remitente))}</td>
          <td class="lbl" width="14%">Nombre:</td><td width="36%">${e(nomTerc(destinatario))}</td></tr>
      <tr><td class="lbl">Identificación:</td><td>${e(idTexto(remitente))}</td>
          <td class="lbl">Identificación:</td><td>${e(idTexto(destinatario))}</td></tr>
      <tr><td class="lbl">Sede:</td><td>${e(sedeTexto(remitente))}</td>
          <td class="lbl">Sede:</td><td>${e(sedeTexto(destinatario))}</td></tr>
      <tr><td class="lbl">Dirección:</td><td>${e(remitente?.direccion ?? '')}</td>
          <td class="lbl">Dirección:</td><td>${e(destinatario?.direccion ?? '')}</td></tr>
      <tr><td class="lbl">Coordenadas:</td><td>Latitud: ${e(remitente?.latitud ?? '')} Longitud: ${e(remitente?.longitud ?? '')}</td>
          <td class="lbl">Coordenadas:</td><td>Latitud: ${e(destinatario?.latitud ?? '')} Longitud: ${e(destinatario?.longitud ?? '')}</td></tr>
      <tr><td class="lbl">Municipio:</td><td>${e(c.muniNombre(remitente?.cod_municipio ?? null))}</td>
          <td class="lbl">Municipio:</td><td>${e(c.muniNombre(destinatario?.cod_municipio ?? null))}</td></tr>
      <tr><td class="lbl">Fecha Hora Cita</td><td>${e(fechaRndc(r.fecha_cita_cargue))} ${e(r.hora_cita_cargue ?? '')}</td>
          <td class="lbl">Fecha Hora Cita</td><td>${e(fechaRndc(r.fecha_cita_descargue))} ${e(r.hora_cita_descargue ?? '')}</td></tr>
      <tr><td class="lbl">Tiempo Pactado</td><td>${e(horasPacto(r.horas_pacto_cargue, r.minutos_pacto_cargue))}</td>
          <td class="lbl">Tiempo Pactado</td><td>${e(horasPacto(r.horas_pacto_descargue, r.minutos_pacto_descargue))}</td></tr>
      <tr><td class="lbl">Trasbordo 1</td><td>0</td>
          <td class="lbl">Trasbordo 2</td><td>0</td></tr>
    </table>

    <table class="grid-table">
      <tr><td class="lbl" rowspan="2" width="18%"></td><td class="lbl" width="16%">Tomador<br>Póliza</td>
          <td class="lbl" width="16%">No. Póliza</td><td class="lbl" colspan="2">Aseguradora</td><td class="lbl">Fecha Vencimiento</td></tr>
      <tr><td>General</td><td colspan="4">No existe póliza</td></tr>
      <tr><td></td><td>Mercancía Peligrosa</td>
          <td>${esPeligrosa ? e(emp.poliza_carga_numero ?? '') : ''}</td>
          <td colspan="2">${esPeligrosa ? e(emp.aseguradora_carga_nombre ?? '') : ''}</td>
          <td>${esPeligrosa ? e(fechaRndc(emp.poliza_carga_vencimiento)) : ''}</td></tr>
    </table>

    <table class="grid-table" style="margin-top:2px;">
      <tr><td class="lbl" width="16%">OBSERVACIONES</td><td style="height:24px;">${e(s.observaciones ?? '')}</td></tr>
    </table>`;
  });

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>${COMMON_STYLES}
    .top-header td { border: none; vertical-align: top; }
  </style></head><body>${body}</body></html>`;
}
