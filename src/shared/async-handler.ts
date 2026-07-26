import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route/middleware handler so a rejected promise (or a
 * thrown error inside an async function) is forwarded to Express's error
 * pipeline via `next(err)`, instead of becoming an unhandled rejection.
 * Express itself only does this automatically for synchronous throws.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
