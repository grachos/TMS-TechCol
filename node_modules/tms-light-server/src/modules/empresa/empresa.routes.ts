/**
 * Light TMS - Empresa (own company) routes.
 *   GET /api/empresa   current company data
 *   PUT /api/empresa   save (admin only — affects RNDC identity + consecutivos)
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest } from '../../http/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import * as repo from './empresa.repo.js';

export const empresaRouter = Router();

const empresaSchema = z.object({
  tipo_id: z.enum(['N', 'C']).default('N'),
  nit: z.string().trim().min(1, 'El NIT es obligatorio.'),
  razon_social: z.string().trim().optional().nullable(),
  nro_poliza: z.string().trim().optional().nullable(),
  emf: z.string().trim().optional().nullable(),
  consecutivo_remesa: z.string().trim().optional(),
  consecutivo_manifiesto: z.string().trim().optional(),
});

empresaRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await repo.obtener());
  }),
);

empresaRouter.put(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const parsed = empresaSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    await repo.guardar(parsed.data);
    res.json({ ok: true });
  }),
);
