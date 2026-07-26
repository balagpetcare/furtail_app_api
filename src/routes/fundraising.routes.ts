import { Router, type Request, type Response } from 'express';

import { AppError } from '../core/errors/app-error';
import { sendSuccess } from '../core/http/api-response';
import { requiredAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';
import {
  FundraisingContractError,
  type FundraisingStore,
  type WebhookInput,
} from '../modules/fundraising/fundraising-store';

export interface FundraisingRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
  fundraisingStore: FundraisingStore;
}

export function fundraisingRoutes(deps: FundraisingRoutesDeps): Router {
  const router = Router();
  const authenticate = requiredAuth({ verifier: deps.verifier });
  const socialStore = deps.socialStore ?? createSocialCoreStore();
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
      const userId = currentUserId(req, socialStore);
      const account = deps.fundraisingStore.getAccount(userId);
      if (!account) throw AppError.notFound('Fundraising account not found');
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.patch(
    '/api/v1/fundraising/account',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const account = deps.fundraisingStore.upsertAccount(userId, req.body ?? {});
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/account/submit',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const account = deps.fundraisingStore.submitAccount(userId);
      sendSuccess(res, account, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/account/documents',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const title = readText(req.body?.title, 'title');
      const mediaId = readInt(req.body?.mediaId, 'mediaId');
      const document = deps.fundraisingStore.addAccountDocument(userId, { title, mediaId });
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
      const userId = currentUserId(req, socialStore);
      const documentId = readInt(req.params.id, 'id');
      const result = deps.fundraisingStore.deleteAccountDocument(userId, documentId);
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/feed',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const feed = deps.fundraisingStore.listFeed(userId, {
        limit: readLimit(req.query.limit, 50),
        cursor: toText(req.query.cursor) ?? undefined,
        verified: parseOptionalBoolean(req.query.verified),
        category: toText(req.query.category) ?? undefined,
        location: toText(req.query.location) ?? undefined,
        sort: toText(req.query.sort) ?? undefined,
      });
      sendSuccess(res, feed, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/my/campaigns',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const items = deps.fundraisingStore.listMyCampaigns(userId, readLimit(req.query.limit, 100));
      sendSuccess(res, items, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/campaigns/:id',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const campaignId = readInt(req.params.id, 'id');
      const campaign = deps.fundraisingStore.getCampaign(userId, campaignId);
      sendSuccess(res, campaign, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/drafts',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const draft = deps.fundraisingStore.createDraft(
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
      const userId = currentUserId(req, socialStore);
      const draft = deps.fundraisingStore.getDraft(userId, String(readInt(req.params.id, 'id')));
      sendSuccess(res, draft, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.patch(
    '/api/v1/fundraising/campaigns/:id/draft',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const draft = deps.fundraisingStore.updateDraft(
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
      const userId = currentUserId(req, socialStore);
      const draft = deps.fundraisingStore.submitDraft(
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
      const userId = currentUserId(req, socialStore);
      const campaign = deps.fundraisingStore.createCampaign(userId, req.body ?? {});
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
      const userId = currentUserId(req, socialStore);
      const campaign = deps.fundraisingStore.updateCampaign(
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
      const userId = currentUserId(req, socialStore);
      const campaign = deps.fundraisingStore.publishCampaign(userId, readInt(req.params.id, 'id'));
      sendSuccess(res, campaign, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.delete(
    '/api/v1/fundraising/campaigns/:id',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const deleted = deps.fundraisingStore.deleteCampaign(userId, readInt(req.params.id, 'id'));
      sendSuccess(res, deleted, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/fundraising/campaigns/:id/donations',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const donations = deps.fundraisingStore.listDonations(
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
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const updates = deps.fundraisingStore.listUpdates(
        userId,
        readInt(req.params.id, 'id'),
        readLimit(req.query.limit, 50),
        toText(req.query.cursor) ?? undefined,
      );
      sendSuccess(res, updates, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/:id/updates',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const update = deps.fundraisingStore.createUpdate(userId, readInt(req.params.id, 'id'), {
        caption: req.body?.caption,
        mediaIds: Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : [],
      });
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
      const userId = currentUserId(req, socialStore);
      const update = deps.fundraisingStore.updateUpdate(userId, readInt(req.params.id, 'id'), {
        caption: req.body?.caption,
        mediaIds: Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : undefined,
      });
      sendSuccess(res, update, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.delete(
    '/api/v1/fundraising/updates/:id',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const update = deps.fundraisingStore.deleteUpdate(userId, readInt(req.params.id, 'id'));
      sendSuccess(res, update, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/campaigns/:id/donate',
    authenticate,
    route(async (req, res) => {
      const userId = currentUserId(req, socialStore);
      const idempotencyKey = readIdempotencyKey(req);
      if (!idempotencyKey) throw AppError.validation('Idempotency key is required');
      const result = deps.fundraisingStore.createDonationCheckout(
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
      const userId = currentUserId(req, socialStore);
      const donation = deps.fundraisingStore.getDonationAttemptByReference(
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
      const userId = currentUserId(req, socialStore);
      const status = deps.fundraisingStore.getPaymentStatus(userId, req.params.referenceId ?? '');
      sendSuccess(res, status, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/payments/webhooks',
    route(async (req, res) => {
      const result = deps.fundraisingStore.handleWebhook(parseWebhook(req));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/fundraising/payments/webhooks/provider',
    route(async (req, res) => {
      const result = deps.fundraisingStore.handleWebhook(parseWebhook(req));
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}

function currentUserId(req: Request, store: SocialCoreStore): number {
  const principal = req.principal;
  if (!principal) throw AppError.authenticationRequired();
  const userId = store.resolveUserId(principal);
  if (!userId) throw AppError.authorizationDenied('Unknown fundraising user');
  return userId;
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

function readIdempotencyKey(req: Request): string | undefined {
  return (
    req.header('Idempotency-Key')?.trim() || req.header('idempotency-key')?.trim() || undefined
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
        return AppError.notFound(error.message);
      case 'FORBIDDEN':
        return AppError.authorizationDenied(error.message);
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
