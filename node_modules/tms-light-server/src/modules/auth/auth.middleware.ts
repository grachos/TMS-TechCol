/**
 * Light TMS - Authentication + authorization middleware.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { unauthorized, forbidden } from '../../http/errors.js';
import { verifyToken, type JwtPayload } from './jwt.js';
import type { Rol } from './auth.repo.js';

// Augment Express's Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Requires a valid Bearer token; attaches the payload to req.user. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Falta el token de autenticación.');
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    throw unauthorized('Token inválido o expirado.');
  }
};

/**
 * Requires the authenticated user to have one of the given roles.
 * Used to gate real RNDC sending behind the 'admin' role.
 */
export function requireRole(...roles: Rol[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.rol)) {
      throw forbidden('Se requiere el rol: ' + roles.join(' o ') + '.');
    }
    next();
  };
}
