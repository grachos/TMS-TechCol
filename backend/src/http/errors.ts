/**
 * Light TMS - HTTP error + async-handler helpers.
 *
 * The PHP front controller wrapped every route in try/catch and rendered a
 * generic error (with detail only when APP_DEBUG). We reproduce that with an
 * AppError type, an asyncHandler wrapper, and a central error middleware.
 */

import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { config } from '../config/env.js';

/** An error carrying an HTTP status code and a user-safe message. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly expose = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string) => new AppError(400, msg);
export const unauthorized = (msg = 'No autenticado.') => new AppError(401, msg);
export const forbidden = (msg = 'No autorizado.') => new AppError(403, msg);
export const notFound = (msg = 'No encontrado.') => new AppError(404, msg);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Central error middleware. Mirrors the PHP catch: generic message + optional detail. */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const debug = config().app.debug;
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.expose ? err.message : 'Ocurrió un error.',
      ...(debug && !err.expose ? { detail: err.message } : {}),
    });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[error]', message, err);
  res.status(500).json({
    error: 'Ocurrió un error.',
    ...(debug ? { detail: message } : {}),
  });
}
