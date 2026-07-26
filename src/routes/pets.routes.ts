import { Router } from 'express';

import { AppError } from '../core/errors/app-error';
import { ErrorCode } from '../core/errors/error-codes';
import { sendSuccess } from '../core/http/api-response';
import { optionalAuth, requiredAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
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
}

function readUserId(req: { principal?: { sub: string } }): number {
  const parsed = Number(req.principal?.sub);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.authenticationInvalid('Invalid access token subject');
  }
  return Math.trunc(parsed);
}

function readViewerId(req: { principal?: { sub: string } }): number | null {
  if (!req.principal) return null;
  const parsed = Number(req.principal.sub);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
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
      case 'VALIDATION':
        return new AppError(ErrorCode.VALIDATION_ERROR, error.message, 422, error.details);
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

export function petRoutes(deps: PetRoutesDeps): Router {
  const router = Router();
  const required = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });
  const client = buildPetClient(deps);

  router.get(
    '/api/v1/user/pets/all',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const payload = await client.listMyPets(userId);
      sendSuccess(res, payload.pets, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/user/pets',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const payload = await client.listMyPets(userId);
      sendSuccess(res, payload.pets, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/user/pets/register',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      try {
        const created = await client.createPet(userId, req.body ?? {});
        sendSuccess(res, created, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create pet');
      }
    }),
  );

  router.post(
    '/api/v1/user/pets',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      try {
        const created = await client.createPet(userId, req.body ?? {});
        sendSuccess(res, created, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to create pet');
      }
    }),
  );

  router.get(
    '/api/v1/user/pets/:petId/profile',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.getOwnedPet(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet');
      }
    }),
  );

  router.patch(
    '/api/v1/user/pets/:petId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.updatePet(userId, petId, req.body ?? {});
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update pet');
      }
    }),
  );

  router.put(
    '/api/v1/user/pets/:petId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.updatePet(userId, petId, req.body ?? {});
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to update pet');
      }
    }),
  );

  router.delete(
    '/api/v1/user/pets/:petId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
      const userId = readUserId(req);
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
      const viewerId = readViewerId(req);
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
      const viewerId = readViewerId(req);
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
      const userId = readUserId(req);
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
      const userId = readUserId(req);
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
      const userId = readUserId(req);
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
      const userId = readUserId(req);
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
      const userId = readUserId(req);
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
      const viewerId = readViewerId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      const limit = toOptionalPositiveInt(req.query.limit) ?? 20;
      const cursor = req.query.cursor;
      try {
        const payload = await client.getPetPosts(viewerId, petId, limit, cursor);
        sendSuccess(res, payload.items, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          meta: {
            nextCursor: payload.nextCursor,
            hasMore: payload.hasMore,
          },
        });
      } catch (error) {
        throw mapPetError(error, 'Failed to load pet posts');
      }
    }),
  );

  router.post(
    '/api/v1/pets/:petId/posts',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/vaccinations',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listVaccinations(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load vaccinations');
      }
    }),
  );

  router.get(
    '/api/v1/user/pets/:petId/vaccinations/:vaccinationId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/vaccinations',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/vaccinations/:vaccinationId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/vaccinations/:vaccinationId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/medical-history',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/medical-history/records',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listMedicalHistory(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load medical history');
      }
    }),
  );

  router.get(
    '/api/v1/user/pets/:petId/medical-history/records/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/medical-history/records',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/medical-history/records/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/medical-history/records/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/deworming',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listDewormingRecords(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load deworming records');
      }
    }),
  );

  router.get(
    '/api/v1/user/pets/:petId/deworming/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/deworming',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/deworming/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/deworming/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/weights',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listWeightRecords(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load weight records');
      }
    }),
  );

  router.get(
    '/api/v1/user/pets/:petId/weights/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/weights',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/weights/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/weights/:recordId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/documents',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
      const petId = toPositiveInt(req.params.petId, 'pet id');
      try {
        const payload = await client.listDocuments(userId, petId);
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapPetError(error, 'Failed to load documents');
      }
    }),
  );

  router.get(
    '/api/v1/user/pets/:petId/documents/:documentId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/documents',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/documents/:documentId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
    '/api/v1/user/pets/:petId/documents/:documentId',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req);
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
