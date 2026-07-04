/**
 * Light TMS - Municipios routes.
 *   GET /api/municipios/buscar?q=   autocomplete (DIVIPOLA)
 */

import { Router } from 'express';
import { asyncHandler } from '../../http/errors.js';
import * as repo from './municipio.repo.js';

export const municipioRouter = Router();

municipioRouter.get(
  '/buscar',
  asyncHandler(async (req, res) => {
    res.json(await repo.buscar(String(req.query.q ?? '')));
  }),
);
