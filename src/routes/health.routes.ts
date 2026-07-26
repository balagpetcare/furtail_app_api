import { Router } from 'express';

import { env } from '../config/env';
import { sendSuccess } from '../core/http/api-response';
import type { DatabaseReadinessService } from '../security/database';
import { asyncHandler } from '../shared/async-handler';

const startedAt = Date.now();

export interface HealthRoutesDeps {
  databaseReadiness: DatabaseReadinessService;
}

export function healthRoutes(deps: HealthRoutesDeps): Router {
  const router = Router();

  /**
   * Liveness probe: the process is up and able to handle a request. Must
   * never check a downstream dependency — a slow/down database or Redis
   * instance should not make the process itself look unhealthy to an
   * orchestrator, which would trigger an unnecessary restart.
   */
  router.get(
    '/health',
    asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        { status: 'alive' },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  /**
   * Readiness probe. Every downstream dependency is explicitly reported as
   * NOT_CONFIGURED — this foundation step never connects to a database,
   * Redis, queue, object storage, or the Central Auth service. Once a real
   * integration is added in a later step, its entry here should be updated
   * to reflect an actual connectivity check.
   */
  router.get(
    '/ready',
    asyncHandler(async (req, res) => {
      const database = await deps.databaseReadiness.check();
      const overallStatus = database.status === 'UNAVAILABLE' ? 'degraded' : 'ready';
      sendSuccess(
        res,
        {
          status: overallStatus,
          dependencies: {
            database,
            redis: 'NOT_CONFIGURED',
            queue: 'NOT_CONFIGURED',
            storage: 'NOT_CONFIGURED',
            push: 'NOT_CONFIGURED',
            auth: 'NOT_CONFIGURED',
          },
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.get(
    '/api/v1/version',
    asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        {
          service: env.SERVICE_NAME,
          apiVersion: 'v1',
          applicationVersion: env.SERVICE_VERSION,
          environment: env.NODE_ENV,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  return router;
}
