/**
 * Light TMS - Chatbot route.
 *   GET  /api/chat/estado   ¿está habilitado el chatbot? (para mostrar/ocultar la UI)
 *   POST /api/chat          { pregunta, historial? } -> { respuesta }
 *
 * Protegido por JWT (montado bajo el router protegido en app.ts). Incluye un
 * rate-limit sencillo por usuario para no agotar la cuota gratuita de OpenRouter.
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest } from '../../http/errors.js';
import { config } from '../../config/env.js';
import { responder } from './chat.service.js';

export const chatRouter = Router();

const esquema = z.object({
  pregunta: z.string().trim().min(1, 'Escribe una pregunta.').max(1000, 'Pregunta demasiado larga.'),
  historial: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20)
    .optional(),
});

// Rate-limit en memoria: máx. N peticiones por usuario en una ventana.
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 12;
const hits = new Map<number, number[]>();

function limitado(userId: number): boolean {
  const ahora = Date.now();
  const previos = (hits.get(userId) ?? []).filter((t) => ahora - t < VENTANA_MS);
  previos.push(ahora);
  hits.set(userId, previos);
  return previos.length > MAX_POR_VENTANA;
}

chatRouter.get(
  '/estado',
  asyncHandler(async (_req, res) => {
    const cfg = config().chat;
    res.json({ habilitado: cfg.habilitado && cfg.apiKey !== '' });
  }),
);

chatRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const cfg = config().chat;
    if (!cfg.habilitado || cfg.apiKey === '') {
      throw badRequest('El asistente no está habilitado.');
    }
    const userId = req.user?.sub ?? 0;
    if (limitado(userId)) {
      throw badRequest('Demasiadas preguntas seguidas. Espera un momento e inténtalo de nuevo.');
    }

    const parsed = esquema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');

    const respuesta = await responder(parsed.data.pregunta, parsed.data.historial ?? []);
    res.json({ respuesta });
  }),
);
