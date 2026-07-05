/**
 * Light TMS - Staff users data access (mysql2).
 *
 * New in the modern stack: the PHP app had no authentication. Staff accounts
 * live in `staff_users` (see database/migracion_v31_staff_users.sql).
 */

import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../db/pool.js';

export type Rol = 'admin' | 'operador';

export interface StaffUser {
  id: number;
  email: string;
  password_hash: string;
  nombre: string;
  rol: Rol;
  activo: 0 | 1;
  created_at: string;
}

/** Public shape returned to clients (never leaks the password hash). */
export type StaffUserPublic = Omit<StaffUser, 'password_hash'>;

export function toPublic(u: StaffUser): StaffUserPublic {
  const { password_hash: _drop, ...rest } = u;
  return rest;
}

/** Finds an active staff user by email, or null. */
export async function findByEmail(email: string): Promise<StaffUser | null> {
  const [rows] = await db().query<(StaffUser & RowDataPacket)[]>(
    'SELECT * FROM staff_users WHERE email = :email AND activo = 1 LIMIT 1',
    { email: email.trim().toLowerCase() },
  );
  return rows[0] ?? null;
}

/** Finds a staff user by id (active or not), or null. */
export async function findById(id: number): Promise<StaffUser | null> {
  const [rows] = await db().query<(StaffUser & RowDataPacket)[]>(
    'SELECT * FROM staff_users WHERE id = :id LIMIT 1',
    { id },
  );
  return rows[0] ?? null;
}

/** Creates a staff user and returns the new id. */
export async function createUser(input: {
  email: string;
  passwordHash: string;
  nombre: string;
  rol: Rol;
}): Promise<number> {
  const [res] = await db().query<ResultSetHeader>(
    `INSERT INTO staff_users (email, password_hash, nombre, rol, activo)
     VALUES (:email, :passwordHash, :nombre, :rol, 1)`,
    {
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      nombre: input.nombre.trim(),
      rol: input.rol,
    },
  );
  return res.insertId;
}
