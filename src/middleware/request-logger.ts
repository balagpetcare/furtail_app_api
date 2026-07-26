import pinoHttp from 'pino-http';
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import { logger } from '../shared/logger';

/**
 * Structured HTTP request/response access logging. Reuses the app's shared
 * pino instance so log level/format stay consistent, and correlates each
 * log line with the request/correlation IDs assigned by `requestContext`.
 * Runs after `requestContext` in the middleware chain (see app.ts).
 */
export function requestLogger(): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as { requestId?: string }).requestId ?? randomUUID(),
    customProps: (req) => ({
      correlationId: (req as { correlationId?: string }).correlationId,
    }),
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return env.NODE_ENV === 'test' ? 'silent' : 'info';
    },
  });
}
