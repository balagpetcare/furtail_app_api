import { Router, type Request, type Response } from 'express';
import { AppError } from '../core/errors/app-error';
import { sendSuccess } from '../core/http/api-response';
import { optionalAuth, requiredAuth } from '../security/auth-middleware';
import { hasPermission, hasRole } from '../security/authorization';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';
import { AdoptionStore } from '../modules/adoption/adoption-store';
import { getPrisma } from '../infrastructure/db/prisma-client';
import { createLocationStore, type LocationStore } from '../modules/locations/location-store';
import { createPrismaLocationDataSource } from '../modules/locations/prisma-location-data-source';

export interface AdoptionRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
  adoptionStore?: AdoptionStore;
  locationStore?: LocationStore;
}

const GUEST_VIEWER_ID = 0;

export function adoptionRoutes(deps: AdoptionRoutesDeps): Router {
  const router = Router();
  const authenticate = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });

  const socialStore = deps.socialStore ?? createSocialCoreStore();
  const adoptionStore = deps.adoptionStore ?? new AdoptionStore(getPrisma(), socialStore);
  const locationStore =
    deps.locationStore ?? createLocationStore(createPrismaLocationDataSource(getPrisma()));
  const basePaths = ['/api/v1/adoption', '/api/v1/adoptions'] as const;

  function toOptionalPositiveInt(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  function parseAndNormalizeDateOfBirth(value: unknown): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw AppError.adoptionDateInvalid('Invalid approximate date of birth');
      }
      return value;
    }

    if (typeof value !== 'string') {
      throw AppError.adoptionDateInvalid('Invalid approximate date of birth');
    }

    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    // 1. Matches valid ISO-8601 ending in Z (UTC)
    const utcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/i;
    if (utcRegex.test(trimmed)) {
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        throw AppError.adoptionDateInvalid('Invalid approximate date of birth');
      }
      return d;
    }

    // 2. Matches known legacy timezone-less format
    const legacyRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
    if (legacyRegex.test(trimmed)) {
      const d = new Date(trimmed + 'Z');
      if (isNaN(d.getTime())) {
        throw AppError.adoptionDateInvalid('Invalid approximate date of birth');
      }
      return d;
    }

    // Any other format is invalid
    throw AppError.adoptionDateInvalid('Invalid approximate date of birth');
  }

  async function validateAdoptionLocation(
    body: Record<string, unknown>,
    isPublish = false,
  ): Promise<void> {
    const countryId = toOptionalPositiveInt(body.countryId);
    const divisionId = toOptionalPositiveInt(body.bdDivisionId);
    const districtId = toOptionalPositiveInt(body.bdDistrictId);
    const cityCorporationId = toOptionalPositiveInt(body.bdCityCorporationId);
    const zoneId = toOptionalPositiveInt(body.bdZoneId);
    const wardId = toOptionalPositiveInt(body.bdWardId);
    const upazilaId = toOptionalPositiveInt(body.bdUpazilaId);
    const unionId = toOptionalPositiveInt(body.bdUnionId);

    // If country is Bangladesh
    if (countryId === 1) {
      // For publish, division and district must be selected at least.
      if (isPublish && (divisionId === undefined || districtId === undefined)) {
        throw AppError.adoptionLocationRequired(
          'Bangladesh location (division and district) is required',
        );
      }
    }

    if (
      divisionId === undefined &&
      districtId === undefined &&
      cityCorporationId === undefined &&
      zoneId === undefined &&
      wardId === undefined &&
      upazilaId === undefined &&
      unionId === undefined
    ) {
      return;
    }

    const result = await locationStore.validateSelection({
      divisionId,
      districtId,
      cityCorporationId,
      zoneId,
      wardId,
      upazilaId,
      unionId,
    });

    if (!result.valid) {
      throw AppError.locationParentInvalid(result.reason ?? 'Invalid location selection');
    }
  }

  const route = (fn: (req: Request, res: Response) => Promise<void>) =>
    asyncHandler(async (req, res) => {
      await fn(req, res);
    });

  async function currentUserId(req: Request): Promise<number> {
    const principal = req.principal;
    if (!principal) throw AppError.authenticationRequired();
    const userId = await socialStore.resolveUserId(principal);
    if (!userId) throw AppError.authenticationRequired();
    return userId;
  }

  async function currentViewerContext(req: Request) {
    const principal = req.principal;
    if (!principal) return { userId: GUEST_VIEWER_ID, isManager: false };
    const userId = (await socialStore.resolveUserId(principal)) ?? GUEST_VIEWER_ID;
    const isManager = hasRole(principal, 'admin') || hasPermission(principal, 'adoption:manage');
    return { userId, isManager };
  }

  for (const basePath of basePaths) {
    router.post(
      `${basePath}/drafts`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const idempotencyKey = req.header('Idempotency-Key')?.trim();

        if (req.body && 'approximateDateOfBirth' in req.body) {
          req.body.approximateDateOfBirth = parseAndNormalizeDateOfBirth(
            req.body.approximateDateOfBirth,
          );
        }
        await validateAdoptionLocation(req.body ?? {});

        const draft = await adoptionStore.createDraft(userId, req.body ?? {}, idempotencyKey);
        sendSuccess(res, draft, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      }),
    );

    router.post(
      `${basePath}/:id/favorite`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const listing = await adoptionStore.favoriteListing(userId, id);
        sendSuccess(res, listing, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.delete(
      `${basePath}/:id/favorite`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const listing = await adoptionStore.unfavoriteListing(userId, id);
        sendSuccess(res, listing, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.patch(
      `${basePath}/:id/draft`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);

        if (req.body && 'approximateDateOfBirth' in req.body) {
          req.body.approximateDateOfBirth = parseAndNormalizeDateOfBirth(
            req.body.approximateDateOfBirth,
          );
        }
        const existing = await adoptionStore.getListing(userId, id, true);
        const merged = { ...existing, ...(req.body ?? {}) };
        await validateAdoptionLocation(merged);

        const draft = await adoptionStore.updateListing(userId, id, req.body ?? {});
        sendSuccess(res, draft, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.post(
      `${basePath}/:id/publish`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);

        const existing = await adoptionStore.getListing(userId, id, true);
        await validateAdoptionLocation(existing, true);

        const published = await adoptionStore.publishListing(userId, id);
        sendSuccess(res, published, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.get(
      `${basePath}/feed`,
      optional,
      route(async (req, res) => {
        const { userId } = await currentViewerContext(req);
        const listings = await adoptionStore.listPublic(req.query, userId);
        sendSuccess(
          res,
          { items: listings },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      }),
    );

    router.get(
      `${basePath}/my`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const items = await adoptionStore.listOwned(userId);
        sendSuccess(res, items, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.get(
      `${basePath}/:id`,
      optional,
      route(async (req, res) => {
        const { userId, isManager } = await currentViewerContext(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const listing = await adoptionStore.getListing(userId, id, isManager);
        sendSuccess(res, listing, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.get(
      `${basePath}/:id/comments`,
      optional,
      route(async (req, res) => {
        const { userId } = await currentViewerContext(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const parsedLimit = Number.parseInt(String(req.query.limit ?? 50), 10);
        const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
        const comments = await adoptionStore.listComments(userId, id, limit);
        sendSuccess(res, comments.items, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          meta: comments.meta,
        });
      }),
    );

    router.post(
      `${basePath}/:id/comments`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const text = String(req.body?.text ?? '').trim();
        if (!text) throw AppError.validation('Comment text is required');
        const result = await adoptionStore.addComment(userId, id, text);
        sendSuccess(res, result, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      }),
    );

    router.delete(
      `${basePath}/:id/comments/:commentId`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const commentId = parseInt(req.params.commentId ?? '0', 10);
        const result = await adoptionStore.deleteComment(userId, id, commentId);
        sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    router.post(
      `${basePath}/:id/report`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const reasonCode = String(req.body?.reasonCode ?? '').trim();
        if (!reasonCode) throw AppError.validation('reasonCode is required');
        const result = await adoptionStore.reportListing(
          userId,
          id,
          reasonCode,
          req.body?.details ? String(req.body.details) : undefined,
        );
        sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );

    const handleStatus = route(async (req, res) => {
      const userId = await currentUserId(req);
      const id = parseInt(req.params.id ?? '0', 10);
      const status = req.body?.status;
      if (
        ![
          'DRAFT',
          'PENDING_REVIEW',
          'PUBLISHED',
          'PAUSED',
          'ADOPTED',
          'REJECTED',
          'ARCHIVED',
          'DELETED',
        ].includes(status)
      ) {
        throw AppError.validation('Invalid status');
      }
      const listing = await adoptionStore.setStatus(
        userId,
        id,
        status as Parameters<AdoptionStore['setStatus']>[2],
      );
      sendSuccess(res, listing, { requestId: req.requestId, correlationId: req.correlationId });
    });

    router.patch(`${basePath}/:id/status`, authenticate, handleStatus);
    router.post(`${basePath}/:id/status`, authenticate, handleStatus);

    router.post(
      `${basePath}/:id/applications`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const application = await adoptionStore.createApplication(userId, id, req.body ?? {});
        const pet = await adoptionStore.getListing(userId, id, false);
        sendSuccess(
          res,
          { ...application, pet },
          { requestId: req.requestId, correlationId: req.correlationId, statusCode: 201 },
        );
      }),
    );

    router.post(
      `${basePath}/:id/apply`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const application = await adoptionStore.createApplication(userId, id, req.body ?? {});
        const pet = await adoptionStore.getListing(userId, id, false);
        sendSuccess(
          res,
          { ...application, pet },
          { requestId: req.requestId, correlationId: req.correlationId, statusCode: 201 },
        );
      }),
    );

    router.delete(
      `${basePath}/:id`,
      authenticate,
      route(async (req, res) => {
        const userId = await currentUserId(req);
        const id = parseInt(req.params.id ?? '0', 10);
        const result = await adoptionStore.hardDeleteListing(userId, id);
        sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
      }),
    );
  }

  router.get(
    '/api/v1/me/adoption-applications',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req);
      const applications = await adoptionStore.listApplicantApplications(userId);
      const items = [];
      for (const application of applications) {
        const pet = await adoptionStore.getListing(userId, application.adoptionListingId, false);
        items.push({
          ...application,
          pet,
          applicant: req.principal ? socialStore.getCurrentUserPayload(userId) : null,
        });
      }
      sendSuccess(res, items, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/me/adoptions/:id/applications',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req);
      const adoptionId = parseInt(req.params.id ?? '0', 10);
      const applications = await adoptionStore.listListingApplications(userId, adoptionId);
      const items = [];
      for (const application of applications) {
        const pet = await adoptionStore.getListing(userId, adoptionId, false);
        items.push({
          ...application,
          pet,
          applicant: socialStore.getVisitorUserPayload(userId, application.applicantUserId),
        });
      }
      sendSuccess(res, items, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/me/adoption-applications/:applicationId',
    authenticate,
    route(async (req, res) => {
      const { userId, isManager } = await currentViewerContext(req);
      const applicationId = parseInt(req.params.applicationId ?? '0', 10);
      const application = await adoptionStore.getApplication(userId, applicationId, isManager);
      const pet = await adoptionStore.getListing(userId, application.adoptionListingId, isManager);
      sendSuccess(
        res,
        {
          ...application,
          pet,
          applicant: socialStore.getVisitorUserPayload(userId, application.applicantUserId),
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/me/adoption-applications/:applicationId/status',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req);
      const applicationId = parseInt(req.params.applicationId ?? '0', 10);
      const status = String(req.body?.status ?? '')
        .trim()
        .toUpperCase();
      if (
        ![
          'SUBMITTED',
          'VIEWED',
          'SHORTLISTED',
          'OWNER_REVIEW',
          'INTERVIEW_SCHEDULED',
          'APPROVED',
          'REJECTED',
          'CANCELLED',
        ].includes(status)
      ) {
        throw AppError.validation('Invalid application status');
      }
      const updated = await adoptionStore.updateApplicationStatus(
        userId,
        applicationId,
        status as Parameters<AdoptionStore['updateApplicationStatus']>[2],
        req.body?.note ? String(req.body.note) : undefined,
      );
      const pet = await adoptionStore.getListing(userId, updated.adoptionListingId, false);
      sendSuccess(
        res,
        {
          ...updated,
          pet,
          applicant: socialStore.getVisitorUserPayload(userId, updated.applicantUserId),
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.patch(
    '/api/v1/me/adoption-applications/:applicationId/notes',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req);
      const applicationId = parseInt(req.params.applicationId ?? '0', 10);
      const notes = String(req.body?.notes ?? '').trim();
      const updated = await adoptionStore.updateApplicationNotes(userId, applicationId, notes);
      const pet = await adoptionStore.getListing(userId, updated.adoptionListingId, false);
      sendSuccess(
        res,
        {
          ...updated,
          pet,
          applicant: socialStore.getVisitorUserPayload(userId, updated.applicantUserId),
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  return router;
}
