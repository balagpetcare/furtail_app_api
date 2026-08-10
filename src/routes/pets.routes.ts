import { Router } from 'express';

import { AppError } from '../core/errors/app-error';
import { ErrorCode } from '../core/errors/error-codes';
import { sendSuccess } from '../core/http/api-response';
import { env } from '../config/env';
import { getOrProvisionUserByCentralSubjectOnly } from '../modules/auth/auth.service';
import { optionalAuth, requiredAuth } from '../security/auth-middleware';
import type { AuthenticatedPrincipal, TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import type { SocialCoreStore } from '../modules/social/social-store';
import {
  createInMemoryPetClient,
  type PetContractClient,
  PetContractError,
} from '../modules/pets/pet-client';

export interface PetRoutesDeps {
  verifier: TokenVerifier;
  petClient?: PetContractClient;
  socialStore?: SocialCoreStore;
  petIdentityResolver?: (principal: AuthenticatedPrincipal) => Promise<number | null>;
}

async function readUserId(
  req: { principal?: AuthenticatedPrincipal },
  deps: PetRoutesDeps,
): Promise<number> {
  if (!req.principal) {
    throw AppError.authenticationRequired('Authentication required');
  }
  const userId = await resolvePetUserId(req.principal, deps);
  if (typeof userId !== 'number' || !Number.isFinite(userId) || userId <= 0) {
    throw AppError.authenticationInvalid('Invalid access token subject');
  }
  return Math.trunc(userId);
}

async function readViewerId(
  req: { principal?: AuthenticatedPrincipal },
  deps: PetRoutesDeps,
): Promise<number | null> {
  if (!req.principal) return null;
  return readUserId(req, deps);
}

async function resolvePetUserId(
  principal: AuthenticatedPrincipal,
  deps: PetRoutesDeps,
): Promise<number | null> {
  if (deps.petIdentityResolver) return deps.petIdentityResolver(principal);
  if (env.DATABASE_URL) {
    return (await getOrProvisionUserByCentralSubjectOnly(principal)).id;
  }
  return deps.socialStore?.resolveUserId(principal) ?? null;
}

function toPositiveInt(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.validation(`Invalid ${label}`);
  }
  return parsed;
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function mapPetError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof PetContractError) {
    switch (error.kind) {
      case 'UNAUTHORIZED':
        return AppError.authenticationRequired(error.message, error.details);
      case 'FORBIDDEN':
        return AppError.authorizationDenied(error.message, error.details);
      case 'NOT_FOUND':
        return AppError.notFound(error.message);
      case 'CONFLICT':
        return AppError.conflict(error.message, error.details);
      case 'VERSION_CONFLICT':
        return new AppError(ErrorCode.PET_VERSION_CONFLICT, error.message, 409, error.details);
      case 'VALIDATION':
        return new AppError(ErrorCode.VALIDATION_ERROR, error.message, 422, error.details);
      case 'ANIMAL_TYPE_NOT_FOUND':
        return new AppError(ErrorCode.ANIMAL_TYPE_NOT_FOUND, error.message, 422, error.details);
      case 'ANIMAL_BREED_NOT_FOUND':
        return new AppError(ErrorCode.ANIMAL_BREED_NOT_FOUND, error.message, 422, error.details);
      case 'ANIMAL_BREED_SPECIES_MISMATCH':
        return new AppError(
          ErrorCode.ANIMAL_BREED_SPECIES_MISMATCH,
          error.message,
          422,
          error.details,
        );
      case 'INVALID_MEDIA_OWNERSHIP':
        return new AppError(
          ErrorCode.PET_INVALID_MEDIA_OWNERSHIP,
          error.message,
          403,
          error.details,
        );
      case 'MALFORMED_CURSOR':
        return new AppError(ErrorCode.PET_MALFORMED_CURSOR, error.message, 400, error.details);
      case 'UNSUPPORTED_LEGACY_VALUE':
        return new AppError(
          ErrorCode.PET_UNSUPPORTED_LEGACY_VALUE,
          error.message,
          422,
          error.details,
        );
      case 'RATE_LIMITED':
        return AppError.rateLimited(error.message, error.details);
      case 'OWNERSHIP_VIOLATION':
        return AppError.authorizationDenied(error.message, error.details);
      case 'UPLOAD_FAILED':
        return AppError.serviceUnavailable(error.message, error.details);
      case 'DOWNSTREAM_TIMEOUT':
        return new AppError(ErrorCode.SERVICE_UNAVAILABLE, error.message, 504, error.details);
      case 'DOWNSTREAM_UNAVAILABLE':
        return AppError.serviceUnavailable(error.message, error.details);
      case 'MALFORMED_RESPONSE':
        return AppError.serviceUnavailable(error.message, error.details);
      default:
        return AppError.internal(fallback);
    }
  }
  if (error instanceof Error) {
    return AppError.internal(fallback);
  }
  return AppError.internal(fallback);
}

