/**
 * Light TMS - Web Push subscription endpoints.
 *
 *   GET  /api/push/public-key   VAPID public key (frontend needs it to subscribe)
 *   POST /api/push/subscribe    save/refresh the caller's browser subscription
 *   POST /api/push/unsubscribe  remove a subscription by endpoint
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest } from '../../http/errors.js';
import { config } from '../../config/env.js';
import { guardarSuscripcion, eliminarSuscripcion } from './push.repo.js';

export const pushRouter = Router();

pushRouter.get(
  '/public-key',
  asyncHandler(async (_req, res) => {
    const { habilitado, vapidPublicKey } = config().push;
    res.json({ habilitado, publicKey: habilitado ? vapidPublicKey : null });
  }),
);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

pushRouter.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Suscripción inválida.');
    await guardarSuscripcion(req.user!.sub, parsed.data, req.headers['user-agent'] ?? null);
    res.status(201).json({ ok: true });
  }),
);

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

pushRouter.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Falta el endpoint.');
    await eliminarSuscripcion(parsed.data.endpoint);
    res.json({ ok: true });
  }),
);
