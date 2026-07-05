/**
 * Light TMS - Seed/refresh the initial admin staff user.
 *
 * Usage (from /server):
 *   npm run seed:admin -- --email admin@tms.local --password "secret" --nombre "Admin"
 * or via env:
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed:admin
 *
 * Idempotent: ensures the staff_users table exists, then inserts the admin or
 * updates its password/role if the email already exists.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db } from '../db/pool.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('email') ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@tms.local').trim().toLowerCase();
  const password = arg('password') ?? process.env.SEED_ADMIN_PASSWORD ?? 'admin1234';
  const nombre = arg('nombre') ?? process.env.SEED_ADMIN_NOMBRE ?? 'Administrador';

  // Ensure the table exists by running the migration DDL (CREATE TABLE IF NOT EXISTS).
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationPath = path.resolve(__dirname, '..', '..', '..', 'database', 'migracion_v31_staff_users.sql');
  const ddl = readFileSync(migrationPath, 'utf8');
  for (const stmt of ddl.split(';')) {
    const s = stmt.trim();
    if (s && !s.startsWith('--')) await db().query(s);
  }

  const hash = await bcrypt.hash(password, 10);
  await db().query(
    `INSERT INTO staff_users (email, password_hash, nombre, rol, activo)
     VALUES (:email, :hash, :nombre, 'admin', 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash),
                             nombre = VALUES(nombre), rol = 'admin', activo = 1`,
    { email, hash, nombre },
  );

  // eslint-disable-next-line no-console
  console.log(`Admin listo: ${email} (contraseña establecida). Cámbiala en producción.`);
  await db().end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('seed-admin falló:', e);
  process.exit(1);
});
