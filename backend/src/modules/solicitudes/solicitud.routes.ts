/**
 * Light TMS - Solicitud + despacho routes. Replaces ?r=solicitud* / despacho*.
 *   GET  /api/solicitudes             list (q, p, desde, hasta)
 *   GET  /api/solicitudes/:id         solicitud + manifiesto + remesas
 *   POST /api/solicitudes             create
 *   PUT  /api/solicitudes/:id         update (only 'borrador')
 *   POST /api/solicitudes/:id/despachar   confirm dispatch (enqueues; operador OK)
 */

import { Router } from 'express';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { validarProductoPeligrosa } from '../../util/validaciones.js';
import { pesoTotalDe } from '../../util/pesoSolicitud.js';
import * as repo from './solicitud.repo.js';

export const solicitudRouter = Router();

solicitudRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const pagina = Math.max(1, Number.parseInt(String(req.query.p ?? '1'), 10) || 1);
    const desde = req.query.desde ? String(req.query.desde) : null;
    const hasta = req.query.hasta ? String(req.query.hasta) : null;
    const porPagina = 10;
    const { items, total } = await repo.listarConPaginacion(q, pagina, porPagina, desde, hasta);
    res.json({ items, total, pagina, paginas: Math.ceil(total / porPagina) });
  }),
);

solicitudRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const manifiestoId = req.query.manifiesto_id ? Number(req.query.manifiesto_id) : null;
    const data = await repo.obtener(Number(req.params.id), manifiestoId);
    if (!data) throw notFound('Solicitud no encontrada.');
    res.json(data);
  }),
);

solicitudRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const err = await validarProductoPeligrosa(
      String(req.body?.mercancia_codigo ?? ''),
      String(req.body?.naturaleza_carga ?? ''),
    );
    if (err) throw badRequest(err);
    const id = await repo.crear(req.body ?? {});
    res.status(201).json({ id });
  }),
);

solicitudRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = await repo.obtener(id);
    if (!data) throw notFound('Solicitud no encontrada.');
    if (data.solicitud.estado !== 'borrador') {
      throw badRequest('La solicitud solo se puede editar en estado borrador.');
    }
    const err = await validarProductoPeligrosa(
      String(req.body?.mercancia_codigo ?? ''),
      String(req.body?.naturaleza_carga ?? ''),
    );
    if (err) throw badRequest(err);
    await repo.actualizar(id, req.body ?? {});
    res.json({ ok: true });
  }),
);

/** POST /api/solicitudes/:id/despachar — confirm dispatch (enqueues, no live send). */
solicitudRouter.post(
  '/:id/despachar',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = await repo.obtener(id);
    if (!data) throw notFound('Solicitud no encontrada.');
    if (data.solicitud.estado === 'despachada') throw badRequest('La solicitud ya fue despachada.');
    if (Number(data.solicitud.cantidad_vehiculos ?? 1) < 1) {
      throw badRequest('Ya no quedan vehículos por despachar en esta solicitud.');
    }
    if (!req.body?.placa_vehiculo || !req.body?.conductor_num_id) {
      throw badRequest('Placa y conductor son obligatorios para despachar.');
    }

    // Weight budget: don't let a dispatcher over-allocate more kg across
    // despachos than the solicitud actually declared.
    const pesoTotal = Number(data.solicitud.peso ?? 0);
    if (pesoTotal > 0) {
      const pesoDisponible = Number(data.solicitud.peso_disponible ?? pesoTotal);
      if (pesoDisponible <= 0) {
        throw badRequest(
          `Ya se agotó el peso disponible de esta solicitud (${pesoTotal.toLocaleString('es-CO')} kg). No es posible despachar más remesas.`,
        );
      }
      const remesasBody = Array.isArray(req.body?.remesas) ? req.body.remesas : [];
      // No custom remesas given -> confirmarDespacho() seeds one default
      // remesa that inherits the solicitud's full peso.
      const pesoNuevo = remesasBody.length > 0 ? pesoTotalDe(remesasBody) : pesoTotal;
      if (pesoNuevo - pesoDisponible > 0.001) {
        throw badRequest(
          `El peso de las remesas (${pesoNuevo.toLocaleString('es-CO')} kg) supera el peso disponible ` +
            `(${pesoDisponible.toLocaleString('es-CO')} kg) de esta solicitud.`,
        );
      }
    }

    await repo.confirmarDespacho(id, req.body);
    res.json({ ok: true });
  }),
);
