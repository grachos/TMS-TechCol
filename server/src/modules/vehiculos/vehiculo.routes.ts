/**
 * Light TMS - Vehículos REST routes.
 *   GET    /api/vehiculos            list (q, p)
 *   GET    /api/vehiculos/buscar     plate autocomplete
 *   GET    /api/vehiculos/detalle    ?placa= -> conductor + tenedor (despacho autofill)
 *   GET    /api/vehiculos/:id        single
 *   POST   /api/vehiculos            create
 *   PUT    /api/vehiculos/:id        update
 *   POST   /api/vehiculos/:id/registrar-rndc   (admin only)
 */

import { Router } from 'express';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import { vehiculoUpsertSchema } from './vehiculo.schema.js';
import * as repo from './vehiculo.repo.js';

export const vehiculoRouter = Router();

vehiculoRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const pagina = Math.max(1, Number.parseInt(String(req.query.p ?? '1'), 10) || 1);
    const porPagina = 10;
    const { items, total } = await repo.listarConPaginacion(q, pagina, porPagina);
    res.json({ items, total, pagina, paginas: Math.ceil(total / porPagina) });
  }),
);

vehiculoRouter.get(
  '/buscar',
  asyncHandler(async (req, res) => {
    res.json(await repo.buscar(String(req.query.q ?? '')));
  }),
);

/** GET /api/vehiculos/detalle?placa= (conductor + tenedor for despacho autofill). */
vehiculoRouter.get(
  '/detalle',
  asyncHandler(async (req, res) => {
    const det = await repo.detalle(String(req.query.placa ?? ''));
    res.json(det ?? {});
  }),
);

vehiculoRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await repo.obtener(Number(req.params.id));
    if (!v) throw notFound('Vehículo no encontrado.');
    res.json(v);
  }),
);

vehiculoRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = vehiculoUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    const id = await repo.crear(parsed.data);
    res.status(201).json({ id });
  }),
);

vehiculoRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await repo.obtener(id);
    if (!existing) throw notFound('Vehículo no encontrado.');
    const parsed = vehiculoUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    await repo.actualizar(id, parsed.data);
    res.json({ ok: true });
  }),
);

vehiculoRouter.post(
  '/:id/registrar-rndc',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const resp = await repo.registrarEnRndc(Number(req.params.id));
    if (resp.ok) res.json({ ok: true, ingresoId: resp.ingresoId });
    else res.status(422).json({ ok: false, error: `RNDC: ${resp.error}` });
  }),
);
