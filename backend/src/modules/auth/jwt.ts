/**
 * Light TMS - JWT issuing/verification.
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../../config/env.js';
import type { Rol, Pagina } from './auth.repo.js';

export interface JwtPayload {
  sub: number; // staff user id
  email: string;
  nombre: string;
  rol: Rol;
  /** Allowed pages for rol='operador'; null = all. Ignored for 'admin'. */
  paginas: Pagina[] | null;
}

/** Signs an access token for a staff user. */
export function signToken(payload: JwtPayload): string {
  const { jwtSecret, jwtExpires } = config().auth;
  const opts: SignOptions = { expiresIn: jwtExpires as SignOptions['expiresIn'] };
  return jwt.sign(payload, jwtSecret, opts);
}

/** Verifies a token and returns its payload, or throws. */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config().auth.jwtSecret);
  return decoded as unknown as JwtPayload;
}
