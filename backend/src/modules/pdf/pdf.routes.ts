/**
 * Light TMS - PDF routes (manifiesto + remesa). Replaces ?r=manifiesto.pdf /
 * remesa.pdf. Gathers the same data as index.php and renders the ported HTML to
 * a real PDF (system Chrome) or, if none is available, printable HTML.
 *
 *   GET /api/manifiesto/:id/pdf[?format=html]
 *   GET /api/remesa/:manifiestoId/pdf[?format=html]
 */

import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { asyncHandler, notFound } from '../../http/errors.js';
import { db } from '../../db/pool.js';
import * as municipioRepo from '../municipios/municipio.repo.js';
import * as catalogoRepo from '../catalogos/catalogo.repo.js';
import * as empresaRepo from '../empresa/empresa.repo.js';
import { renderManifiestoHtml, renderRemesaHtml } from './html.js';
import { buildManifiestoQrText, qrPngDataUrl } from './qr.js';
import { htmlToPdf, pdfEngineAvailable } from './render.js';

type Row = Record<string, any>;

const OPS_MANIF: Record<string, string> = { G: 'GENERAL', P: 'PAQUETEO', C: 'CONTENEDOR CARGADO', V: 'CONTENEDOR VACÍO' };
const OPS_REMESA: Record<string, string> = { G: 'General', P: 'Paqueteo', C: 'Contenedor Cargado', V: 'Contenedor Vacío' };
const RESPONSABLES: Record<string, string> = { E: 'EMPRESA DE TRANSPORTE', R: 'REMITENTE', D: 'DESTINATARIO' };

async function one(sql: string, params: unknown[]): Promise<Row | null> {
  const [rows] = await db().query<RowDataPacket[]>(sql, params);
  return (rows[0] as Row) ?? null;
}
async function many(sql: string, params: unknown[]): Promise<Row[]> {
  const [rows] = await db().query<RowDataPacket[]>(sql, params);
  return rows as Row[];
}

/** Pre-fetches terceros + municipio names so templates can look them up sync. */
async function buildLookups(pairs: [string, string][], codigos: string[]) {
  const terceroMap = new Map<string, Row>();
  for (const [tipo, num] of pairs) {
    if (!tipo || !num) continue;
    const key = `${tipo}|${num}`;
    if (terceroMap.has(key)) continue;
    const t = await one('SELECT * FROM tercero WHERE tipo_id = ? AND num_id = ?', [tipo, num]);
    if (t) terceroMap.set(key, t);
  }
  const muniMap = new Map<string, string>();
  for (const cod of codigos) {
    if (!cod || muniMap.has(cod)) continue;
    const nom = await municipioRepo.nombre(cod);
    muniMap.set(cod, nom ?? cod);
  }
  const empaques = await catalogoRepo.empaques();
  const empaqueMap = new Map(empaques.map((x) => [x.codigo, `${x.codigo} - ${x.descripcion}`] as const));

  return {
    terceroPorTipoNum: (tipo: string, num: string) => terceroMap.get(`${tipo}|${num}`) ?? null,
    muniNombre: (cod: string | null) => (cod ? (muniMap.get(cod) ?? cod) : '—'),
    empaquePorCodigo: (cod: string) => empaqueMap.get(cod) ?? '',
  };
}

