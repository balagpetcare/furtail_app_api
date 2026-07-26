import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Assigns `req.requestId`/`req.correlationId` and echoes `X-Request-Id` on
 * the response. `requestId` is always freshly generated per request (never
 * trusted from an inbound header, to prevent log-injection/spoofing);
 * `correlationId` is taken from an inbound `X-Correlation-Id` header when a
 * caller supplies one (to thread a client-side operation across services),
 * falling back to the freshly generated `requestId` otherwise.
 */
export function requestContext(): RequestHandler {
  return function handler(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    const inboundCorrelationId = req.headers[CORRELATION_ID_HEADER];
    const correlationId =
      typeof inboundCorrelationId === 'string' && inboundCorrelationId.trim().length > 0
        ? inboundCorrelationId
        : requestId;

    req.requestId = requestId;
    req.correlationId = correlationId;
    res.setHeader('X-Request-Id', requestId);

    next();
  };
}

export { REQUEST_ID_HEADER, CORRELATION_ID_HEADER };
