import { Router, type Request, type Response } from 'express';

import { AppError } from '../core/errors/app-error';
import { sendSuccess } from '../core/http/api-response';
import { optionalAuth, requiredAuth } from '../security/auth-middleware';
import { hasPermission, hasRole } from '../security/authorization';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';
import {
  FundraisingContractError,
  type FundraisingStore,
  type WebhookInput,
} from '../modules/fundraising/fundraising-store';
import { getPrisma } from '../infrastructure/db/prisma-client';
import { createPrismaLocationDataSource } from '../modules/locations/prisma-location-data-source';
import { createLocationStore, type LocationStore } from '../modules/locations/location-store';
import { env } from '../config/env';

export interface FundraisingRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
  fundraisingStore: FundraisingStore;
  locationStore?: LocationStore;
}

/**
 * Server-side location-hierarchy validation for fundraising draft/campaign
 * writes — a client can send a stale combination (e.g. district changed
 * but the union/area field wasn't cleared); this rejects it with a
 * field-level typed error instead of silently persisting an inconsistent
 * location.
 */
async function assertLocationHierarchyValid(
  locationStore: LocationStore,
  body: Record<string, unknown>,
): Promise<void> {
  const divisionId = toOptionalPositiveInt(body.bdDivisionId);
  const districtId = toOptionalPositiveInt(body.bdDistrictId);
  const cityCorporationId = toOptionalPositiveInt(body.bdCityCorporationId);
  const zoneId = toOptionalPositiveInt(body.bdZoneId);
  const wardId = toOptionalPositiveInt(body.bdWardId);
  const upazilaId = toOptionalPositiveInt(body.bdUpazilaId);
  const unionId = toOptionalPositiveInt(body.bdUnionId);
  const hasBangladeshFields =
    divisionId !== undefined ||
    districtId !== undefined ||
    cityCorporationId !== undefined ||
    zoneId !== undefined ||
    wardId !== undefined ||
    upazilaId !== undefined ||
    unionId !== undefined;
  const hasInternationalFields =
    body.isInternational === true ||
    body.isInternational === 'true' ||
    body.isInternational === 1 ||
    body.isInternational === '1' ||
    toText(body.countryName) !== null ||
    toText(body.stateName) !== null ||
    toText(body.cityName) !== null ||
    toText(body.addressLine) !== null ||
    toText(body.formattedAddress) !== null;
  if (!hasBangladeshFields && !hasInternationalFields) {
    return;
  }
  if (hasBangladeshFields && hasInternationalFields) {
    throw AppError.validation(
      'Do not mix Bangladesh hierarchy fields with international location fields',
    );
  }
  if (hasInternationalFields && !hasBangladeshFields) {
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

function toOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function fundraisingRoutes(deps: FundraisingRoutesDeps): Router {
  const router = Router();
  const authenticate = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });
  const socialStore = deps.socialStore ?? createSocialCoreStore();
  const locationStore =
    deps.locationStore ?? createLocationStore(createPrismaLocationDataSource(getPrisma()));
  const route = (fn: (req: Request, res: Response) => Promise<void>) =>
    asyncHandler(async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        throw mapFundraisingError(error);
      }
    });

  router.get(
    '/api/v1/fundraising/account/me',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const account = await deps.fundraisingStore.getAccount(userId);
      if (!account) throw AppError.notFound('Fundraising account not found');
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/accounts/:userId',
    authenticate,
    route(async (req, res) => {
      const requesterUserId = await currentUserId(req, socialStore);
      const targetUserId = readInt(req.params.userId, 'userId');
      const principal = req.principal;
      if (!principal) throw AppError.authenticationRequired();
      const isReviewer =
        hasRole(principal, 'admin') || hasPermission(principal, 'fundraising:manage:any');
      const account = await deps.fundraisingStore.getAccountForReview(
        requesterUserId,
        targetUserId,
        { isReviewer },
      );
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.patch(
    '/api/v1/fundraising/account',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const body = validateAccountPatchBody(req.body ?? {});
      const account = await deps.fundraisingStore.upsertAccount(userId, body);
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/payout/catalog',
    authenticate,
    route(async (req, res) => {
      sendSuccess(res, [], { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/payout/methods',
    authenticate,
    route(async (req, res) => {
      sendSuccess(res, [], { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/account/submit',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const account = await deps.fundraisingStore.submitAccount(userId);
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/account/documents',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const title = readText(req.body?.title, 'title');
      const mediaId = readInt(req.body?.mediaId, 'mediaId');
      const documentType =
        toText(req.body?.documentType)?.toUpperCase() === 'PRIMARY'
          ? ('PRIMARY' as const)
          : ('SUPPORTING' as const);
      const document = await deps.fundraisingStore.addAccountDocument(userId, {
        title,
        mediaId,
        documentType,
      });
      sendSuccess(res, document, {
        requestId: req.requestId,
        correlationId: req.correlationId,
        statusCode: 201,
      });
    }),
  );

  router.delete(
    '/api/v1/fundraising/account/documents/:id',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const documentId = readInt(req.params.id, 'id');
      const result = await deps.fundraisingStore.deleteAccountDocument(userId, documentId);
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/feed',
    optional,
    route(async (req, res) => {
      const { userId, isManager } = await currentViewerContext(req, socialStore);
      const feed = await deps.fundraisingStore.listFeed(
        userId,
        {
          limit: readLimit(req.query.limit, 50),
          cursor: toText(req.query.cursor) ?? undefined,
          verified: parseOptionalBoolean(req.query.verified),
          category: toText(req.query.category) ?? undefined,
          location: toText(req.query.location) ?? undefined,
          sort: toText(req.query.sort) ?? undefined,
        },
        { isManager },
      );
      sendSuccess(res, feed, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/my/campaigns',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const items = await deps.fundraisingStore.listMyCampaigns(
        userId,
        readLimit(req.query.limit, 100),
      );
      sendSuccess(res, items, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/campaigns/:id',
    optional,
    route(async (req, res) => {
      const { userId, isManager } = await currentViewerContext(req, socialStore);
      const campaignId = readInt(req.params.id, 'id');
      const campaign = await deps.fundraisingStore.getCampaign(userId, campaignId, { isManager });
      sendSuccess(res, campaign, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/drafts',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      await assertLocationHierarchyValid(locationStore, req.body ?? {});
      const draft = await deps.fundraisingStore.createDraft(
        userId,
        req.body ?? {},
        readIdempotencyKey(req),
      );
      sendSuccess(res, draft, {
        requestId: req.requestId,
        correlationId: req.correlationId,
        statusCode: 201,
      });
    }),
  );

  router.get(
    '/api/v1/fundraising/campaigns/:id/draft',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const draft = await deps.fundraisingStore.getDraft(
        userId,
        String(readInt(req.params.id, 'id')),
      );
      sendSuccess(res, draft, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.patch(
    '/api/v1/fundraising/campaigns/:id/draft',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      await assertLocationHierarchyValid(locationStore, req.body ?? {});
      const draft = await deps.fundraisingStore.updateDraft(
        userId,
        String(readInt(req.params.id, 'id')),
        req.body ?? {},
      );
      sendSuccess(res, draft, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/:id/submit',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const draft = await deps.fundraisingStore.submitDraft(
        userId,
        String(readInt(req.params.id, 'id')),
        readIdempotencyKey(req),
      );
      sendSuccess(res, draft, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      await assertLocationHierarchyValid(locationStore, req.body ?? {});
      const campaign = await deps.fundraisingStore.createCampaign(userId, req.body ?? {});
      sendSuccess(res, campaign, {
        requestId: req.requestId,
        correlationId: req.correlationId,
        statusCode: 201,
      });
    }),
  );

  router.patch(
    '/api/v1/fundraising/campaigns/:id',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      await assertLocationHierarchyValid(locationStore, req.body ?? {});
      const campaign = await deps.fundraisingStore.updateCampaign(
        userId,
        readInt(req.params.id, 'id'),
        req.body ?? {},
      );
      sendSuccess(res, campaign, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/:id/publish',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const campaign = await deps.fundraisingStore.publishCampaign(
        userId,
        readInt(req.params.id, 'id'),
      );
      sendSuccess(res, campaign, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.delete(
    '/api/v1/fundraising/campaigns/:id',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const deleted = await deps.fundraisingStore.deleteCampaign(
        userId,
        readInt(req.params.id, 'id'),
      );
      sendSuccess(res, deleted, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/campaigns/:id/donations',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const donations = await deps.fundraisingStore.listDonations(
        userId,
        readInt(req.params.id, 'id'),
        readLimit(req.query.limit, 50),
        toText(req.query.cursor) ?? undefined,
      );
      sendSuccess(res, donations, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/campaigns/:id/updates',
    optional,
    route(async (req, res) => {
      const { userId, isManager } = await currentViewerContext(req, socialStore);
      const updates = await deps.fundraisingStore.listUpdates(
        userId,
        readInt(req.params.id, 'id'),
        readLimit(req.query.limit, 50),
        toText(req.query.cursor) ?? undefined,
        { isManager },
      );
      sendSuccess(res, updates, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/:id/updates',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const update = await deps.fundraisingStore.createUpdate(
        userId,
        readInt(req.params.id, 'id'),
        {
          title: req.body?.title,
          caption: req.body?.caption,
          mediaIds: Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : [],
        },
      );
      sendSuccess(res, update, {
        requestId: req.requestId,
        correlationId: req.correlationId,
        statusCode: 201,
      });
    }),
  );

  router.patch(
    '/api/v1/fundraising/updates/:id',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const update = await deps.fundraisingStore.updateUpdate(
        userId,
        readInt(req.params.id, 'id'),
        {
          title: req.body?.title,
          caption: req.body?.caption,
          mediaIds: Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : undefined,
        },
      );
      sendSuccess(res, update, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.delete(
    '/api/v1/fundraising/updates/:id',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const update = await deps.fundraisingStore.deleteUpdate(userId, readInt(req.params.id, 'id'));
      sendSuccess(res, update, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/:id/donate',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const idempotencyKey = readIdempotencyKey(req);
      if (!idempotencyKey) throw AppError.validation('Idempotency key is required');
      const result = await deps.fundraisingStore.createDonationCheckout(
        userId,
        readInt(req.params.id, 'id'),
        {
          amountMinor: req.body?.amount,
          currencyCode: req.body?.currencyCode,
          returnUrl: readText(req.body?.returnUrl, 'returnUrl'),
          cancelUrl: readText(req.body?.cancelUrl, 'cancelUrl'),
          supportMessage: req.body?.supportMessage,
          isAnonymous: req.body?.isAnonymous,
          consentAccepted: req.body?.consentAccepted,
          paymentMethodLabel: req.body?.paymentMethodLabel,
          donorName: req.body?.donorName,
          donorEmail: req.body?.donorEmail,
          donorPhone: req.body?.donorPhone,
          donorAddress: req.body?.donorAddress,
          donorCity: req.body?.donorCity,
          ipAddress: req.ip,
        },
        idempotencyKey,
      );
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/donations/:id',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const donation = await deps.fundraisingStore.getDonationAttemptByReference(
        userId,
        req.params.id ?? '',
      );
      sendSuccess(res, donation, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/payments/:referenceId/status',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const status = await deps.fundraisingStore.getPaymentStatus(
        userId,
        req.params.referenceId ?? '',
      );
      sendSuccess(res, status, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  /**
   * EPS redirects the payer's *browser* here after checkout — this is not
   * a trusted server-to-server push, so the outcome implied by the path
   * (success/fail/cancel) or any query parameter is never applied directly.
   * Every hit — regardless of which of the three paths — reconciles via
   * EPS's authoritative, x-hash-authenticated status API before doing
   * anything, then redirects the browser into the Flutter app's own deep
   * link with the *verified* outcome, never the unverified one EPS implied.
   */
  const epsReturnHandler = (fallbackOutcome: 'success' | 'fail' | 'cancel') =>
    asyncHandler(async (req: Request, res: Response) => {
      const referenceId =
        typeof req.query.merchantTransactionId === 'string' ? req.query.merchantTransactionId : '';
      if (!referenceId) {
        res.redirect(
          `${env.FUNDRAISING_APP_RETURN_DEEP_LINK}?status=error&reason=missing_reference`,
        );
        return;
      }
      let verifiedStatus: string;
      try {
        const result = await deps.fundraisingStore.reconcileEpsPayment(referenceId);
        verifiedStatus = String((result as { status?: unknown }).status ?? fallbackOutcome);
      } catch {
        // Reconciliation failure must never be reported to the app as a
        // false success — fall back to a safe "pending" signal so Flutter
        // re-queries status instead of assuming anything.
        verifiedStatus = 'PENDING_VERIFICATION';
      }
      const redirectUrl = `${env.FUNDRAISING_APP_RETURN_DEEP_LINK}?status=${encodeURIComponent(
        verifiedStatus,
      )}&referenceId=${encodeURIComponent(referenceId)}`;
      res.redirect(redirectUrl);
    });

  router.get('/api/v1/fundraising/payments/eps/success', epsReturnHandler('success'));
  router.get('/api/v1/fundraising/payments/eps/fail', epsReturnHandler('fail'));
  router.get('/api/v1/fundraising/payments/eps/cancel', epsReturnHandler('cancel'));

  router.post(
    '/api/v1/fundraising/payments/webhooks',
    route(async (req, res) => {
      const result = await deps.fundraisingStore.handleWebhook(parseWebhook(req));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/payments/webhooks/provider',
    route(async (req, res) => {
      const result = await deps.fundraisingStore.handleWebhook(parseWebhook(req));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}

async function currentUserId(req: Request, store: SocialCoreStore): Promise<number> {
  const principal = req.principal;
  if (!principal) throw AppError.authenticationRequired();
  const userId = await store.resolveUserId(principal);
  if (!userId) throw AppError.authenticationRequired();
  return userId;
}

/** Sentinel viewer id for an unauthenticated (guest) request — never matches a real user id. */
const GUEST_VIEWER_ID = 0;

/**
 * Resolves the viewer for read-only, guest-accessible endpoints (public
 * campaign feed/detail/updates): an authenticated user's real local id, or
 * the guest sentinel when no token was presented. Also derives moderator
 * access straight from the verified JWT principal's roles/permissions —
 * unlike the store's internal `hasManageAnyAccess`, which only ever sees a
 * synthetic principal with no roles, so this is the only path that lets a
 * real admin/moderator bypass campaign visibility restrictions.
 */
async function currentViewerContext(
  req: Request,
  store: SocialCoreStore,
): Promise<{ userId: number; isManager: boolean }> {
  const principal = req.principal;
  if (!principal) return { userId: GUEST_VIEWER_ID, isManager: false };
  const userId = (await store.resolveUserId(principal)) ?? GUEST_VIEWER_ID;
  const isManager =
    hasRole(principal, 'admin') || hasPermission(principal, 'fundraising:manage:any');
  return { userId, isManager };
}

function readInt(value: unknown, field: string): number {
  const parsed = readIntOrString(value);
  if (parsed === null) throw AppError.validation(`${field} must be an integer`);
  return parsed;
}

function readIntOrString(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function readText(value: unknown, field: string): string {
  const text = toText(value);
  if (!text) throw AppError.validation(`${field} is required`);
  return text;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readLimit(value: unknown, fallback: number): number {
  const parsed = readIntOrString(value);
  if (parsed === null) return fallback;
  return Math.max(1, Math.min(parsed, 100));
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  const text = toText(value)?.toLowerCase();
  if (!text) return undefined;
  if (['1', 'true', 'yes'].includes(text)) return true;
  if (['0', 'false', 'no'].includes(text)) return false;
  return undefined;
}

const ALLOWED_ACCOUNT_PATCH_FIELDS = new Set([
  'accountType',
  'fullName',
  'dateOfBirth',
  'presentAddress',
  'permanentAddress',
  'occupation',
  'verificationDraftJson',
  'area',
  'isInternational',
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'bdDivisionId',
  'bdDistrictId',
  'bdUpazilaId',
  'bdUnionId',
  'bdAddressMode',
  'bdCityCorporationId',
  'bdZoneId',
  'bdWardId',
  'primaryDocumentType',
  'nationalIdNumber',
  'birthRegNumber',
  'passportNumber',
  'studentIdNumber',
  'drivingLicenceNumber',
  'countryCode',
  'countryName',
  'stateName',
  'cityName',
  'addressLine',
  'latitude',
  'longitude',
  'formattedAddress',
  'orgName',
  'orgDescription',
  'orgWorkType',
]);

/**
 * Whitelists and shape-checks the fundraising account PATCH body. Rejects
 * unknown fields outright and enforces a YYYY-MM-DD-prefixed date-only
 * value for dateOfBirth so a malformed client payload fails fast instead of
 * being silently dropped downstream.
 */
function validateAccountPatchBody(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_ACCOUNT_PATCH_FIELDS.has(key)) continue;
    result[key] = value;
  }
  if (has(result, 'dateOfBirth') && result.dateOfBirth !== null) {
    const text = toText(result.dateOfBirth);
    if (!text || !/^\d{4}-\d{2}-\d{2}/.test(text)) {
      throw AppError.validation('dateOfBirth must be a YYYY-MM-DD date');
    }
  }
  if (has(result, 'isInternational') && typeof result.isInternational !== 'boolean') {
    throw AppError.validation('isInternational must be a boolean');
  }
  const hasBangladeshFields =
    has(result, 'divisionId') ||
    has(result, 'districtId') ||
    has(result, 'upazilaId') ||
    has(result, 'unionId') ||
    has(result, 'bdDivisionId') ||
    has(result, 'bdDistrictId') ||
    has(result, 'bdUpazilaId') ||
    has(result, 'bdUnionId') ||
    has(result, 'bdAddressMode') ||
    has(result, 'bdCityCorporationId') ||
    has(result, 'bdZoneId') ||
    has(result, 'bdWardId');
  const hasInternationalFields =
    (has(result, 'isInternational') && result.isInternational === true) ||
    has(result, 'countryName') ||
    has(result, 'stateName') ||
    has(result, 'cityName') ||
    has(result, 'addressLine') ||
    has(result, 'latitude') ||
    has(result, 'longitude') ||
    has(result, 'formattedAddress');
  if (result.isInternational === true && hasBangladeshFields) {
    throw AppError.validation('International accounts cannot include Bangladesh location fields');
  }
  if (result.isInternational !== true && hasInternationalFields && hasBangladeshFields) {
    throw AppError.validation('Do not mix international and Bangladesh location fields');
  }
  return result;
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readIdempotencyKey(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  return (
    req.header('Idempotency-Key')?.trim() ||
    req.header('idempotency-key')?.trim() ||
    toText(body?.idempotencyKey) ||
    undefined
  );
}

function parseWebhook(req: Request): WebhookInput {
  const body = req.body ?? {};
  const signature =
    req.header('X-Furtail-Signature')?.trim() ||
    req.header('x-furtail-signature')?.trim() ||
    toText(body.signature);
  if (!signature) throw AppError.validation('Webhook signature is required');
  return {
    provider: readText(body.provider, 'provider'),
    eventId: readText(body.eventId, 'eventId'),
    referenceId: readText(body.referenceId, 'referenceId'),
    status: readText(body.status, 'status'),
    amountMinor: body.amountMinor ?? body.amount,
    currencyCode: readText(body.currencyCode ?? 'BDT', 'currencyCode'),
    providerPaymentId: toText(body.providerPaymentId),
    signature,
    payload: { ...body, signature: undefined },
  };
}

function mapFundraisingError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof FundraisingContractError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return AppError.fundraiserNotFound(error.message);
      case 'FORBIDDEN':
        return AppError.authorizationDenied(error.message);
      case 'MEDIA_NOT_OWNED':
        return AppError.mediaNotOwned(error.message);
      case 'MEDIA_BINDING_CONFLICT':
        return AppError.mediaBindingConflict(error.message);
      case 'UPLOAD_INCOMPLETE':
        return AppError.uploadIncomplete(error.message);
      case 'INVALID_DRAFT_STATE':
        return AppError.invalidDraftState(error.message);
      case 'RETRYABLE_UPLOAD_FAILURE':
        return AppError.retryableUploadFailure(error.message);
      case 'ACCESS_DENIED':
        return AppError.fundraiserAccessDenied(error.message);
      case 'NOT_PUBLIC':
        return AppError.fundraiserNotPublic(error.message);
      case 'EDIT_FORBIDDEN':
        return AppError.fundraiserEditForbidden(error.message);
      case 'NOT_DONATABLE':
        return AppError.fundraiserNotDonatable(error.message);
      case 'ACCOUNT_NOT_VERIFIED':
        return AppError.fundraisingAccountNotVerified(error.message);
      case 'PAYMENT_PROVIDER_UNAVAILABLE':
        return AppError.paymentProviderUnavailable(error.message);
      case 'CONFLICT':
        return AppError.conflict(error.message);
      case 'VALIDATION':
        return AppError.validation(error.message);
      case 'UNAVAILABLE':
        return AppError.serviceUnavailable(error.message);
      case 'BAD_SIGNATURE':
        return AppError.authenticationInvalid(error.message);
      case 'INVALID_TRANSITION':
        return AppError.conflict(error.message);
    }
  }
  return AppError.internal('Internal server error');
}
