import compression from 'compression';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { AppError } from './core/errors/app-error';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { requestContext } from './middleware/request-context';
import { requestLogger } from './middleware/request-logger';
import { createDatabaseReadinessService, type DatabaseReadinessService } from './security/database';
import { createCentralAuthVerifier } from './security/jwt-verifier';
import { createInMemoryRateLimiter } from './security/rate-limit';
import { rootRouter } from './routes';
import { createSocialCoreStore, type SocialCoreStore } from './modules/social/social-store';
import { createInMemoryPetClient, type PetContractClient } from './modules/pets/pet-client';
import {
  createFundraisingStore,
  type FundraisingStore,
} from './modules/fundraising/fundraising-store';

export interface AppDependencies {
  databaseReadiness?: DatabaseReadinessService;
  authVerifier?: ReturnType<typeof createCentralAuthVerifier>;
  socialStore?: SocialCoreStore;
  petClient?: PetContractClient;
  fundraisingStore?: FundraisingStore;
}

/**
 * Per-request processing timeout. Runs after `requestContext` so the error
 * it raises still carries a request/correlation ID. Only fires if the
 * response hasn't already been sent by the deadline; does nothing to
 * requests that complete in time.
 */
function requestTimeout(timeoutMs: number) {
  return function handler(_req: Request, res: Response, next: NextFunction) {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        next(AppError.requestTimeout());
      }
    }, timeoutMs);
    timer.unref();

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

export function createApp(): Express {
  return createAppWithDependencies({});
}

export function createAppWithDependencies(deps: AppDependencies): Express {
  const app = express();
  const databaseReadiness = deps.databaseReadiness ?? createDatabaseReadinessService();
  const authVerifier = deps.authVerifier ?? createCentralAuthVerifier();
  const socialStore = deps.socialStore ?? createSocialCoreStore();
  const petClient = deps.petClient ?? createInMemoryPetClient(socialStore);
  const fundraisingStore = deps.fundraisingStore ?? createFundraisingStore(socialStore);

  // Foundation-level middleware only; no business routes are registered.
  app.disable('x-powered-by');
  app.use(requestContext());
  app.use(requestTimeout(env.REQUEST_TIMEOUT_MS));
  app.use(requestLogger());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : false,
      credentials: env.CORS_ALLOW_CREDENTIALS,
    }),
  );
  app.use(
    createInMemoryRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.URLENCODED_BODY_LIMIT }));

  app.use(
    rootRouter({
      databaseReadiness,
      verifier: authVerifier,
      socialStore,
      petClient,
      fundraisingStore,
    }),
  );

  app.use(notFound());
  app.use(errorHandler());

  return app;
}
