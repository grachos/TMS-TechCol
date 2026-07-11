/**
 * Light TMS - Express application wiring.
 *
 * Replaces the PHP `?r=<ruta>` front controller (public/index.php) with a REST
 * API. Each PHP repository becomes a module under src/modules with its own
 * router; this file mounts them under /api.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { asyncHandler, errorMiddleware, notFound } from './http/errors.js';
import { dbDisponible } from './db/pool.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { requireAuth, requireRole } from './modules/auth/auth.middleware.js';
import { terceroRouter } from './modules/terceros/tercero.routes.js';
import { municipioRouter } from './modules/municipios/municipio.routes.js';
import { vehiculoRouter } from './modules/vehiculos/vehiculo.routes.js';
import { catalogoRouter, productoRouter } from './modules/catalogos/catalogo.routes.js';
import { empresaRouter } from './modules/empresa/empresa.routes.js';
import { solicitudRouter } from './modules/solicitudes/solicitud.routes.js';
import { colaRouter, despachoRouter, cumplidoRouter } from './modules/cola/cola.routes.js';
import { pdfManifiestoRouter, pdfRemesaRouter } from './modules/pdf/pdf.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';
import { informeRouter } from './modules/informe/informe.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { usuarioRouter } from './modules/usuarios/usuario.routes.js';

export function createApp() {
  const app = express();
  const { corsOrigins, name } = config().app;

  app.use(cors({ origin: corsOrigins.length ? corsOrigins : true }));
  app.use(express.json({ limit: '2mb' }));

  // --- Health (public) ---
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const database = await dbDisponible();
      const cfg = config();
      res.json({
        ok: true,
        app: name,
        database,
        rndc: {
          ambiente: cfg.rndc.ambiente,
          envioHabilitado: cfg.cola.envioHabilitado,
        },
      });
    }),
  );

  // --- Auth (public login, protected me) ---
  app.use('/api/auth', authRouter);

  // --- Protected API ---
  // All business modules require a valid staff JWT. Individual routes add
  // requireRole('admin') where real RNDC sending happens.
  const api = express.Router();
  api.use(requireAuth);
  api.use('/terceros', terceroRouter);
  api.use('/municipios', municipioRouter);
  api.use('/vehiculos', vehiculoRouter);
  api.use('/catalogos', catalogoRouter);
  api.use('/productos', productoRouter);
  api.use('/empresa', empresaRouter);
  api.use('/solicitudes', solicitudRouter);
  api.use('/cola', colaRouter);
  api.use('/despachos', despachoRouter);
  api.use('/cumplido', cumplidoRouter);
  api.use('/manifiesto', pdfManifiestoRouter);
  api.use('/remesa', pdfRemesaRouter);
  api.use('/stats', statsRouter);
  api.use('/informe', informeRouter);
  api.use('/chat', chatRouter);
  api.use('/usuarios', usuarioRouter);
  //   api.use('/vehiculos', vehiculoRouter) ... etc.

  app.use('/api', api);

  // 404 for anything under /api we didn't handle.
  app.use('/api', (_req, _res, next) => next(notFound('Ruta no encontrada.')));

  // --- Static frontend (production single-deploy) ---
  // Hosts like Hostinger's GitHub-import Node.js app deploy one process for the
  // whole repo; serving the built SPA here keeps frontend + API on one origin,
  // which the frontend's fetch client requires (it only ever calls relative
  // `/api/...` paths — see frontend/src/lib/api.ts). No-op if the frontend
  // wasn't built (e.g. local `npm run dev`, which uses Vite's own server).
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(errorMiddleware);
  return app;
}
