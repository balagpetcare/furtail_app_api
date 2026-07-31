import { Router, type Request, type Response } from 'express';

import { AppError } from '../core/errors/app-error';
import { sendSuccess } from '../core/http/api-response';
import { asyncHandler } from '../shared/async-handler';
import { getPrisma } from '../infrastructure/db/prisma-client';
import { createPrismaLocationDataSource } from '../modules/locations/prisma-location-data-source';
import {
  createLocationStore,
  LocationContractError,
  type BoundedQuery,
  type LocationStore,
} from '../modules/locations/location-store';

export interface LocationRoutesDeps {
  locationStore?: LocationStore;
}

/**
 * Reference-data reads (country/division/district/upazila/union/city
 * corporation/zone/ward/area) are public and cacheable — no auth middleware
 * is applied here. A normal authenticated mobile user creating an adoption
 * listing, fundraiser, lost-and-found post, or service booking must never
 * be blocked from resolving these selectors by a missing admin role.
 */
const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

function mapLocationError(error: unknown): AppError {
  if (error instanceof LocationContractError) {
    switch (error.code) {
      case 'COUNTRY_NOT_FOUND':
        return AppError.countryNotFound(error.message);
      case 'PARENT_INVALID':
        return AppError.locationParentInvalid(error.message);
      case 'NOT_FOUND':
        return AppError.locationNotFound(error.message);
    }
  }
  if (error instanceof AppError) return error;
  return AppError.internal('Location lookup failed');
}

function readRequiredPositiveInt(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.validation(`${label} is required and must be a positive integer`);
  }
  return parsed;
}

function readOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

export function locationsRoutes(deps: LocationRoutesDeps = {}): Router {
  const router = Router();
  const store =
    deps.locationStore ?? createLocationStore(createPrismaLocationDataSource(getPrisma()));

  const route = (fn: (req: Request, res: Response) => Promise<void>) =>
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', CACHE_CONTROL);
      try {
        await fn(req, res);
      } catch (error) {
        throw mapLocationError(error);
      }
    });

  // -------------------------------------------------------------------
  // Country
  // -------------------------------------------------------------------
  router.get(
    '/api/v1/public/countries',
    route(async (req, res) => {
      const countries = await store.listCountries();
      // Returned as a bare array (matches the existing Flutter client's
      // `fetchBangladeshCountry`, which reads `data` as a List and resolves
      // Bangladesh by iso2 === "BD", never by display-name matching).
      sendSuccess(res, countries, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  // -------------------------------------------------------------------
  // Legacy-shaped `/common/bd/*` family (kept for existing call sites)
  // -------------------------------------------------------------------
  router.get(
    '/api/v1/common/bd/divisions',
    route(async (req, res) => {
      const result = await store.listDivisions(readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/districts',
    route(async (req, res) => {
      const divisionId = readRequiredPositiveInt(req.query.divisionId, 'divisionId');
      const result = await store.listDistricts(divisionId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/upazilas',
    route(async (req, res) => {
      const districtId = readRequiredPositiveInt(req.query.districtId, 'districtId');
      const result = await store.listUpazilas(districtId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/unions',
    route(async (req, res) => {
      const upazilaId = readRequiredPositiveInt(req.query.upazilaId, 'upazilaId');
      const result = await store.listUnions(upazilaId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/areas',
    route(async (req, res) => {
      const upazilaId = readOptionalPositiveInt(req.query.upazilaId);
      const unionId = readOptionalPositiveInt(req.query.unionId);
      const districtId = readOptionalPositiveInt(req.query.districtId);
      const parentId = readOptionalPositiveInt(req.query.parentId);
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const result = await store.listAreas(
        { upazilaId, unionId, districtId, parentId, type },
        readBoundedQuery(req.query),
      );
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/areas/:id',
    route(async (req, res) => {
      const areaId = readRequiredPositiveInt(req.params.id, 'id');
      const result = await store.getAreaById(areaId);
      if (!result) {
        throw AppError.locationNotFound(`Unknown areaId: ${areaId}`);
      }
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/city-corporations',
    route(async (req, res) => {
      const districtId = readRequiredPositiveInt(req.query.districtId, 'districtId');
      const result = await store.listCityCorporations(districtId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/zones',
    route(async (req, res) => {
      const cityCorporationId = readRequiredPositiveInt(
        req.query.cityCorporationId,
        'cityCorporationId',
      );
      const result = await store.listZones(cityCorporationId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/common/bd/cc-areas',
    route(async (req, res) => {
      const zoneId = readRequiredPositiveInt(req.query.zoneId, 'zoneId');
      const result = await store.listCcAreas(zoneId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  // -------------------------------------------------------------------
  // `/location-master/*` family (locale/pageSize/q-aware, richer selectors)
  // -------------------------------------------------------------------
  router.get(
    '/api/v1/location-master/divisions',
    route(async (req, res) => {
      const result = await store.listDivisions(readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/districts',
    route(async (req, res) => {
      const divisionId = readRequiredPositiveInt(req.query.divisionId, 'divisionId');
      const result = await store.listDistricts(divisionId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/upazilas',
    route(async (req, res) => {
      const districtId = readRequiredPositiveInt(req.query.districtId, 'districtId');
      const result = await store.listUpazilas(districtId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/unions',
    route(async (req, res) => {
      const upazilaId = readRequiredPositiveInt(req.query.upazilaId, 'upazilaId');
      const result = await store.listUnions(upazilaId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/city-corporations',
    route(async (req, res) => {
      const districtId = readRequiredPositiveInt(req.query.districtId, 'districtId');
      const result = await store.listCityCorporations(districtId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/zones',
    route(async (req, res) => {
      const cityCorporationId = readRequiredPositiveInt(
        req.query.cityCorporationId,
        'cityCorporationId',
      );
      const result = await store.listZones(cityCorporationId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/wards',
    route(async (req, res) => {
      const zoneId = readRequiredPositiveInt(req.query.zoneId, 'zoneId');
      const result = await store.listCcAreas(zoneId, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/areas',
    route(async (req, res) => {
      const parentId = readOptionalPositiveInt(req.query.parentId);
      const unionId = readOptionalPositiveInt(req.query.unionId);
      const result = await store.listAreas({ parentId, unionId }, readBoundedQuery(req.query));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/location-master/areas/:id',
    route(async (req, res) => {
      const areaId = readRequiredPositiveInt(req.params.id, 'id');
      const result = await store.getAreaById(areaId);
      if (!result) {
        throw AppError.locationNotFound(`Unknown areaId: ${areaId}`);
      }
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/location-master/validate-selection',
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await store.validateSelection({
        divisionId: readOptionalPositiveInt(body.divisionId),
        districtId: readOptionalPositiveInt(body.districtId),
        upazilaId: readOptionalPositiveInt(body.upazilaId),
        unionId: readOptionalPositiveInt(body.unionId),
        cityCorporationId: readOptionalPositiveInt(body.cityCorporationId),
        zoneId: readOptionalPositiveInt(body.zoneId),
        wardId: readOptionalPositiveInt(body.wardId),
      });
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}
