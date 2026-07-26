import type { Response } from 'express';

import type { ErrorCode } from '../errors/error-codes';
import { safeJsonStringify } from '../../shared/safe-json';

/**
 * Standard success envelope. `data` is serialized through the safe-JSON
 * pipeline so BigInt/Date/undefined values never throw at the transport
 * boundary.
 */
export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    correlationId: string;
    timestamp: string;
  } & Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
    correlationId: string;
    timestamp: string;
  };
}

function meta(requestId: string, correlationId: string) {
  return {
    requestId,
    correlationId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sends a success envelope. Bypasses Express's default `res.json` (which
 * uses global `JSON.stringify`) so BigInt/Date/undefined/circular values in
 * `data` are handled deliberately rather than throwing or being silently
 * dropped.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  options: {
    statusCode?: number;
    requestId: string;
    correlationId: string;
    meta?: Record<string, unknown>;
  },
): void {
  const envelope: ApiSuccessEnvelope<T> = {
    success: true,
    data,
    meta: { ...meta(options.requestId, options.correlationId), ...(options.meta ?? {}) },
  };
  res
    .status(options.statusCode ?? 200)
    .type('application/json')
    .send(safeJsonStringify(envelope));
}

export function sendError(
  res: Response,
  error: { code: ErrorCode | string; message: string; details?: unknown },
  options: { statusCode: number; requestId: string; correlationId: string },
): void {
  const envelope: ApiErrorEnvelope = {
    success: false,
    error,
    meta: meta(options.requestId, options.correlationId),
  };
  res.status(options.statusCode).type('application/json').send(safeJsonStringify(envelope));
}
