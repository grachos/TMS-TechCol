/**
 * Light TMS - Terceros REST routes. Replaces the ?r=terceros* PHP endpoints.
 *
 *   GET    /api/terceros            list (q, p)
 *   GET    /api/terceros/buscar     autocomplete (q, solo_conductor)
 *   GET    /api/terceros/resumen    count not yet registered in RNDC (nav badge polling)
 *   GET    /api/terceros/:id        single
 *   POST   /api/terceros            create
 *   PUT    /api/terceros/:id        update
 *   POST   /api/terceros/:id/registrar-rndc   register in RNDC (admin only)
 */

import { Router } from 'express';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { requireRole, requirePagina } from '../auth/auth.middleware.js';
import { terceroUpsertSchema } from './tercero.schema.js';
import * as repo from './tercero.repo.js';

export const terceroRouter = Router();

/** GET /api/terceros?q=&p= */
terceroRouter.get(
  '/',
  requirePagina('terceros'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const pagina = Math.max(1, Number.parseInt(String(req.query.p ?? '1'), 10) || 1);
    const porPagina = 10;
    const { items, total } = await repo.listarConPaginacion(q, pagina, porPagina);
    res.json({ items, total, pagina, paginas: Math.ceil(total / porPagina) });
  }),
);

/** GET /api/terceros/buscar?q=&solo_conductor=1 */
terceroRouter.get(
  '/buscar',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const solo = Boolean(req.query.solo_conductor);
    res.json(await repo.buscar(q, solo));
  }),
);

/**
 * GET /api/terceros/resumen — count of terceros not yet registered in the RNDC.
 * Cheap enough to poll from the nav badge on every authenticated page.
 */
terceroRouter.get(
  '/resumen',
  asyncHandler(async (_req, res) => {
    res.json({ pendientes: await repo.contarPendientes() });
  }),
);

/** GET /api/terceros/:id */
terceroRouter.get(
  '/:id',
  requirePagina('terceros'),
  asyncHandler(async (req, res) => {
    const t = await repo.obtener(Number(req.params.id));
    if (!t) throw notFound('Tercero no encontrado.');
    res.json(t);
  }),
);

/** POST /api/terceros */
terceroRouter.post(
  '/',
  requirePagina('terceros'),
  asyncHandler(async (req, res) => {
    const parsed = terceroUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    const id = await repo.crear(parsed.data);
    res.status(201).json({ id });
  }),
);

/** PUT /api/terceros/:id */
terceroRouter.put(
  '/:id',
  requirePagina('terceros'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await repo.obtener(id);
    if (!existing) throw notFound('Tercero no encontrado.');
    const parsed = terceroUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    await repo.actualizar(id, parsed.data);
    res.json({ ok: true });
  }),
);

/** POST /api/terceros/:id/registrar-rndc  (real RNDC send: admin only) */
terceroRouter.post(
  '/:id/registrar-rndc',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const resp = await repo.registrarEnRndc(Number(req.params.id));
    if (resp.ok) {
      res.json({
        ok: true,
        ingresoId: resp.ingresoId,
        duplicado: resp.duplicado,
        mensaje: resp.duplicado ? 'El tercero ya estaba registrado en el RNDC con los mismos datos.' : undefined,
      });
    } else {
      res.status(422).json({ ok: false, error: `RNDC: ${resp.error}` });
    }
  }),
);