function buildPetClient(deps: PetRoutesDeps): PetContractClient {
  if (deps.petClient) return deps.petClient;
  const mediaLookup = deps.socialStore ?? createFallbackMediaLookup();
  return createInMemoryPetClient(mediaLookup);
}

function createFallbackMediaLookup() {
  return {
    getMedia(_mediaId: number) {
      return null;
    },
  };
}

function readIdempotencyKey(req: { get(name: string): string | undefined; body?: unknown }) {
  const header = req.get('Idempotency-Key') ?? req.get('X-Idempotency-Key');
  if (header && header.trim()) return header.trim();
  if (req.body && typeof req.body === 'object' && 'idempotencyKey' in req.body) {
    const value = (req.body as { idempotencyKey?: unknown }).idempotencyKey;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
  return undefined;
}

function sendPetCollection(
  res: Parameters<typeof sendSuccess>[0],
  items: unknown[],
  req: { requestId: string; correlationId: string },
) {
  sendSuccess(
    res,
    {
      items,
      nextCursor: null,
      pets: items,
    },
    {
      requestId: req.requestId,
      correlationId: req.correlationId,
    },
  );
}

function sendPetResource(
  res: Parameters<typeof sendSuccess>[0],
  item: object,
  req: { requestId: string; correlationId: string },
  statusCode?: number,
) {
  sendSuccess(
    res,
    {
      item,
      ...item,
    },
    {
      requestId: req.requestId,
      correlationId: req.correlationId,
      statusCode,
    },
  );
}

function sendNamedCollection(
  res: Parameters<typeof sendSuccess>[0],
  payload: Record<string, unknown>,
  itemsKey: string,
  req: { requestId: string; correlationId: string },
) {
  const items = Array.isArray(payload[itemsKey]) ? payload[itemsKey] : [];
  sendSuccess(
    res,
    {
      items,
      nextCursor: null,
      ...payload,
    },
    {
      requestId: req.requestId,
      correlationId: req.correlationId,
    },
  );
}

export function petRoutes(deps: PetRoutesDeps): Router {
  const router = Router();
  const required = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });
  const client = buildPetClient(deps);

  const listMyPetsHandler = asyncHandler(async (req, res) => {
    const userId = await readUserId(req, deps);
    const payload = await client.listMyPets(userId);
    sendPetCollection(res, payload.pets, req);
  });

  router.get(['/api/v1/user/pets/all', '/api/v1/me/pets/all'], required, listMyPetsHandler);

  router.get(['/api/v1/user/pets', '/api/v1/me/pets'], required, listMyPetsHandler);

  const createPetHandler = asyncHandler(async (req, res) => {
    const userId = await readUserId(req, deps);
    try {
      const created = await client.createPet(userId, {
        ...(req.body ?? {}),
        idempotencyKey: readIdempotencyKey(req),
      });
      sendPetResource(res, created, req, 201);
    } catch (error) {
      throw mapPetError(error, 'Failed to create pet');
    }
  });

  router.post(
    ['/api/v1/user/pets/register', '/api/v1/me/pets/register'],
    required,
    createPetHandler,
  );

  router.post(['/api/v1/user/pets', '/api/v1/me/pets'], required, createPetHandler);

  router.get(
    ['/api/v1/user/pets/:petId/profile', '/api/v1/me/pets/:petId/profile'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.getPetProfile(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet profile');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId', '/api/v1/me/pets/:petId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.getOwnedPet(userId, petId);
        sendPetResource(res, payload, req);
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet');
      }
    }),
  );

  router.patch(
    ['/api/v1/user/pets/:petId', '/api/v1/me/pets/:petId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.updatePet(userId, petId, req.body ?? {});
        sendPetResource(res, payload, req);
      } catch (error) {
        throw mapPetError(error, 'Failed to update pet');
      }
    }),
  );

  router.put(
    ['/api/v1/user/pets/:petId', '/api/v1/me/pets/:petId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.updatePet(userId, petId, req.body ?? {});
        sendPetResource(res, payload, req);
      } catch (error) {
        throw mapPetError(error, 'Failed to update pet');
      }
    }),
  );

  router.delete(
    ['/api/v1/user/pets/:petId', '/api/v1/me/pets/:petId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.deletePet(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to delete pet');
      }
    }),
  );

  router.patch(
    '/api/v1/pets/:petId/profile',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.updatePetProfile(userId, petId, req.body ?? {});
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update pet profile');
      }
    }),
  );

  router.get(
    '/api/v1/pets/slug/:slug',
    optional,
    asyncHandler(async (req, res) => {
      const viewerId = await readViewerId(req, deps);
      const slug = String(req.params.slug || '').trim();
      try {
        const payload = await client.getPetBySlug(viewerId, slug);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet');
      }
    }),
  );

  router.get(
    '/api/v1/pets/:petId',
    optional,
    asyncHandler(async (req, res) => {
      const viewerId = await readViewerId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.getPetById(viewerId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet');
      }
    }),
  );

  router.post(
    '/api/v1/pets/:petId/follow',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.followPet(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to follow pet');
      }
    }),
  );

  router.delete(
    '/api/v1/pets/:petId/follow',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.unfollowPet(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to unfollow pet');
      }
    }),
  );

  router.post(
    '/api/v1/pets/:petId/like',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.likePet(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to like pet');
      }
    }),
  );

  router.delete(
    '/api/v1/pets/:petId/like',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.unlikePet(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to unlike pet');
      }
    }),
  );

  router.get(
    '/api/v1/pets/:petId/social-status',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.getPetSocialStatus(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet social status');
      }
    }),
  );

  router.get(
    '/api/v1/pets/:petId/posts',
    optional,
    asyncHandler(async (req, res) => {
      const viewerId = await readViewerId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const limit = toOptionalPositiveInt(req.query.limit) ?? 20;
      const cursor = req.query.cursor;
      try {
        const payload = await client.getPetPosts(viewerId, petId, limit, cursor);
        sendSuccess(
          res,
          {
            items: payload.items,
            nextCursor: payload.nextCursor,
            hasMore: payload.hasMore,
            posts: payload.items,
          },
          {
            requestId: req.requestId,
            correlationId: req.correlationId,
          },
        );
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet posts');
      }
    }),
  );

  router.post(
    '/api/v1/pets/:petId/posts',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.createPetPost(userId, petId, req.body ?? {});
        sendSuccess(res, payload, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create pet post');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/vaccinations', '/api/v1/me/pets/:petId/vaccinations'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listVaccinations(userId, petId);
        sendNamedCollection(res, payload, 'vaccinations', req);
      } catch (error) {
        throw mapPetError(error, 'Failed to load vaccinations');
      }
    }),
  );

  router.get(
    [
      '/api/v1/user/pets/:petId/vaccinations/:vaccinationId',
      '/api/v1/me/pets/:petId/vaccinations/:vaccinationId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const vaccinationId = toPositiveInt(req.params.vaccinationId, 'vaccination id');
      try {
        const payload = await client.getVaccination(userId, petId, vaccinationId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load vaccination');
      }
    }),
  );

  router.post(
    ['/api/v1/user/pets/:petId/vaccinations', '/api/v1/me/pets/:petId/vaccinations'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.createVaccination(userId, petId, req.body ?? {});
        sendSuccess(res, payload, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create vaccination');
      }
    }),
  );

  router.patch(
    [
      '/api/v1/user/pets/:petId/vaccinations/:vaccinationId',
      '/api/v1/me/pets/:petId/vaccinations/:vaccinationId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const vaccinationId = toPositiveInt(req.params.vaccinationId, 'vaccination id');
      try {
        const payload = await client.updateVaccination(
          userId,
          petId,
          vaccinationId,
          req.body ?? {},
        );
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update vaccination');
      }
    }),
  );

  router.delete(
    [
      '/api/v1/user/pets/:petId/vaccinations/:vaccinationId',
      '/api/v1/me/pets/:petId/vaccinations/:vaccinationId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const vaccinationId = toPositiveInt(req.params.vaccinationId, 'vaccination id');
      try {
        const payload = await client.deleteVaccination(userId, petId, vaccinationId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to delete vaccination');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/medical-history', '/api/v1/me/pets/:petId/medical-history'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.getPetMedicalHistory(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet medical history');
      }
    }),
  );

  router.get(
    [
      '/api/v1/user/pets/:petId/medical-history/records',
      '/api/v1/me/pets/:petId/medical-history/records',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listMedicalHistory(userId, petId);
        sendNamedCollection(res, payload, 'medicalHistory', req);
      } catch (error) {
        throw mapPetError(error, 'Failed to load medical history');
      }
    }),
  );

  router.get(
    [
      '/api/v1/user/pets/:petId/medical-history/records/:recordId',
      '/api/v1/me/pets/:petId/medical-history/records/:recordId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'medical history record id');
      try {
        const payload = await client.getMedicalHistoryRecord(userId, petId, recordId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load medical history record');
      }
    }),
  );

  router.post(
    [
      '/api/v1/user/pets/:petId/medical-history/records',
      '/api/v1/me/pets/:petId/medical-history/records',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.createMedicalHistoryRecord(userId, petId, req.body ?? {});
        sendSuccess(res, payload, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create medical history record');
      }
    }),
  );

  router.patch(
    [
      '/api/v1/user/pets/:petId/medical-history/records/:recordId',
      '/api/v1/me/pets/:petId/medical-history/records/:recordId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'medical history record id');
      try {
        const payload = await client.updateMedicalHistoryRecord(
          userId,
          petId,
          recordId,
          req.body ?? {},
        );
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update medical history record');
      }
    }),
  );

  router.delete(
    [
      '/api/v1/user/pets/:petId/medical-history/records/:recordId',
      '/api/v1/me/pets/:petId/medical-history/records/:recordId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'medical history record id');
      try {
        const payload = await client.deleteMedicalHistoryRecord(userId, petId, recordId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to delete medical history record');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/deworming', '/api/v1/me/pets/:petId/deworming'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listDewormingRecords(userId, petId);
        sendNamedCollection(res, payload, 'dewormingHistory', req);
      } catch (error) {
        throw mapPetError(error, 'Failed to load deworming records');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/deworming/:recordId', '/api/v1/me/pets/:petId/deworming/:recordId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'deworming record id');
      try {
        const payload = await client.getDewormingRecord(userId, petId, recordId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load deworming record');
      }
    }),
  );

  router.post(
    ['/api/v1/user/pets/:petId/deworming', '/api/v1/me/pets/:petId/deworming'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.createDewormingRecord(userId, petId, req.body ?? {});
        sendSuccess(res, payload, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create deworming record');
      }
    }),
  );

  router.patch(
    ['/api/v1/user/pets/:petId/deworming/:recordId', '/api/v1/me/pets/:petId/deworming/:recordId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'deworming record id');
      try {
        const payload = await client.updateDewormingRecord(userId, petId, recordId, req.body ?? {});
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update deworming record');
      }
    }),
  );

  router.delete(
    ['/api/v1/user/pets/:petId/deworming/:recordId', '/api/v1/me/pets/:petId/deworming/:recordId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'deworming record id');
      try {
        const payload = await client.deleteDewormingRecord(userId, petId, recordId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to delete deworming record');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/weights', '/api/v1/me/pets/:petId/weights'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listWeightRecords(userId, petId);
        sendNamedCollection(res, payload, 'weightHistory', req);
      } catch (error) {
        throw mapPetError(error, 'Failed to load weight records');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/weights/:recordId', '/api/v1/me/pets/:petId/weights/:recordId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'weight record id');
      try {
        const payload = await client.getWeightRecord(userId, petId, recordId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load weight record');
      }
    }),
  );

  router.post(
    ['/api/v1/user/pets/:petId/weights', '/api/v1/me/pets/:petId/weights'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.createWeightRecord(userId, petId, req.body ?? {});
        sendSuccess(res, payload, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create weight record');
      }
    }),
  );

  router.patch(
    ['/api/v1/user/pets/:petId/weights/:recordId', '/api/v1/me/pets/:petId/weights/:recordId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'weight record id');
      try {
        const payload = await client.updateWeightRecord(userId, petId, recordId, req.body ?? {});
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update weight record');
      }
    }),
  );

  router.delete(
    ['/api/v1/user/pets/:petId/weights/:recordId', '/api/v1/me/pets/:petId/weights/:recordId'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const recordId = toPositiveInt(req.params.recordId, 'weight record id');
      try {
        const payload = await client.deleteWeightRecord(userId, petId, recordId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to delete weight record');
      }
    }),
  );

  router.get(
    ['/api/v1/user/pets/:petId/documents', '/api/v1/me/pets/:petId/documents'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listDocuments(userId, petId);
        sendNamedCollection(res, payload, 'documents', req);
      } catch (error) {
        throw mapPetError(error, 'Failed to load documents');
      }
    }),
  );

  router.get(
    [
      '/api/v1/user/pets/:petId/documents/:documentId',
      '/api/v1/me/pets/:petId/documents/:documentId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const documentId = toPositiveInt(req.params.documentId, 'document id');
      try {
        const payload = await client.getDocument(userId, petId, documentId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load document');
      }
    }),
  );

  router.post(
    ['/api/v1/user/pets/:petId/documents', '/api/v1/me/pets/:petId/documents'],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.createDocument(userId, petId, req.body ?? {});
        sendSuccess(res, payload, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create document');
      }
    }),
  );

  router.patch(
    [
      '/api/v1/user/pets/:petId/documents/:documentId',
      '/api/v1/me/pets/:petId/documents/:documentId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const documentId = toPositiveInt(req.params.documentId, 'document id');
      try {
        const payload = await client.updateDocument(userId, petId, documentId, req.body ?? {});
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update document');
      }
    }),
  );

  router.delete(
    [
      '/api/v1/user/pets/:petId/documents/:documentId',
      '/api/v1/me/pets/:petId/documents/:documentId',
    ],
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, deps);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const documentId = toPositiveInt(req.params.documentId, 'document id');
      try {
        const payload = await client.deleteDocument(userId, petId, documentId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to delete document');
      }
    }),
  );

  return router;
}
