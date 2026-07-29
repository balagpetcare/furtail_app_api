import { Router } from 'express';

import { sendSuccess } from '../core/http/api-response';
import { requiredAuth, optionalAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';

export interface AuthRoutesDeps {
  verifier: TokenVerifier;
}

export function authRoutes(deps: AuthRoutesDeps): Router {
  const router = Router();
  const required = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });

  router.get(
    '/api/v1/auth/session',
    optional,
    asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        {
          authenticated: Boolean(req.principal),
          principal: req.principal ?? null,
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.get(
    '/api/v1/auth/me',
    required,
    asyncHandler(async (req, res) => {
      try {
        const { getOrProvisionUser } = await import('../modules/auth/auth.service');
        const user = await getOrProvisionUser(req.principal!);
        sendSuccess(res, { user }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        console.error('[auth.routes] Error in /auth/me:', error);
        throw error;
      }
    }),
  );

  return router;
}
