/**
 * Light TMS - Auth routes: login + current user.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, badRequest, unauthorized } from '../../http/errors.js';
import { findByEmail, findById, toPublic } from './auth.repo.js';
import { signToken } from './jwt.js';
import { requireAuth } from './auth.middleware.js';

const loginSchema = z.object({
  email: z.string().email('Correo inválido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});

export const authRouter = Router();

/** POST /api/auth/login -> { token, user } */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    }
    const { email, password } = parsed.data;
    const user = await findByEmail(email);
    // Constant-ish behaviour: always run a hash comparison to reduce user enumeration.
    const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) {
      throw unauthorized('Credenciales incorrectas.');
    }
    const token = signToken({ sub: user.id, email: user.email, nombre: user.nombre, rol: user.rol, paginas: user.paginas });
    res.json({ token, user: toPublic(user) });
  }),
);

/** GET /api/auth/me -> current staff user (from a fresh DB read). */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await findById(req.user!.sub);
    if (!user || !user.activo) throw unauthorized('Cuenta inactiva.');
    res.json({ user: toPublic(user) });
  }),
);
