import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../core/errors/app-error';

/**
 * Terminal middleware for any request that reached the end of the router
 * chain without a match. Delegates to the centralized error handler rather
 * than responding directly, so 404s go through the same envelope/logging
 * path as every other error.
 */
export function notFound(): RequestHandler {
  return function handler(req: Request, _res: Response, next: NextFunction) {
    next(AppError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
  };
}
