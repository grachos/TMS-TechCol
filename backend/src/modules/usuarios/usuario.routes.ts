/**
 * Light TMS - Staff user management. Admin-only: create/edit accounts and
 * assign per-page permissions (see auth.repo.ts's PAGINAS).
 *
 *   GET  /api/usuarios          list all staff users
 *   GET  /api/usuarios/paginas  assignable page keys + labels (for checkboxes)
 *   POST /api/usuarios          create
 *   PUT  /api/usuarios/:id      update (profile, rol, paginas, activo, password)
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import { PAGINAS, type Pagina, createUser, updateUser, listUsers, emailExists, findById, toPublic } from '../auth/auth.repo.js';

export const usuarioRouter = Router();

/** Labels shown next to each page's checkbox — mirrors AppShell.tsx's nav. */
const PAGINA_LABELS: Record<Pagina, string> = {
  solicitudes: 'Solicitudes',
  despachos: 'Despachos',
  cola: 'Cola de envíos',
  cumplido: 'Cumplido',
  informe: 'Informe',
  terceros: 'Terceros',
  vehiculos: 'Vehículos',
  productos: 'Productos',
  empresa: 'Empresa',
};

usuarioRouter.use(requireRole('admin'));

usuarioRouter.get(
  '/paginas',
  asyncHandler(async (_req, res) => {
    res.json(PAGINAS.map((p) => ({ pagina: p, label: PAGINA_LABELS[p] })));
  }),
);

usuarioRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json((await listUsers()).map(toPublic));
  }),
);

usuarioRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const u = await findById(Number(req.params.id));
    if (!u) throw notFound('Usuario no encontrado.');
    res.json(toPublic(u));
  }),
);

const paginasSchema = z.array(z.enum(PAGINAS)).nullable();

const crearSchema = z.object({
  email: z.string().trim().email('Correo inválido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.'),
  rol: z.enum(['admin', 'operador']),
  paginas: paginasSchema.optional(),
});

usuarioRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = crearSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    const { email, password, nombre, rol, paginas } = parsed.data;
    if (await emailExists(email)) throw badRequest('Ya existe una cuenta con ese correo.');
    const passwordHash = await bcrypt.hash(password, 10);
    const id = await createUser({ email, passwordHash, nombre, rol, paginas: paginas ?? null });
    res.status(201).json({ id });
  }),
);

const actualizarSchema = z.object({
  email: z.string().trim().email('Correo inválido.'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.'),
  rol: z.enum(['admin', 'operador']),
  paginas: paginasSchema.optional(),
  activo: z.boolean(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').optional().or(z.literal('')),
});

usuarioRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existente = await findById(id);
    if (!existente) throw notFound('Usuario no encontrado.');

    const parsed = actualizarSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
    const { email, nombre, rol, paginas, activo, password } = parsed.data;

    // Guard rails so an admin can't lock themselves out from this same screen.
    if (req.user!.sub === id) {
      if (!activo) throw badRequest('No puedes desactivar tu propia cuenta.');
      if (existente.rol === 'admin' && rol !== 'admin') {
        throw badRequest('No puedes quitarte el rol de administrador a ti mismo.');
      }
    }

    if (await emailExists(email, id)) throw badRequest('Ya existe otra cuenta con ese correo.');

    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    await updateUser(id, { email, nombre, rol, paginas: paginas ?? null, activo, passwordHash });
    res.json({ ok: true });
  }),
);
