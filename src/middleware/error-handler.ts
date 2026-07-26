import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';

import { AppError } from '../core/errors/app-error';
import { ErrorCode } from '../core/errors/error-codes';
import { sendError } from '../core/http/api-response';
import { logger } from '../shared/logger';

/**
 * Centralized error-handling middleware — must be registered last, after
 * all routes and `notFound()`. Converts any thrown/forwarded error into the
 * standard error envelope. Non-`AppError` (unexpected/programmer) errors are
 * logged with full detail server-side but returned to the client as a
 * generic internal-error message, never leaking internals (stack traces,
 * file paths, raw exception messages) over the wire.
 */
export function errorHandler(): ErrorRequestHandler {
  // Express identifies error-handling middleware by arity (4 params) —
  // the unused `_next` parameter is required for that detection.
  return function handler(err: unknown, req: Request, res: Response, _next: NextFunction) {
    const requestId = req.requestId ?? 'unknown';
    const correlationId = req.correlationId ?? requestId;

    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error({ err, requestId, correlationId }, 'request failed with server error');
      }
      sendError(
        res,
        { code: err.code, message: err.message, details: err.details },
        { statusCode: err.statusCode, requestId, correlationId },
      );
      return;
    }

    if (isBodyParserPayloadTooLarge(err)) {
      sendError(
        res,
        { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Request body too large' },
        { statusCode: 413, requestId, correlationId },
      );
      return;
    }

    logger.error({ err, requestId, correlationId }, 'unhandled error');
    sendError(
      res,
      { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
      { statusCode: 500, requestId, correlationId },
    );
  };
}

function isBodyParserPayloadTooLarge(err: unknown): err is { type?: string; status?: number } {
  return Boolean(
    err &&
    typeof err === 'object' &&
    ((err as { type?: string }).type === 'entity.too.large' ||
      (err as { status?: number }).status === 413),
  );
}
