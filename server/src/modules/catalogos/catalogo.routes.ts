/**
 * Light TMS - Catalog + producto routes.
 *   GET  /api/catalogos/configuraciones | /empaques | /carrocerias
 *   GET  /api/productos            list (q, p)
 *   GET  /api/productos/buscar     autocomplete
 *   GET  /api/productos/:codigo    single
 *   PUT  /api/productos/:codigo    update codigo_un + estado_producto
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import * as repo from './catalogo.repo.js';

export const catalogoRouter = Router();

catalogoRouter.get('/configuraciones', asyncHandler(async (_req, res) => res.json(await repo.configuraciones())));
catalogoRouter.get('/empaques', asyncHandler(async (_req, res) => res.json(await repo.empaques())));
catalogoRouter.get('/carrocerias', asyncHandler(async (_req, res) => res.json(await repo.carrocerias())));

const productoUpdateSchema = z.object({
  codigo_un: z.string().trim().optional().nullable(),
  estado_producto: z.string().trim().optional().nullable(),
});

export const productoRouter = Router();

/** GET /api/productos?q=&p= */
productoRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const pagina = Math.max(1, Number.parseInt(String(req.query.p ?? '1'), 10) || 1);
    const porPagina = 10;
    const { items, total } = await repo.listarProductos(q, pagina, porPagina);
    res.json({ items, total, pagina, paginas: Math.ceil(total / porPagina) });
  }),
);

/** GET /api/productos/buscar?q= */
productoRouter.get(
  '/buscar',
  asyncHandler(async (req, res) => {
    res.json(await repo.buscarProductos(String(req.query.q ?? '')));
  }),
);

/** GET /api/productos/:codigo */
productoRouter.get(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const p = await repo.productoPorCodigo(String(req.params.codigo));
    if (!p) throw notFound('Producto no encontrado.');
    res.json(p);
  }),
);

/** PUT /api/productos/:codigo */
productoRouter.put(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const codigo = String(req.params.codigo);
    const existing = await repo.productoPorCodigo(codigo);
    if (!existing) throw notFound('Producto no encontrado.');
    const parsed = productoUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    await repo.actualizarProducto(codigo, parsed.data);
    res.json({ ok: true });
  }),
);
