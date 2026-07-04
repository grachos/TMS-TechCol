/**
 * Light TMS - PDF HTML templates. Faithful ports of src/vistas/manifiesto_pdf.php
 * and remesa_pdf.php (same markup/CSS, so the output matches the Dompdf layout).
 */

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
  '1': 'NORMAL',
  '2': 'PELIGROSA',
  '3': 'EXTRADIMENSIONADA',
  '4': 'EXTRAPESADA',
  '5': 'DESECHO PELIGROSO',
  '6': 'SEMOVIENTES',
  '7': 'REFRIGERADA',
};
const ESTADOS_PROD: Record<string, string> = { L: 'Líquido', S: 'Sólido/semi-sólido', G: 'Gaseoso' };

/** number_format($v, 2, ',', '.'). */
function money(v: unknown): string {
  const n = Number(v ?? 0) || 0;
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const nomTerc = (t: Row | null): string => {
  if (!t) return '—';
  return (
    [t.nombre, t.primer_apellido, t.segundo_apellido].filter(Boolean).join(' ').trim() || (t.nombre_completo ?? '—')
  );
};

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
  qrImg: string; // data URL or ''
  muniNombre: (cod: string | null) => string;
  terceroPorTipoNum: (tipo: string, num: string) => Row | null;
  empaquePorCodigo: (cod: string) => string;
}

