import { Router } from 'express';

import { sendSuccess } from '../core/http/api-response';
import { AppError } from '../core/errors/app-error';
import { requiredAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import type { SocialCoreStore } from '../modules/social/social-store';

export interface NotificationsRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
}

async function readUserId(
  req: { principal?: { sub: string; email?: string; name?: string } },
  store: SocialCoreStore,
): Promise<number> {
  const id = req.principal ? await store.resolveUserId(req.principal) : null;
  if (!id) {
    throw AppError.authenticationRequired();
  }
  return id;
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function notificationsRoutes(deps: NotificationsRoutesDeps): Router {
  const router = Router();
  const store = deps.socialStore;
  if (!store) {
    throw new Error('notificationsRoutes requires a socialStore');
  }
  const required = requiredAuth({ verifier: deps.verifier });

  router.get(
    '/api/v1/notifications/settings',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      sendSuccess(res, store.getNotificationPreferences(userId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.patch(
    '/api/v1/notifications/settings',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const prefs = store.updateNotificationPreferences(userId, {
        allowEmail: req.body?.allowEmail,
        allowSms: req.body?.allowSms,
      });
      sendSuccess(res, prefs, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.put(
    '/api/v1/notifications/settings',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const prefs = store.updateNotificationPreferences(userId, {
        allowEmail: req.body?.allowEmail,
        allowSms: req.body?.allowSms,
      });
      sendSuccess(res, prefs, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/notifications/device-token',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const token = String(req.body?.token ?? '').trim();
      if (!token) {
        throw AppError.validation('token is required');
      }
      const platform = String(req.body?.platform ?? 'unknown').trim() || 'unknown';
      const provider = String(req.body?.provider ?? 'fcm').trim() || 'fcm';
      const result = store.registerDeviceToken(userId, { token, platform, provider });
      sendSuccess(
        res,
        {
          id: result.id,
          token: result.token,
          platform: result.platform,
          provider: result.provider,
          replaced: result.replaced,
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.delete(
    '/api/v1/notifications/device-token',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const token = req.body?.token ? String(req.body.token).trim() : null;
      const platform = req.body?.platform ? String(req.body.platform).trim() : null;
      const provider = req.body?.provider ? String(req.body.provider).trim() : null;
      const updated = store.unregisterDeviceTokens(userId, { token, platform, provider });
      sendSuccess(res, { updated }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/notifications',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const limit = toPositiveInt(req.query.limit ?? 20, 'limit');
      const cursor = toOptionalPositiveInt(req.query.cursor);
      const payload = store.listNotifications(userId, limit, cursor);
      sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/notifications/unread-count',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      sendSuccess(
        res,
        { count: store.getUnreadNotificationCount(userId) },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.get(
    '/api/v1/notifications/count',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      sendSuccess(
        res,
        { count: store.getUnreadNotificationCount(userId) },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.patch(
    '/api/v1/notifications/:id/read',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const id = toPositiveInt(req.params.id, 'id');
      const ok = store.markNotificationRead(userId, id);
      if (!ok) {
        throw AppError.notFound('Notification not found');
      }
      sendSuccess(
        res,
        { success: true },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/notifications/:id/read',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const id = toPositiveInt(req.params.id, 'id');
      const ok = store.markNotificationRead(userId, id);
      if (!ok) {
        throw AppError.notFound('Notification not found');
      }
      sendSuccess(
        res,
        { success: true },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/notifications/read-all',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const updated = store.markAllNotificationsRead(userId);
      sendSuccess(res, { updated }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.patch(
    '/api/v1/notifications/read-all',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const updated = store.markAllNotificationsRead(userId);
      sendSuccess(res, { updated }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}
