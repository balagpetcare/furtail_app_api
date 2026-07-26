import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../core/errors/app-error';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

type Bucket = {
  count: number;
  expiresAt: number;
};

export function createInMemoryRateLimiter(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return function handler(req: Request, _res: Response, next: NextFunction) {
    const key = options.keyGenerator?.(req) ?? `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      buckets.set(key, { count: 1, expiresAt: now + options.windowMs });
      next();
      return;
    }
    if (bucket.count >= options.maxRequests) {
      next(
        AppError.rateLimited('Too many requests', {
          windowMs: options.windowMs,
          maxRequests: options.maxRequests,
        }),
      );
      return;
    }
    bucket.count += 1;
    next();
  };
}