/** Port of manifiesto_pdf.php. */
export function renderManifiestoHtml(c: ManifiestoCtx): string {
  const { m, remesas, solicitud: s, vehiculo: v, empresa: emp } = c;
  const flete = Number(m.valor_flete_pactado ?? 0) || 0;
  const reteFuente = Number(m.retencion_fuente ?? 0) || 0;
  const reteIca = Number(m.retencion_ica ?? 0) || 0;
  const fopat = Number(m.fopat ?? 0) || 0;
  const anticipo = Number(m.valor_anticipo ?? 0) || 0;
  const saldo = flete - reteFuente - reteIca - fopat - anticipo;
  const autoriz = m.rndc_ingreso_id ?? '';

  let remesasRows = '';
  for (const rem of remesas) {
    const natu = NAT[rem.naturaleza_carga ?? ''] ?? '—';
    const empq = c.empaquePorCodigo(rem.tipo_empaque ?? '') || (rem.tipo_empaque ?? '—');
    const remt = c.terceroPorTipoNum(rem.remitente_tipo_id ?? '', rem.remitente_num_id ?? '');
    const dest = c.terceroPorTipoNum(rem.destinatario_tipo_id ?? '', rem.destinatario_num_id ?? '');
    const genT = rem.propietario_tipo_id ?? s.generador_tipo_id ?? null;
    const genN = rem.propietario_num_id ?? s.generador_num_id ?? null;
    const gen = genT && genN ? c.terceroPorTipoNum(genT, genN) : null;
    remesasRows +=
      '<tr>' +
      `<td>${e(rem.num_remesa ?? '—')}</td>` +
      `<td>${e(String(rem.peso ?? '—'))} ${e(rem.unidad_medida ?? 'Kg')}</td>` +
      `<td>${e(natu)} / ${e(empq)}</td>` +
      `<td>${e(rem.descripcion_producto ?? '—')}</td>` +
      `<td>${e(nomTerc(remt))}<br><strong>NIT:</strong> ${e((remt?.tipo_id ?? '') + ' ' + (remt?.num_id ?? '—'))}</td>` +
      `<td>${e(nomTerc(dest))}<br><strong>NIT:</strong> ${e((dest?.tipo_id ?? '') + ' ' + (dest?.num_id ?? '—'))}</td>` +
      '</tr>' +
      '<tr>' +
      `<td colspan="6"><strong>Dueño Póliza Carga:</strong> ${e(rem.dueno_poliza ?? '—')} &nbsp;|&nbsp; <strong>Generador:</strong> ${e(nomTerc(gen))}</td>` +
      '</tr>';
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    body { font-family: Helvetica, Arial, sans-serif; font-size: 9px; color: #111; line-height: 1.25; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    th, td { border: 1px solid #777; padding: 3px; text-align: left; vertical-align: top; }
    th { background-color: #e5e5e5; font-weight: bold; font-size: 8px; text-transform: uppercase; }
    .header-box { border: 2px solid #000; padding: 5px; text-align: center; background-color: #f9f9f9; }
    .section-header { background-color: #111; color: #fff; padding: 3px; font-weight: bold; text-transform: uppercase; font-size: 9px; margin-top: 6px; margin-bottom: 3px; }
    .legal-footer { font-size: 7px; color: #444; border: 1px dashed #999; padding: 5px; text-align: justify; margin-top: 8px; }
  </style></head><body>
    <table style="border:none;"><tr style="border:none;">
      <td width="20%" style="border:none;text-align:center;vertical-align:middle;">${c.qrImg ? `<img src="${c.qrImg}" style="width:30mm;height:30mm;">` : ''}</td>
      <td width="50%" style="border:none;">
        <div style="font-size:7px;font-weight:bold;color:#333;">Vigilado Super Transporte</div>
        <div style="font-size:11px;font-weight:bold;">${e(emp.razon_social ?? '')}</div>
        <div><strong>NIT:</strong> ${e(emp.nit ?? '')}</div>
        <div style="font-size:9px;font-weight:bold;margin-top:3px;">MANIFIESTO ELECTRÓNICO DE CARGA</div>
      </td>
      <td width="30%" style="border:none;"><div class="header-box">
        <strong>MANIFIESTO:</strong><br><span style="color:blue;font-size:10px;">${e(m.num_manifiesto ?? '')}</span><br>
        <strong>AUTORIZACIÓN:</strong><br><span style="color:red;font-size:10px;">${e(autoriz || '—')}</span><br>
        <span style="font-size:8px;">F. Expedición: ${e(m.fecha_expedicion ?? '')}</span>
      </div></td>
    </tr></table>

    <table><tr>
      <th>Origen del Viaje</th><td>${e(c.origen)}</td>
      <th>Destino Final</th><td>${e(c.destino)}</td>
      <th>Tipo Manifiesto</th><td>${e(c.tipoManifiesto)}</td>
    </tr></table>

    <div class="section-header">Titular del Manifiesto / Poseedor o Tenedor Vehículo</div>
    <table>
      <tr><th>Titular:</th><td colspan="3"><strong>${e(nomTerc(c.titular))}</strong></td><th>Documento:</th><td>${e((c.titular?.tipo_id ?? '') + ' ' + (c.titular?.num_id ?? '—'))}</td></tr>
      <tr><th>Dirección:</th><td colspan="3">${e(c.titular?.direccion ?? '—')}</td><th>Teléfono:</th><td>${e(c.titular?.telefono ?? '—')}</td></tr>
      <tr><th>Ciudad:</th><td colspan="5">${e(c.muniNombre(c.titular?.cod_municipio ?? null))}</td></tr>
    </table>

    <div class="section-header">Información Técnica del Vehículo y Seguros</div>
    <table>
      <tr><th>Placa</th><td><strong>${e(m.placa_vehiculo ?? '')}</strong></td><th>Configuración</th><td>${e(c.configDsc || v.cod_configuracion || '—')}</td><th>Placa Remolque</th><td>${e(v.remolque_placa ?? '—')}</td></tr>
      <tr><th>Peso Vacío Vehículo</th><td>${e(String(v.peso_vacio ?? '—'))}</td><th colspan="4">&nbsp;</th></tr>
    </table>

    <div class="section-header">Personal de Tripulación (Conductores)</div>
    <table>
      <tr><th width="15%">Conductor 1:</th><td width="35%"><strong>${e(nomTerc(c.conductor))}</strong></td><th width="15%">Documento / Licencia:</th><td width="35%">${e((c.conductor?.tipo_id ?? '') + ' ' + (c.conductor?.num_id ?? '—'))} / ${e(c.conductor?.num_licencia ?? '—')}</td></tr>
      <tr><th>Dirección / Tel:</th><td>${e(c.conductor?.direccion ?? '—')} - ${e(c.conductor?.telefono ?? '—')}</td><th>Ciudad:</th><td>${e(c.muniNombre(c.conductor?.cod_municipio ?? null))}</td></tr>
      <tr style="color:#666;"><th>Conductor 2:</th><td>NINGUNO</td><th>Documento / Licencia:</th><td>&nbsp;</td></tr>
    </table>

    <div class="section-header">Información de la Mercancía Transportada</div>
    <table><thead><tr>
      <th>Nro. Remesa</th><th>Cant/UM</th><th>Naturaleza / Empaque</th><th>Producto Transportado</th><th>Remitente / NIT</th><th>Destinatario / NIT</th>
    </tr></thead><tbody>${remesasRows}</tbody></table>

    <div class="section-header">Liquidación de Valores de Flete</div>
    <table>
      <tr><th>Valor Total del Viaje:</th><td style="text-align:right;font-weight:bold;">$ ${money(flete)}</td><th>Valor Anticipo:</th><td style="text-align:right;">$ ${money(anticipo)}</td></tr>
      <tr><th>Retención en la Fuente:</th><td style="text-align:right;color:red;">$ ${money(reteFuente)}</td><th>Retención ICA:</th><td style="text-align:right;color:red;">$ ${money(reteIca)}</td></tr>
      <tr><th>Retención FOPAT:</th><td style="text-align:right;">$ ${money(fopat)}</td><th>Saldo Neto a Pagar:</th><td style="text-align:right;font-weight:bold;color:green;font-size:10px;">$ ${money(saldo)}</td></tr>
      <tr><th>Lugar de Pago:</th><td>${e(c.lugarPago)}</td><th>Costos Cargue / Descargue:</th><td>Cargue: ${e(c.responsables[m.responsable_pago_cargue ?? ''] ?? '—')} | Descargue: ${e(c.responsables[m.responsable_pago_descargue ?? ''] ?? '—')}</td></tr>
    </table>

    <table><tr><th>Observaciones de Control:</th><td>${e(s.observaciones ?? '')}</td></tr></table>

    <div class="legal-footer">La impresión en soporte cartular (papel) de este acto administrativo producido por medios electrónicos en cumplimiento de la ley 527 de 1999 (Artículos 6 a 13) y de la ley 962 de 2005 (Artículo 6), es una reproducción del documento original que se encuentra en formato electrónico.</div>
  </body></html>`;
}

export interface RemesaCtx {
  remesas: Row[];
  solicitud: Row;
  empresa: Row;
  opNombre: string;
  muniNombre: (cod: string | null) => string;
  terceroPorTipoNum: (tipo: string, num: string) => Row | null;
  empaquePorCodigo: (cod: string) => string;
}

/** Port of remesa_pdf.php. */
export function renderRemesaHtml(c: RemesaCtx): string {
  const { solicitud: s, empresa: emp } = c;
  let body = '';
  c.remesas.forEach((r, idx) => {
    if (idx > 0) body += '<div class="page-break"></div>';
    const remitente = c.terceroPorTipoNum(r.remitente_tipo_id ?? '', r.remitente_num_id ?? '');
    const destinatario = c.terceroPorTipoNum(r.destinatario_tipo_id ?? '', r.destinatario_num_id ?? '');
    const generador = c.terceroPorTipoNum(r.propietario_tipo_id ?? s.generador_tipo_id ?? '', r.propietario_num_id ?? s.generador_num_id ?? '');
    const natu = NAT[r.naturaleza_carga ?? ''] ?? '—';
    const estadoMerc = ESTADOS_PROD[r.estado_producto ?? ''] ?? (r.estado_producto ?? '');
    const empq = c.empaquePorCodigo(r.tipo_empaque ?? '') || (r.tipo_empaque ?? '—');
    body += `
    <table style="border:none;"><tr style="border:none;">
      <td width="60%" style="border:none;">
        <div style="font-size:8px;font-weight:bold;">Transporte Vigilado Super Transporte</div>
        <div style="font-size:13px;font-weight:bold;">${e(emp.razon_social ?? '')}</div>
        <div><strong>NIT:</strong> ${e(emp.nit ?? '')}</div>
      </td>
      <td width="40%" style="border:none;"><div class="header-box">
        <strong style="font-size:14px;">REMESA #${idx + 1}</strong><br>
        <strong>CONSECUTIVO REMESA:</strong> <span style="color:red;font-size:12px;">${e(r.num_remesa ?? '')}</span><br>
        <span style="font-size:9px;">NÚMERO AUTORIZACIÓN: ${e(r.rndc_ingreso_id ?? '—')}</span>
      </div></td>
    </tr></table>

    <table><tr>
      <th>Tipo de Operación:</th><td>${e(c.opNombre)}</td>
      <th>Tipo de Empaque:</th><td>${e(empq)}</td>
      <th>Orden de servicio generador:</th><td>${e(s.consecutivo ?? '—')}</td>
    </tr></table>

    <div class="section-header">Propietario / Contratante / Generador</div>
    <table>
      <tr><th>Nombre/Razón Social:</th><td colspan="3">${e(nomTerc(generador))}</td></tr>
      <tr><th>Identificación:</th><td>${e((generador?.tipo_id ?? '') + ' ' + (generador?.num_id ?? '—'))}</td><th>Teléfono contratante:</th><td>${e(generador?.telefono ?? '—')}</td></tr>
      <tr><th>E-mail contratante:</th><td colspan="3">${e(generador?.email ?? '—')}</td></tr>
    </table>

    <table class="col-double"><tr>
      <td>
        <div class="section-header">Remitente / Lugar de Cargue</div>
        <table>
          <tr><th>Tipo ID / Número:</th><td>${e((remitente?.tipo_id ?? '') + ' - ' + (remitente?.num_id ?? '—'))}</td></tr>
          <tr><th>Dirección:</th><td>${e(remitente?.direccion ?? '—')}</td></tr>
          <tr><th>Municipio:</th><td>${e(c.muniNombre(remitente?.cod_municipio ?? null))}</td></tr>
          <tr><th>Fecha Cita / Hora:</th><td>${e(r.fecha_cita_cargue ?? '')} @ ${e(r.hora_cita_cargue ?? '')}</td></tr>
        </table>
      </td>
      <td>
        <div class="section-header">Destinatario / Lugar de Descargue</div>
        <table>
          <tr><th>Tipo ID / Número:</th><td>${e((destinatario?.tipo_id ?? '') + ' - ' + (destinatario?.num_id ?? '—'))}</td></tr>
          <tr><th>Dirección:</th><td>${e(destinatario?.direccion ?? '—')}</td></tr>
          <tr><th>Municipio:</th><td>${e(c.muniNombre(destinatario?.cod_municipio ?? null))}</td></tr>
          <tr><th>Fecha Cita / Hora:</th><td>${e(r.fecha_cita_descargue ?? '')} @ ${e(r.hora_cita_descargue ?? '')}</td></tr>
        </table>
      </td>
    </tr></table>

    <div class="section-header">Información de la Carga</div>
    <table>
      <tr><th>Naturaleza Carga:</th><td>${e(natu)}</td><th>Código Producto (Armonizado):</th><td>${e(r.mercancia_codigo ?? '—')}</td></tr>
      <tr><th>Cantidad Kilos:</th><td>${e(String(r.peso ?? '—'))} kg</td><th>U/M Mercancía / Cantidad:</th><td>${e(r.unidad_medida ?? '—')} [Cant: ${e(String(r.cantidad_cargada ?? '—'))}]</td></tr>
      <tr><th>Código UN (Naciones Unidas):</th><td>${e(r.codigo_un ?? '—')}</td><th>Estado del Envase:</th><td>${e(estadoMerc || '—')}</td></tr>
      <tr><th>Designación Mercancía:</th><td colspan="3">${e(r.descripcion_producto ?? '—')}</td></tr>
    </table>

    <div class="section-header">Seguro de la Mercancía</div>
    <table><thead><tr><th>Tomador</th><th>Número Póliza</th></tr></thead>
      <tbody><tr><td>${e(r.dueno_poliza ?? '—')}</td><td>${e(emp.nro_poliza ?? '—')}</td></tr></tbody></table>

    <div class="section-header">Observaciones</div>
    <table><tr><td style="height:35px;font-size:11px;"><strong>${e(s.observaciones ?? '')}</strong></td></tr></table>`;
  });

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #222; line-height: 1.3; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #999; padding: 4px; text-align: left; vertical-align: top; }
    th { background-color: #eee; font-weight: bold; font-size: 9px; }
    .header-box { border: 2px solid #000; padding: 8px; text-align: center; background-color: #f2f2f2; }
    .section-header { background-color: #222; color: #fff; padding: 4px; font-weight: bold; text-transform: uppercase; font-size: 10px; margin-top: 10px; margin-bottom: 4px; }
    .col-double { width: 100%; border: none; } .col-double > tbody > tr > td { width: 50%; border: none; padding: 0 4px; vertical-align: top; }
    .page-break { page-break-before: always; }
  </style></head><body>${body}</body></html>`;
}
