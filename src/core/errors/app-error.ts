import { ErrorCode } from './error-codes';

/**
 * Centralized typed error for all expected failure modes. Route/middleware
 * code should throw this (or a subclass) instead of a bare Error so the
 * error handler can map it to a stable HTTP status and response envelope
 * without string-sniffing messages.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    // Operational errors are expected/handled failures (bad input, missing
    // resource, etc.) as opposed to programmer errors/bugs.
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static authenticationRequired(message = 'Authentication required', details?: unknown): AppError {
    return new AppError(ErrorCode.AUTHENTICATION_REQUIRED, message, 401, details);
  }

  static authenticationInvalid(
    message = 'Invalid or expired access token',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.AUTHENTICATION_INVALID, message, 401, details);
  }

  static authorizationDenied(message = 'Forbidden', details?: unknown): AppError {
    return new AppError(ErrorCode.AUTHORIZATION_DENIED, message, 403, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409, details);
  }

  static requestTimeout(message = 'Request timed out'): AppError {
    return new AppError(ErrorCode.REQUEST_TIMEOUT, message, 408);
  }

  static payloadTooLarge(message = 'Request body too large'): AppError {
    return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, message, 413);
  }

  static rateLimited(message = 'Too many requests', details?: unknown): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, message, 429, details);
  }

  static databaseUnavailable(message = 'Database unavailable', details?: unknown): AppError {
    return new AppError(ErrorCode.DATABASE_UNAVAILABLE, message, 503, details);
  }

  static serviceUnavailable(message = 'Service unavailable', details?: unknown): AppError {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, 503, details);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500);
  }
}