async function send(res: import('express').Response, html: string, filename: string, format: string) {
  if (format !== 'html' && pdfEngineAvailable()) {
    try {
      const pdf = await htmlToPdf(html);
      res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`);
      res.send(pdf);
      return;
    } catch (e) {
      // Chrome unavailable/flaky (e.g. sandboxed env): fall back to printable HTML.
      // eslint-disable-next-line no-console
      console.warn('[pdf] Chrome falló, sirviendo HTML imprimible:', e instanceof Error ? e.message : e);
    }
  }
  res.type('text/html; charset=utf-8').send(html);
}

export const pdfManifiestoRouter = Router();
export const pdfRemesaRouter = Router();

/** GET /api/manifiesto/:id/pdf */
pdfManifiestoRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const manifiestoId = Number(req.params.id);
    const m = await one('SELECT * FROM manifiesto WHERE id = ?', [manifiestoId]);
    if (!m) throw notFound('Manifiesto no encontrado.');
    const remesas = await many(
      `SELECT r.* FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id WHERE mr.manifiesto_id = ? ORDER BY r.id`,
      [manifiestoId],
    );
    if (remesas.length === 0) throw notFound('No hay remesas asociadas.');
    const s = (await one('SELECT * FROM solicitud_servicio WHERE id = ?', [m.solicitud_id])) ?? {};
    const v = (await one('SELECT * FROM vehiculo WHERE placa = ?', [m.placa_vehiculo])) ?? {};
    const empresa = await empresaRepo.obtener();

    const pairs: [string, string][] = [
      [m.titular_tipo_id, m.titular_num_id],
      [m.conductor_tipo_id, m.conductor_num_id],
      [v.tenedor_tipo_id, v.tenedor_num_id],
    ];
    const codigos: string[] = [m.municipio_origen, m.municipio_destino, m.municipio_pago_saldo];
    for (const r of remesas) {
      pairs.push([r.remitente_tipo_id, r.remitente_num_id], [r.destinatario_tipo_id, r.destinatario_num_id]);
      const gt = r.propietario_tipo_id ?? s.generador_tipo_id;
      const gn = r.propietario_num_id ?? s.generador_num_id;
      if (gt && gn) pairs.push([gt, gn]);
    }
    // Resolve titular/conductor municipio names too (their cod_municipio).
    const lk = await buildLookups(pairs, [
      ...codigos,
      ...(await (async () => {
        const t = await one('SELECT cod_municipio FROM tercero WHERE tipo_id = ? AND num_id = ?', [m.titular_tipo_id, m.titular_num_id]);
        const c = await one('SELECT cod_municipio FROM tercero WHERE tipo_id = ? AND num_id = ?', [m.conductor_tipo_id, m.conductor_num_id]);
        const te = await one('SELECT cod_municipio FROM tercero WHERE tipo_id = ? AND num_id = ?', [v.tenedor_tipo_id, v.tenedor_num_id]);
        return [t?.cod_municipio, c?.cod_municipio, te?.cod_municipio].filter(Boolean) as string[];
      })()),
    ]);

    const titular = lk.terceroPorTipoNum(m.titular_tipo_id ?? '', m.titular_num_id ?? '');
    const conductor = lk.terceroPorTipoNum(m.conductor_tipo_id ?? '', m.conductor_num_id ?? '');
    const tenedor = lk.terceroPorTipoNum(v.tenedor_tipo_id ?? '', v.tenedor_num_id ?? '');
    // conductor's cod_municipio may need its own name.
    const origen = lk.muniNombre(m.municipio_origen ?? null);
    const destino = lk.muniNombre(m.municipio_destino ?? null);
    const lugarPago = lk.muniNombre(m.municipio_pago_saldo ?? null);

    let configDsc = '';
    if (v.cod_configuracion) {
      const cfgs = await catalogoRepo.configuraciones();
      const cfg = cfgs.find((x) => x.codigo === v.cod_configuracion);
      if (cfg) configDsc = `${cfg.nombre} - ${cfg.descripcion}`;
    }

    let qrImg = '';
    if (m.rndc_ingreso_id) {
      const qrText = buildManifiestoQrText({
        mec: m.rndc_ingreso_id,
        fechaExpedicion: m.fecha_expedicion ?? null,
        placa: m.placa_vehiculo ?? '',
        remolque: v.remolque_placa ?? '',
        config: v.cod_configuracion ?? '',
        origen,
        destino,
        descripcionProducto: remesas[0]?.descripcion_producto ?? '',
        conductorNumId: m.conductor_num_id ?? '',
        razonSocial: empresa.razon_social ?? '',
        observaciones: s.observaciones ?? '',
        seguridadqr: m.seguridadqr ?? '',
      });
      qrImg = await qrPngDataUrl(qrText);
    }

    const html = renderManifiestoHtml({
      m,
      remesas,
      solicitud: s,
      vehiculo: v,
      empresa,
      tipoManifiesto: OPS_MANIF[m.operacion_transporte ?? ''] ?? (m.operacion_transporte ?? '—'),
      responsables: RESPONSABLES,
      configDsc,
      origen,
      destino,
      lugarPago,
      titular,
      conductor,
      tenedor,
      qrImg,
      muniNombre: lk.muniNombre,
      terceroPorTipoNum: lk.terceroPorTipoNum,
      empaquePorCodigo: lk.empaquePorCodigo,
    });

    await send(res, html, `manifiesto_${m.num_manifiesto ?? manifiestoId}`, String(req.query.format ?? ''));
  }),
);

/** GET /api/remesa/:manifiestoId/pdf */
pdfRemesaRouter.get(
  '/:manifiestoId/pdf',
  asyncHandler(async (req, res) => {
    const manifiestoId = Number(req.params.manifiestoId);
    const remesas = await many(
      `SELECT r.* FROM remesa r JOIN manifiesto_remesa mr ON mr.remesa_id = r.id WHERE mr.manifiesto_id = ? ORDER BY r.id`,
      [manifiestoId],
    );
    if (remesas.length === 0) throw notFound('No hay remesas asociadas.');
    const s = (await one('SELECT * FROM solicitud_servicio WHERE id = ?', [remesas[0]!.solicitud_id])) ?? {};
    const empresa = await empresaRepo.obtener();

    const pairs: [string, string][] = [];
    const codigos: string[] = [];
    for (const r of remesas) {
      pairs.push([r.remitente_tipo_id, r.remitente_num_id], [r.destinatario_tipo_id, r.destinatario_num_id]);
      const gt = r.propietario_tipo_id ?? s.generador_tipo_id;
      const gn = r.propietario_num_id ?? s.generador_num_id;
      if (gt && gn) pairs.push([gt, gn]);
      codigos.push(r.municipio_cargue, r.municipio_descargue);
    }
    const lk = await buildLookups(pairs, codigos);
    // Remitente/destinatario municipios come from the tercero's cod_municipio.
    const extraCods = new Set<string>();
    for (const r of remesas) {
      const remt = lk.terceroPorTipoNum(r.remitente_tipo_id ?? '', r.remitente_num_id ?? '');
      const dest = lk.terceroPorTipoNum(r.destinatario_tipo_id ?? '', r.destinatario_num_id ?? '');
      if (remt?.cod_municipio) extraCods.add(remt.cod_municipio);
      if (dest?.cod_municipio) extraCods.add(dest.cod_municipio);
    }
    const lk2 = await buildLookups(pairs, [...codigos, ...extraCods]);

    // Producto lookup (grupo_embalaje / peligro_secundario / alerta for dangerous goods).
    const productoMap = new Map<string, Row>();
    for (const r of remesas) {
      const codigo = r.mercancia_codigo;
      if (!codigo || productoMap.has(codigo)) continue;
      const p = await catalogoRepo.productoPorCodigo(codigo);
      if (p) productoMap.set(codigo, p);
    }

    const html = renderRemesaHtml({
      remesas,
      solicitud: s,
      empresa,
      opNombre: OPS_REMESA[remesas[0]!.operacion_transporte ?? ''] ?? (remesas[0]!.operacion_transporte ?? '—'),
      muniNombre: lk2.muniNombre,
      terceroPorTipoNum: lk2.terceroPorTipoNum,
      empaquePorCodigo: lk2.empaquePorCodigo,
      productoPorCodigo: (codigo: string) => productoMap.get(codigo) ?? null,
    });

    await send(res, html, `remesas_${s.consecutivo ?? 'solicitud'}`, String(req.query.format ?? ''));
  }),
);
