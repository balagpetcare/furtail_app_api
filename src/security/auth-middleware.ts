import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../core/errors/app-error';
import type { AuthenticatedPrincipal, TokenVerifier } from './principal';
import { hasPermission, hasRole, isOwner } from './authorization';

export interface AuthMiddlewareOptions {
  verifier: TokenVerifier;
}

export function requiredAuth(options: AuthMiddlewareOptions): RequestHandler {
  return async function handler(req: Request, _res: Response, next: NextFunction) {
    try {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        throw AppError.authenticationRequired();
      }
      req.principal = await options.verifier.verifyAccessToken(token);
      next();
    } catch (error) {
      next(
        error instanceof AppError
          ? error
          : AppError.authenticationInvalid('Invalid or expired access token'),
      );
    }
  };
}

export function optionalAuth(options: AuthMiddlewareOptions): RequestHandler {
  return async function handler(req: Request, _res: Response, next: NextFunction) {
    try {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        req.principal = undefined;
        next();
        return;
      }
      req.principal = await options.verifier.verifyAccessToken(token);
      next();
    } catch (error) {
      next(
        error instanceof AppError
          ? error
          : AppError.authenticationInvalid('Invalid or expired access token'),
      );
    }
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return function handler(req: Request, _res: Response, next: NextFunction) {
    if (!hasRole(req.principal, ...roles)) {
      next(AppError.authorizationDenied('Insufficient role privileges', { requiredRoles: roles }));
      return;
    }
    next();
  };
}

export function requirePermission(...permissions: string[]): RequestHandler {
  return function handler(req: Request, _res: Response, next: NextFunction) {
    if (!hasPermission(req.principal, ...permissions)) {
      next(
        AppError.authorizationDenied('Insufficient permissions', {
          requiredPermissions: permissions,
        }),
      );
      return;
    }
    next();
  };
}

export function requireOwnership(ownerId: string | number | bigint): RequestHandler {
  return function handler(req: Request, _res: Response, next: NextFunction) {
    if (!isOwner(req.principal, ownerId)) {
      next(AppError.authorizationDenied('Ownership check failed', { ownerId: String(ownerId) }));
      return;
    }
    next();
  };
}

export function getPrincipal(req: Request): AuthenticatedPrincipal | undefined {
  return req.principal;
}

function readBearerToken(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  if (!header.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}
