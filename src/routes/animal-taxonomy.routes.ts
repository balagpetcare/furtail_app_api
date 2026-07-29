import { Router, type Request, type Response } from 'express';

import { AppError } from '../core/errors/app-error';
import { sendSuccess } from '../core/http/api-response';
import { asyncHandler } from '../shared/async-handler';
import { getPrisma } from '../infrastructure/db/prisma-client';
import { createPrismaAnimalTaxonomyDataSource } from '../modules/animals/prisma-animal-taxonomy-data-source';
import {
  createAnimalTaxonomyStore,
  AnimalTaxonomyContractError,
  type AnimalTaxonomyStore,
  type BoundedQuery,
} from '../modules/animals/animal-taxonomy-store';

export interface AnimalTaxonomyRoutesDeps {
  animalTaxonomyStore?: AnimalTaxonomyStore;
}

/**
 * Reference-data reads (species/type list, breeds by species) are public
 * and cacheable — no auth middleware. A normal authenticated mobile user
 * creating an adoption listing must never be blocked from resolving these
 * selectors by a missing admin role.
 */
const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

function mapAnimalTaxonomyError(error: unknown): AppError {
  if (error instanceof AnimalTaxonomyContractError) {
    switch (error.code) {
      case 'TYPE_NOT_FOUND':
        return AppError.animalTypeNotFound(error.message);
      case 'BREED_NOT_FOUND':
        return AppError.animalBreedNotFound(error.message);
      case 'SPECIES_MISMATCH':
        return AppError.animalBreedSpeciesMismatch(error.message);
    }
  }
  if (error instanceof AppError) return error;
  return AppError.internal('Animal taxonomy lookup failed');
}

function readRequiredPositiveInt(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.validation(`${label} is required and must be a positive integer`);
  }
  return parsed;
}

function readBoundedQuery(query: Record<string, unknown>): BoundedQuery {
  const pageSize =
    typeof query.pageSize === 'string' ? Number.parseInt(query.pageSize, 10) : undefined;
  const page = typeof query.page === 'string' ? Number.parseInt(query.page, 10) : undefined;
  const q = typeof query.q === 'string' ? query.q : undefined;
  return {
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    page: Number.isFinite(page) ? page : undefined,
    q,
  };
}

export function animalTaxonomyRoutes(deps: AnimalTaxonomyRoutesDeps = {}): Router {
  const router = Router();
  const store =
    deps.animalTaxonomyStore ??
    createAnimalTaxonomyStore(createPrismaAnimalTaxonomyDataSource(getPrisma()));

  const route = (fn: (req: Request, res: Response) => Promise<void>) =>
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', CACHE_CONTROL);
      try {
        await fn(req, res);
      } catch (error) {
        throw mapAnimalTaxonomyError(error);
      }
    });

  router.get(
    '/api/v1/common/animal-types',
    route(async (req, res) => {
      const result = await store.listTypes(readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/animal-types/:id',
    route(async (req, res) => {
      const id = readRequiredPositiveInt(req.params.id, 'id');
      const type = await store.getType(id);
      sendSuccess(res, type, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  // Breeds scoped to a species — also accepts `q` for case-insensitive
  // name/nameBn/alias search within that species.
  router.get(
    '/api/v1/common/breeds/:typeId',
    route(async (req, res) => {
      const typeId = readRequiredPositiveInt(req.params.typeId, 'typeId');
      const result = await store.listBreedsByType(typeId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/breed/:id',
    route(async (req, res) => {
      const id = readRequiredPositiveInt(req.params.id, 'id');
      const breed = await store.getBreed(id);
      sendSuccess(res, breed, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}
