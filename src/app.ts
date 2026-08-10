import compression from 'compression';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';

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
import { createPrismaPetClient } from './modules/pets/prisma-pet-client';
import {
  createFundraisingStore,
  type FundraisingStore,
} from './modules/fundraising/fundraising-store';
import { AdoptionStore } from './modules/adoption/adoption-store';
import { getPrisma } from './infrastructure/db/prisma-client';
import { createLocationStore, type LocationStore } from './modules/locations/location-store';
import { createPrismaLocationDataSource } from './modules/locations/prisma-location-data-source';
import type { AnimalTaxonomyStore } from './modules/animals/animal-taxonomy-store';
import type { AuthenticatedPrincipal } from './security/principal';

export interface AppDependencies {
  databaseReadiness?: DatabaseReadinessService;
  authVerifier?: ReturnType<typeof createCentralAuthVerifier>;
  // Explicit override for tests that need Prisma-backed enforcement
  // without relying on the module-global env.DATABASE_URL (which
  // tests/setup-env.ts freezes empty for the whole Jest process — see the
  // comment on SocialRoutesDeps.prisma in social.routes.ts).
  prisma?: PrismaClient | null;
  socialStore?: SocialCoreStore;
  petClient?: PetContractClient;
  petIdentityResolver?: (principal: AuthenticatedPrincipal) => Promise<number | null>;
  fundraisingStore?: FundraisingStore;
  adoptionStore?: AdoptionStore;
  locationStore?: LocationStore;
  animalTaxonomyStore?: AnimalTaxonomyStore;
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
  const hasDatabase = deps.prisma !== undefined ? deps.prisma !== null : Boolean(env.DATABASE_URL);
  const prisma = deps.prisma !== undefined ? deps.prisma : hasDatabase ? getPrisma() : null;
  const socialStore =
    deps.socialStore ?? createSocialCoreStore(undefined, undefined, undefined, prisma);
  const petClient =
    deps.petClient ??
    (prisma ? createPrismaPetClient(prisma) : createInMemoryPetClient(socialStore));
  const fundraisingStore = deps.fundraisingStore ?? createFundraisingStore(socialStore);
  const adoptionStore =
    deps.adoptionStore ??
    (prisma ? new AdoptionStore(prisma, socialStore) : createNoopAdoptionStore());
  const locationStore =
    deps.locationStore ??
    (prisma
      ? createLocationStore(createPrismaLocationDataSource(prisma))
      : createNoopLocationStore());

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
      prisma,
      socialStore,
      petClient,
      petIdentityResolver: deps.petIdentityResolver,
      fundraisingStore,
      adoptionStore,
      locationStore,
      animalTaxonomyStore: deps.animalTaxonomyStore,
    }),
  );

  app.use(notFound());
  app.use(errorHandler());

  return app;
}

function createNoopLocationStore(): LocationStore {
  const emptyPage = <T>(items: T[] = []) => ({
    items,
    total: items.length,
    page: 1,
    pageSize: Math.max(items.length, 1),
  });

  return {
    resolveCountryByIso2: async () => ({
      id: 1,
      iso2: 'BD',
      iso3: 'BGD',
      name: 'Bangladesh',
      nameBn: null,
      sortOrder: 0,
    }),
    listCountries: async () => [
      {
        id: 1,
        iso2: 'BD',
        iso3: 'BGD',
        name: 'Bangladesh',
        nameBn: null,
        sortOrder: 0,
      },
    ],
    listDivisions: async () => emptyPage(),
    listDistricts: async () => emptyPage(),
    listUpazilas: async () => emptyPage(),
    listUnions: async () => emptyPage(),
    listAreas: async () => emptyPage(),
    listCityCorporations: async () => emptyPage(),
    listZones: async () => emptyPage(),
    listCcAreas: async () => emptyPage(),
    getAreaById: async () => null,
  } as unknown as LocationStore;
}

function createNoopAdoptionStore(): AdoptionStore {
  return new Proxy(
    {},
    {
      get() {
        return async () => {
          throw AppError.databaseUnavailable('Adoption workflow requires a database');
        };
      },
    },
  ) as unknown as AdoptionStore;
}
