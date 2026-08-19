import { Router } from 'express';
import multer from 'multer';
import type { PrismaClient } from '@prisma/client';

import { sendSuccess } from '../core/http/api-response';
import { AppError } from '../core/errors/app-error';
import { requiredAuth, optionalAuth, requireRole } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import {
  InMemoryMediaStorageAdapter,
  resolveStoredMediaPath,
} from '../modules/media/media-storage';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';
import {
  TaxonomyService,
  TaxonomyDuplicateKeyError,
  TaxonomyNotFoundError,
} from '../modules/social/taxonomy-service';
import { extname } from 'node:path';
import { env } from '../config/env';
import { getPrisma } from '../infrastructure/db/prisma-client';
import {
  getSharedProfileByUsername,
  getSharedProfileForUser,
  updateSharedProfile,
} from '../modules/profile/shared-user-profile';

export interface SocialRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
  // Explicit override so tests (and any future caller) can force
  // Prisma-backed enforcement without relying on the module-global
  // env.DATABASE_URL, which tests/setup-env.ts freezes empty for the whole
  // Jest process. Falls back to the env.DATABASE_URL-gated getPrisma()
  // singleton when omitted, unchanged for the real running server.
  prisma?: PrismaClient | null;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;

const SUPPORTED_UPLOAD_TYPES: Record<string, { extensions: string[]; maxBytes: number }> = {
  'image/jpeg': { extensions: ['jpg', 'jpeg'], maxBytes: MAX_IMAGE_BYTES },
  'image/png': { extensions: ['png'], maxBytes: MAX_IMAGE_BYTES },
  'image/webp': { extensions: ['webp'], maxBytes: MAX_IMAGE_BYTES },
  'image/gif': { extensions: ['gif'], maxBytes: MAX_IMAGE_BYTES },
  'application/pdf': { extensions: ['pdf'], maxBytes: MAX_FILE_BYTES },
  'video/mp4': { extensions: ['mp4'], maxBytes: MAX_VIDEO_BYTES },
  'video/quicktime': { extensions: ['mov'], maxBytes: MAX_VIDEO_BYTES },
  'video/webm': { extensions: ['webm'], maxBytes: MAX_VIDEO_BYTES },
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    const allowed = SUPPORTED_UPLOAD_TYPES[file.mimetype];
    if (!allowed) {
      callback(AppError.mediaTypeUnsupported(`Unsupported media type: ${file.mimetype}`));
      return;
    }
    if (!allowed.extensions.includes(extensionOf(file.originalname || ''))) {
      callback(AppError.mediaTypeUnsupported('The file extension does not match its content type'));
      return;
    }
    callback(null, true);
  },
});

// Hydrates the in-memory store's shadow record for an ACTION TARGET (not
// the requesting viewer, who is already hydrated by readUserId/
// resolveUserId) before a follow/mute/restrict/block call — every one of
// those in-memory store methods requires mustGetUser(targetId) to succeed.
// A real long-running server accumulates every user's shadow over time
// from any request that touches them; a cold test process (or the very
// first action ever taken against a given target) has none yet, so this
// closes that gap using the real Prisma row when available.
async function ensureTargetKnown(
  prisma: PrismaClient | null,
  store: SocialCoreStore,
  targetId: number,
): Promise<void> {
  if (!prisma) return;
  const target = await prisma.userProfile.findUnique({
    where: { userId: targetId },
    select: { displayName: true, username: true },
  });
  if (target) {
    store.ensureUserKnown(targetId, {
      id: targetId,
      displayName: target.displayName,
      username: target.username ?? undefined,
    });
  }
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

async function readOptionalUserId(
  req: { principal?: { sub: string; email?: string; name?: string } },
  store: SocialCoreStore,
): Promise<number | null> {
  return req.principal ? await store.resolveUserId(req.principal) : null;
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

function normalizeBodyArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

function normalizeContentField(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function inferContentTypeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

const LEGACY_PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAM0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4G4A7AABW4N+pwAAAABJRU5ErkJggg==',
  'base64',
);

function toBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return undefined;
}

function mapError(error: unknown, fallbackMessage: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Username already taken'))
    return AppError.conflict('Username already taken', { field: 'username' });
  if (message.includes('You cannot follow yourself')) return AppError.validation(message);
  if (message.includes('You cannot like your own profile')) return AppError.validation(message);
  if (message.includes('You cannot send a request to yourself'))
    return AppError.validation(message);
  if (message.includes('You cannot block yourself')) return AppError.validation(message);
  if (message.includes('You cannot mute yourself')) return AppError.validation(message);
  if (message.includes('You cannot restrict yourself')) return AppError.validation(message);
  if (message.includes('Forbidden')) return AppError.authorizationDenied('Forbidden');
  if (message.includes('not found')) return AppError.notFound(message);
  if (message.includes('pending')) return AppError.validation(message);
  if (message.includes('Report type is required')) return AppError.validation(message);
  if (message.includes('Report reason is required')) return AppError.validation(message);
  if (message.includes('Invalid target')) return AppError.validation(message);
  if (message.includes('Idempotency key already used')) return AppError.conflict(message);
  if (message.includes('Invalid media reference')) return AppError.validation(message);
  if (message.includes('Invalid content tag reference')) return AppError.validation(message);
  if (message.includes('Media is not owned by the current user'))
    return AppError.authorizationDenied(message);
  if (message.includes('is not ready (status:')) return AppError.validation(message);
  if (message.includes('may not have more than')) return AppError.validation(message);
  return AppError.internal(fallbackMessage);
}

function mapTaxonomyError(error: unknown, fallbackMessage: string): AppError {
  if (error instanceof TaxonomyDuplicateKeyError) {
    return AppError.conflict(error.message, { key: error.key });
  }
  if (error instanceof TaxonomyNotFoundError) {
    return AppError.notFound(error.message);
  }
  return mapError(error, fallbackMessage);
}

export function socialRoutes(deps: SocialRoutesDeps): Router {
  const router = Router();
  const store = deps.socialStore ?? createSocialCoreStore(new InMemoryMediaStorageAdapter());
  const prisma = deps.prisma !== undefined ? deps.prisma : env.DATABASE_URL ? getPrisma() : null;
  const required = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });
  // Same convention already used by fundraising/adoption routes
  // (hasRole(principal, 'admin')) — see tests/security.test.ts for the
  // tested contract this middleware relies on.
  const adminOnly = requireRole('admin');

  router.get(
    '/api/v1/user/me',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const payload = prisma
        ? await getSharedProfileForUser(prisma, userId, userId, true)
        : store.getCurrentUserPayload(userId);
      // Only ever exposed on the caller's own "me" lookup (never another
      // user's profile) — the client-side admin route guard reads this to
      // decide whether to show/allow taxonomy management, with the actual
      // enforcement living server-side on /api/v1/admin/taxonomies/* via
      // requireRole('admin').
      sendSuccess(res, { ...payload, roles: req.principal?.roles ?? [] }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/user/profile',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const payload = prisma
        ? await getSharedProfileForUser(prisma, userId, userId, true)
        : store.getCurrentUserPayload(userId);
      sendSuccess(res, payload, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.patch(
    '/api/v1/user/me',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      try {
        const payload = prisma
          ? await updateSharedProfile(prisma, userId, {
              displayName: req.body?.displayName,
              username: req.body?.username,
              bio: req.body?.bio,
              visibility: req.body?.visibility,
              showEmail: req.body?.showEmail,
              showPhone: req.body?.showPhone,
              education: req.body?.education,
              placeLive: req.body?.placeLive,
              from: req.body?.from,
              profileType: req.body?.profileType,
              workStatus: req.body?.workStatus,
              religiousStatus: req.body?.religiousStatus,
              gender: req.body?.gender,
              maritalStatus: req.body?.maritalStatus,
              followersVisibility: req.body?.followersVisibility,
              followingVisibility: req.body?.followingVisibility,
              discoverableByEmail: req.body?.discoverableByEmail,
              discoverableByPhone: req.body?.discoverableByPhone,
              discoverableBySearch: req.body?.discoverableBySearch,
              whoCanFollow: req.body?.whoCanFollow,
              whoCanMessage: req.body?.whoCanMessage,
              whoCanComment: req.body?.whoCanComment,
              whoCanMention: req.body?.whoCanMention,
              whoCanTag: req.body?.whoCanTag,
              requiresTagReview: req.body?.requiresTagReview,
              requiresProfilePostReview: req.body?.requiresProfilePostReview,
              showActivityStatus: req.body?.showActivityStatus,
              showReadReceipts: req.body?.showReadReceipts,
              avatarMediaId:
                toOptionalPositiveInt(req.body?.avatarMediaId) ??
                (req.body?.avatarMediaId === null ? null : undefined),
              coverMediaId:
                toOptionalPositiveInt(req.body?.coverMediaId) ??
                (req.body?.coverMediaId === null ? null : undefined),
            })
          : store.updateCurrentUserProfile(userId, {
              displayName: req.body?.displayName,
              username: req.body?.username,
              bio: req.body?.bio,
              visibility: req.body?.visibility,
              showEmail: req.body?.showEmail,
              showPhone: req.body?.showPhone,
              education: req.body?.education,
              placeLive: req.body?.placeLive,
              from: req.body?.from,
              profileType: req.body?.profileType,
              workStatus: req.body?.workStatus,
              religiousStatus: req.body?.religiousStatus,
              gender: req.body?.gender,
              maritalStatus: req.body?.maritalStatus,
              avatarMediaId:
                toOptionalPositiveInt(req.body?.avatarMediaId) ??
                (req.body?.avatarMediaId === null ? null : undefined),
              coverMediaId:
                toOptionalPositiveInt(req.body?.coverMediaId) ??
                (req.body?.coverMediaId === null ? null : undefined),
              email: req.body?.email,
              phone: req.body?.phone,
            });
        sendSuccess(res, payload, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapError(error, 'Failed to update profile');
      }
    }),
  );

  const DEFAULT_NOTIFICATION_PREFERENCES = {
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    messages: true,
    fundraisingUpdates: true,
    adoptionUpdates: true,
    emailAnnouncements: false,
    smsAnnouncements: false,
  };

  router.get(
    '/api/v1/user/me/notification-preferences',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      if (prisma) {
        const profile = await prisma.userProfile.findUnique({
          where: { userId },
          select: { notificationPreferences: true },
        });
        const stored =
          profile?.notificationPreferences &&
          typeof profile.notificationPreferences === 'object' &&
          !Array.isArray(profile.notificationPreferences)
            ? (profile.notificationPreferences as Record<string, unknown>)
            : {};
        sendSuccess(
          res,
          { ...DEFAULT_NOTIFICATION_PREFERENCES, ...stored },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } else {
        const prefs = store.getNotificationPreferences(userId);
        sendSuccess(
          res,
          { ...DEFAULT_NOTIFICATION_PREFERENCES, emailAnnouncements: prefs.allowEmail, smsAnnouncements: prefs.allowSms },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      }
    }),
  );

  router.patch(
    '/api/v1/user/me/notification-preferences',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      const allowedKeys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updates: Record<string, boolean> = {};
      for (const key of allowedKeys) {
        if (typeof body[key] === 'boolean') updates[key] = body[key];
      }
      if (prisma) {
        const existing = await prisma.userProfile.findUnique({
          where: { userId },
          select: { notificationPreferences: true },
        });
        const stored =
          existing?.notificationPreferences &&
          typeof existing.notificationPreferences === 'object' &&
          !Array.isArray(existing.notificationPreferences)
            ? (existing.notificationPreferences as Record<string, unknown>)
            : {};
        const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...stored, ...updates };
        await prisma.userProfile.update({
          where: { userId },
          data: { notificationPreferences: merged },
        });
        sendSuccess(res, merged, { requestId: req.requestId, correlationId: req.correlationId });
      } else {
        store.updateNotificationPreferences(userId, {
          allowEmail: updates.emailAnnouncements,
          allowSms: updates.smsAnnouncements,
        });
        const prefs = store.getNotificationPreferences(userId);
        sendSuccess(
          res,
          { ...DEFAULT_NOTIFICATION_PREFERENCES, ...updates, emailAnnouncements: prefs.allowEmail, smsAnnouncements: prefs.allowSms },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      }
    }),
  );

  router.post(
    '/api/v1/media/upload',
    required,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      if (!req.file) {
        throw AppError.validation('No file uploaded');
      }
      // Bind this upload to whatever draft/content it belongs to, so it can
      // later be validated as "owned by this draft" and cleaned up as an
      // orphan if the draft is abandoned. `Idempotency-Key` (falling back to
      // the legacy `draftId` body field some clients still send) prevents a
      // retried upload request from storing the same file twice.
      const contentType = normalizeContentField(req.body?.contentType ?? req.body?.uploadContext);
      const contentId = normalizeContentField(
        req.body?.contentId ?? req.body?.draftId ?? req.body?.listingId,
      );
      const idempotencyKey =
        (typeof req.headers['idempotency-key'] === 'string' && req.headers['idempotency-key']) ||
        normalizeContentField(req.body?.idempotencyKey) ||
        undefined;
      const purpose =
        (typeof req.body?.purpose === 'string' && req.body.purpose.trim()) || 'generic';
      const uploadType = SUPPORTED_UPLOAD_TYPES[req.file.mimetype || ''];
      if (!uploadType) {
        throw AppError.mediaTypeUnsupported(`Unsupported media type: ${req.file.mimetype}`);
      }
      if (req.file.size > uploadType.maxBytes) {
        throw AppError.mediaSizeExceeded('This file exceeds the maximum allowed size', {
          maxBytes: uploadType.maxBytes,
          mimetype: req.file.mimetype,
        });
      }

      const media = await store.uploadMedia(
        userId,
        {
          ownerUserId: userId,
          filename: req.file.originalname || 'upload.bin',
          mimetype: req.file.mimetype || 'application/octet-stream',
          size: req.file.size,
          buffer: req.file.buffer,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          purpose: purpose as any,
        },
        { contentType, contentId, idempotencyKey },
      );
      sendSuccess(
        res,
        {
          id: media.id,
          url: media.url,
          hlsUrl: media.hlsUrl,
          type: media.mimetype.startsWith('video/')
            ? 'VIDEO'
            : media.mimetype.startsWith('image/')
              ? 'IMAGE'
              : 'FILE',
          status: media.status,
          thumbnailUrl: media.thumbnailUrl,
        },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.get(
    '/api/v1/media/*',
    asyncHandler(async (req, res) => {
      const requestPath = req.path.replace(/^\/api\/v1\/media\//, '');
      if (!requestPath || requestPath === 'upload') {
        throw AppError.notFound('Media not found');
      }
      // This route deliberately serves public post/profile media to a Web
      // origin that differs from the API's own origin (different port in
      // dev, likely a different subdomain in prod). Helmet's default
      // Cross-Origin-Resource-Policy: same-origin — still correctly applied
      // to every other route by app.ts's global helmet() call — would make
      // browsers silently block every <img>/<video> load of this URL from
      // any other origin (no console-visible CORS error, just a fired
      // onerror), which is invisible to same-process supertest assertions
      // but breaks real browsers. Only this explicitly-public route opts
      // back into cross-origin embedding.
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      if (requestPath.startsWith('legacy/')) {
        res.status(200).type('image/png').send(LEGACY_PLACEHOLDER_PNG);
        return;
      }
      try {
        const filePath = resolveStoredMediaPath(requestPath);
        res.type(inferContentTypeFromPath(filePath));
        res.sendFile(filePath, (err) => {
          const sendErr = err as (Error & { statusCode?: number }) | undefined;
          if (sendErr && !res.headersSent) {
            res.status(sendErr.statusCode === 404 ? 404 : 500).json({
              error: {
                code: sendErr.statusCode === 404 ? 'MEDIA_NOT_FOUND' : 'MEDIA_SERVE_FAILED',
                message: sendErr.statusCode === 404 ? 'Media not found' : 'Failed to load media',
              },
            });
          }
        });
      } catch {
        throw AppError.notFound('Media not found');
      }
    }),
  );

  router.get(
    '/api/v1/user/by-username/:username',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const payload = prisma
        ? await getSharedProfileByUsername(prisma, String(req.params.username || ''), viewerId, false)
        : (() => {
            const user = store.getUserByUsername(String(req.params.username || ''));
            if (!user) throw AppError.notFound('User not found');
            return store.getVisitorUserPayload(viewerId, user.id);
          })();
      sendSuccess(res, payload, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/user/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const userId = toPositiveInt(req.params.userId, 'userId');
      const payload = prisma
        ? await getSharedProfileForUser(prisma, userId, viewerId, false)
        : (() => {
            if (!store.getUserById(userId)) throw AppError.notFound('User not found');
            return store.getVisitorUserPayload(viewerId, userId);
          })();
      sendSuccess(res, payload, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/social/status/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      if (!store.getUserById(targetId)) throw AppError.notFound('User not found');
      sendSuccess(res, store.getSocialStatus(viewerId, targetId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/social/blocked',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      if (prisma) {
        const blocks = await prisma.userBlock.findMany({
          where: { blockerId: viewerId },
          select: { blockedUserId: true },
        });
        sendSuccess(res, { items: blocks.map((b) => ({ userId: b.blockedUserId })) }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } else {
        sendSuccess(res, store.listBlockedUsers(viewerId), {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      }
    }),
  );

  router.post(
    '/api/v1/social/block/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
        if (prisma) {
          await prisma.userBlock.upsert({
            where: { blockerId_blockedUserId: { blockerId: viewerId, blockedUserId: targetId } },
            create: { blockerId: viewerId, blockedUserId: targetId },
            update: {},
          });
        }
        await ensureTargetKnown(prisma, store, targetId);
        sendSuccess(res, store.blockUser(viewerId, targetId), {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } catch (error) {
        throw mapError(error, 'Failed to block user');
      }
    }),
  );

  router.delete(
    '/api/v1/social/block/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      if (prisma) {
        await prisma.userBlock.deleteMany({
          where: { blockerId: viewerId, blockedUserId: targetId },
        });
      }
      store.unblockUser(viewerId, targetId);
      sendSuccess(
        res,
        { blocked: false },
        {
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
      );
    }),
  );

  router.get(
    '/api/v1/social/muted',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      if (prisma) {
        const mutes = await prisma.userMute.findMany({
          where: { muterId: viewerId },
          select: { mutedUserId: true },
        });
        sendSuccess(res, { items: mutes.map((m) => ({ userId: m.mutedUserId })) }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } else {
        sendSuccess(res, { items: store.listMutedUsers(viewerId) }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      }
    }),
  );

  router.post(
    '/api/v1/social/mute/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
        if (prisma) {
          await prisma.userMute.upsert({
            where: { muterId_mutedUserId: { muterId: viewerId, mutedUserId: targetId } },
            create: { muterId: viewerId, mutedUserId: targetId },
            update: {},
          });
        }
        await ensureTargetKnown(prisma, store, targetId);
        store.muteUser(viewerId, targetId);
        sendSuccess(res, { muted: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapError(error, 'Failed to mute user');
      }
    }),
  );

  router.delete(
    '/api/v1/social/mute/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      if (prisma) {
        await prisma.userMute.deleteMany({
          where: { muterId: viewerId, mutedUserId: targetId },
        });
      }
      store.unmuteUser(viewerId, targetId);
      sendSuccess(res, { muted: false }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/social/restricted',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      if (prisma) {
        const restrictions = await prisma.userRestrict.findMany({
          where: { restricterId: viewerId },
          select: { restrictedUserId: true },
        });
        sendSuccess(res, { items: restrictions.map((r) => ({ userId: r.restrictedUserId })) }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } else {
        sendSuccess(res, { items: store.listRestrictedUsers(viewerId) }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      }
    }),
  );

  router.post(
    '/api/v1/social/restrict/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
        if (prisma) {
          await prisma.userRestrict.upsert({
            where: { restricterId_restrictedUserId: { restricterId: viewerId, restrictedUserId: targetId } },
            create: { restricterId: viewerId, restrictedUserId: targetId },
            update: {},
          });
        }
        await ensureTargetKnown(prisma, store, targetId);
        store.restrictUser(viewerId, targetId);
        sendSuccess(res, { restricted: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapError(error, 'Failed to restrict user');
      }
    }),
  );

  router.delete(
    '/api/v1/social/restrict/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      if (prisma) {
        await prisma.userRestrict.deleteMany({
          where: { restricterId: viewerId, restrictedUserId: targetId },
        });
      }
      store.unrestrictUser(viewerId, targetId);
      sendSuccess(res, { restricted: false }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/social/follow/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
        if (prisma && viewerId !== targetId) {
          const target = await prisma.userProfile.findUnique({
            where: { userId: targetId },
            select: { whoCanFollow: true },
          });
          if (target?.whoCanFollow === 'NOBODY') {
            throw AppError.authorizationDenied('This user is not accepting new followers');
          }
          if (target?.whoCanFollow === 'FOLLOWERS') {
            const alreadyFollowedByTarget = await prisma.userFollow.findUnique({
              where: { followerId_followingId: { followerId: targetId, followingId: viewerId } },
            });
            if (!alreadyFollowedByTarget) {
              throw AppError.authorizationDenied(
                'This user only accepts followers they already follow',
              );
            }
          }
        }
        await ensureTargetKnown(prisma, store, targetId);
        store.followUser(viewerId, targetId);
        sendSuccess(
          res,
          { followed: true },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to follow user');
      }
    }),
  );

  router.delete(
    '/api/v1/social/follow/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      store.unfollowUser(viewerId, targetId);
      sendSuccess(
        res,
        { followed: false },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/social/like/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
        store.likeUserProfile(viewerId, targetId);
        sendSuccess(
          res,
          { liked: true },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to like profile');
      }
    }),
  );

  router.delete(
    '/api/v1/social/like/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      store.unlikeUserProfile(viewerId, targetId);
      sendSuccess(
        res,
        { liked: false },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/social/friend-request/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
        const request = store.sendFriendRequest(viewerId, targetId);
        sendSuccess(
          res,
          { requestId: request.id },
          {
            requestId: req.requestId,
            correlationId: req.correlationId,
            statusCode: request.status === 'PENDING' ? 201 : 200,
          },
        );
      } catch (error) {
        throw mapError(error, 'Failed to send friend request');
      }
    }),
  );

  router.post(
    '/api/v1/social/friend-request/:requestId/accept',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const requestId = toPositiveInt(req.params.requestId, 'requestId');
      try {
        store.acceptFriendRequest(viewerId, requestId);
        sendSuccess(
          res,
          { accepted: true },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to accept friend request');
      }
    }),
  );

  router.post(
    '/api/v1/social/friend-request/:requestId/reject',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const requestId = toPositiveInt(req.params.requestId, 'requestId');
      try {
        store.rejectFriendRequest(viewerId, requestId);
        sendSuccess(
          res,
          { rejected: true },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to reject friend request');
      }
    }),
  );

  router.delete(
    '/api/v1/social/friend-request/:requestId/cancel',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const requestId = toPositiveInt(req.params.requestId, 'requestId');
      try {
        store.cancelFriendRequest(viewerId, requestId);
        sendSuccess(
          res,
          { canceled: true },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to cancel friend request');
      }
    }),
  );

  router.get(
    '/api/v1/posts/feed',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const limit = toOptionalPositiveInt(req.query.limit) ?? 50;
      sendSuccess(res, await store.listFeed(viewerId, limit, req.query.cursor), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/posts/videos',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const limit = toOptionalPositiveInt(req.query.limit) ?? 50;
      const page = toOptionalPositiveInt(req.query.page) ?? 1;
      const payload = store.listVideosFeed(viewerId, {
        limit,
        page,
        cursor: req.query.cursor,
        search: req.query.search?.toString(),
        category: req.query.category?.toString(),
        sort: req.query.sort?.toString(),
        duration: req.query.duration?.toString(),
        followingOnly: toBoolean(req.query.followingOnly) ?? undefined,
      });
      sendSuccess(res, payload.items, {
        requestId: req.requestId,
        correlationId: req.correlationId,
        meta: {
          page: payload.page,
          limit: payload.limit,
          hasMore: payload.hasMore,
          nextCursor: payload.nextCursor,
        },
      });
    }),
  );

  router.get(
    '/api/v1/posts/user/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const userId = toPositiveInt(req.params.userId, 'userId');
      sendSuccess(
        res,
        store.listUserPosts(
          viewerId,
          userId,
          toOptionalPositiveInt(req.query.limit) ?? 50,
          req.query.cursor,
        ),
        {
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
      );
    }),
  );

  router.get(
    '/api/v1/posts/user/:userId/photos',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const userId = toPositiveInt(req.params.userId, 'userId');
      const data = store.getUserPhotoGallery(
        viewerId,
        userId,
        toOptionalPositiveInt(req.query.limit) ?? 50,
        req.query.cursor,
      );
      sendSuccess(res, data, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/posts/user/:userId/videos',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const userId = toPositiveInt(req.params.userId, 'userId');
      const data = store.getUserVideoGallery(
        viewerId,
        userId,
        toOptionalPositiveInt(req.query.limit) ?? 50,
        req.query.cursor,
      );
      sendSuccess(res, data, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/posts/bookmarked',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const result = store.listBookmarkedPosts(
        viewerId,
        toOptionalPositiveInt(req.query.limit) ?? 50,
        req.query.cursor,
      );
      sendSuccess(
        res,
        { items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/posts',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      try {
        // Idempotency support: extract key from header or body (body is fallback for clients that can't set headers)
        const idempotencyKey =
          (typeof req.headers['idempotency-key'] === 'string' && req.headers['idempotency-key']) ||
          normalizeContentField(req.body?.idempotencyKey) ||
          undefined;

        const post = await store.createPost(viewerId, {
          caption: req.body?.caption,
          type: req.body?.type,
          category: req.body?.category,
          mediaIds: normalizeBodyArray(req.body?.mediaIds),
          privacy: req.body?.privacy,
          postType: req.body?.postType,
          backgroundStyle: req.body?.backgroundStyle ?? req.body?.backgroundStyleId,
          lostPetName: req.body?.lostPetName,
          lostPetLocation: req.body?.lostPetLocation,
          lostPetContactVisible: toBoolean(req.body?.lostPetContactVisible),
          taggedPetIds: normalizeBodyArray(req.body?.taggedPetIds),
          contentTagIds: normalizeBodyArray(req.body?.contentTagIds),
          songTitle: req.body?.songTitle,
          songArtist: req.body?.songArtist,
          songStartMs: toOptionalPositiveInt(req.body?.songStartMs) ?? null,
          songDurationMs: toOptionalPositiveInt(req.body?.songDurationMs) ?? null,
          locationText: req.body?.locationText,
          feelingId: req.body?.feelingId,
          feelingLabel: req.body?.feelingLabel,
          feelingEmoji: req.body?.feelingEmoji,
          activityId: req.body?.activityId,
          activityLabel: req.body?.activityLabel,
          activityEmoji: req.body?.activityEmoji,
          idempotencyKey,
        });
        sendSuccess(res, post, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapError(error, 'Failed to create post');
      }
    }),
  );

  router.get(
    '/api/v1/posts/:postId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      try {
        sendSuccess(res, await store.getPostById(viewerId, postId), {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } catch (error) {
        throw mapError(error, 'Failed to load post');
      }
    }),
  );

  router.patch(
    '/api/v1/posts/:postId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      try {
        sendSuccess(
          res,
          await store.updatePost(viewerId, postId, {
            caption: req.body?.caption,
            type: req.body?.type,
            category: req.body?.category,
            mediaIds: req.body?.mediaIds ? normalizeBodyArray(req.body.mediaIds) : undefined,
            privacy: req.body?.privacy,
            postType: req.body?.postType,
            backgroundStyle: req.body?.backgroundStyle ?? req.body?.backgroundStyleId,
            lostPetName: req.body?.lostPetName,
            lostPetLocation: req.body?.lostPetLocation,
            lostPetContactVisible: toBoolean(req.body?.lostPetContactVisible),
            taggedPetIds: req.body?.taggedPetIds
              ? normalizeBodyArray(req.body.taggedPetIds)
              : undefined,
            songTitle: req.body?.songTitle,
            songArtist: req.body?.songArtist,
            songStartMs: toOptionalPositiveInt(req.body?.songStartMs) ?? undefined,
            songDurationMs: toOptionalPositiveInt(req.body?.songDurationMs) ?? undefined,
            locationText: req.body?.locationText,
            feelingId: req.body?.feelingId,
            feelingLabel: req.body?.feelingLabel,
            feelingEmoji: req.body?.feelingEmoji,
            activityId: req.body?.activityId,
            activityLabel: req.body?.activityLabel,
            activityEmoji: req.body?.activityEmoji,
          }),
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to update post');
      }
    }),
  );

  router.delete(
    '/api/v1/posts/:postId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      try {
        sendSuccess(res, await store.deletePost(viewerId, postId), {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } catch (error) {
        throw mapError(error, 'Failed to delete post');
      }
    }),
  );

  router.post(
    '/api/v1/posts/:postId/like',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const reaction = req.body?.reaction || 'LIKE';
      try {
        sendSuccess(res, await store.likePost(viewerId, postId, reaction), {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } catch (error) {
        throw mapError(error, 'Failed to like post');
      }
    }),
  );

  router.delete(
    '/api/v1/posts/:postId/like',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      sendSuccess(res, await store.unlikePost(viewerId, postId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/posts/:postId/bookmark',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      sendSuccess(res, store.bookmarkPost(viewerId, postId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.delete(
    '/api/v1/posts/:postId/bookmark',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      sendSuccess(res, store.unbookmarkPost(viewerId, postId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/posts/:postId/share',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      sendSuccess(res, store.sharePost(viewerId, postId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/posts/:postId/view',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      sendSuccess(res, store.recordView(viewerId, postId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/posts/:postId/reactors',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const reaction = req.query.reaction ? String(req.query.reaction) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      
      const result = store.listPostReactors(viewerId, postId, reaction, limit, cursor);
      sendSuccess(res, result, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/posts/:postId/comments',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const limit = toOptionalPositiveInt(req.query.limit) ?? 100;
      const result = store.listComments(viewerId, postId, limit, req.query.cursor);
      if (Array.isArray(result)) {
        sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
      } else {
        sendSuccess(
          res,
          { items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      }
    }),
  );

  router.post(
    '/api/v1/posts/:postId/comments',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      try {
        if (prisma) {
          const post = await store.getPostById(viewerId, postId);
          const authorId = (post.author as { id?: number })?.id;
          if (authorId && authorId !== viewerId) {
            const authorProfile = await prisma.userProfile.findUnique({
              where: { userId: authorId },
              select: { whoCanComment: true },
            });
            if (authorProfile?.whoCanComment === 'NOBODY') {
              throw AppError.authorizationDenied('Comments are disabled on this post');
            }
            if (authorProfile?.whoCanComment === 'FOLLOWERS') {
              const followsAuthor = await prisma.userFollow.findUnique({
                where: { followerId_followingId: { followerId: viewerId, followingId: authorId } },
              });
              if (!followsAuthor) {
                throw AppError.authorizationDenied('Only followers can comment on this post');
              }
            }
          }
        }
        sendSuccess(res, store.addComment(viewerId, postId, String(req.body?.text ?? '').trim()), {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapError(error, 'Failed to add comment');
      }
    }),
  );

  router.patch(
    '/api/v1/posts/:postId/comments/:commentId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const commentId = toPositiveInt(req.params.commentId, 'commentId');
      try {
        sendSuccess(
          res,
          store.editComment(viewerId, postId, commentId, String(req.body?.text ?? '').trim()),
          {
            requestId: req.requestId,
            correlationId: req.correlationId,
          },
        );
      } catch (error) {
        throw mapError(error, 'Failed to edit comment');
      }
    }),
  );

  router.delete(
    '/api/v1/posts/:postId/comments/:commentId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const commentId = toPositiveInt(req.params.commentId, 'commentId');
      try {
        sendSuccess(res, store.deleteComment(viewerId, postId, commentId), {
          requestId: req.requestId,
          correlationId: req.correlationId,
        });
      } catch (error) {
        throw mapError(error, 'Failed to delete comment');
      }
    }),
  );

  router.post(
    '/api/v1/posts/:postId/comments/:commentId/like',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const commentId = toPositiveInt(req.params.commentId, 'commentId');
      sendSuccess(res, store.likeComment(viewerId, postId, commentId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.delete(
    '/api/v1/posts/:postId/comments/:commentId/like',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const commentId = toPositiveInt(req.params.commentId, 'commentId');
      sendSuccess(res, store.unlikeComment(viewerId, postId, commentId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/posts/:postId/comments/:commentId/replies',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const postId = toPositiveInt(req.params.postId, 'postId');
      const commentId = toPositiveInt(req.params.commentId, 'commentId');
      try {
        sendSuccess(
          res,
          store.replyComment(viewerId, postId, commentId, String(req.body?.text ?? '').trim()),
          {
            requestId: req.requestId,
            correlationId: req.correlationId,
            statusCode: 201,
          },
        );
      } catch (error) {
        throw mapError(error, 'Failed to add reply');
      }
    }),
  );

  router.get(
    '/api/v1/stories/feed',
    optional,
    asyncHandler(async (req, res) => {
      const viewerId = await readOptionalUserId(req, store);
      store.sweepExpiredStories();
      const stories = store.listStoriesFeed(viewerId ?? 0);
      sendSuccess(
        res,
        { stories, data: stories },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/stories',
    required,
    upload.single('media'),
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      if (!req.file) {
        throw AppError.validation('No file uploaded');
      }
      const media = await store.uploadMedia(
        userId,
        {
          ownerUserId: userId,
          filename: req.file.originalname || 'story.bin',
          mimetype: req.file.mimetype || 'application/octet-stream',
          size: req.file.size,
          buffer: req.file.buffer,
          purpose: 'generic',
        },
        {
          contentType: 'STORY',
        },
      );
      const story = store.createStory(
        userId,
        media.url,
        req.file.mimetype.startsWith('video/') ? 'video' : 'image',
        req.body?.caption,
      );
      const user = store.getCurrentUserPayload(userId);
      const payload = {
        id: story.id,
        userId: String(story.userId),
        userName: user.profile.displayName,
        userAvatarUrl: user.profile.avatarUrl,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        caption: story.caption,
        createdAt: story.createdAt.toISOString(),
        expiresAt: story.expiresAt.toISOString(),
        viewCount: story.viewCount,
        isViewedByMe: false,
        isOwnStory: true,
      };
      sendSuccess(
        res,
        { story: payload, data: payload },
        {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        },
      );
    }),
  );

  router.post(
    '/api/v1/stories/:id/view',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const id = toPositiveInt(req.params.id, 'id');
      store.markStoryViewed(viewerId, id);
      sendSuccess(
        res,
        { success: true },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.delete(
    '/api/v1/stories/:id',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const id = toPositiveInt(req.params.id, 'id');
      try {
        store.deleteStory(viewerId, id);
        sendSuccess(
          res,
          { success: true },
          { requestId: req.requestId, correlationId: req.correlationId },
        );
      } catch (error) {
        throw mapError(error, 'Failed to delete story');
      }
    }),
  );

  // Database-backed taxonomy endpoints
  router.get(
    '/api/v1/taxonomies/feelings',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const search = req.query.q?.toString();
      const feelings = await service.getActivePostFeelings(search);
      sendSuccess(res, { data: feelings }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/taxonomies/activities',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const search = req.query.q?.toString();
      const category = req.query.category?.toString();
      const activities = await service.getActivePostActivities(search, category);
      sendSuccess(res, { data: activities }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/taxonomies/categories',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const search = req.query.q?.toString();
      const categories = await service.getActivePostCategories(search);
      sendSuccess(res, { data: categories }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/taxonomies/tags',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const search = req.query.q?.toString();
      const tags = await service.getActiveContentTags(search);
      sendSuccess(res, { data: tags }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.get(
    '/api/v1/taxonomies/background-styles',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const styles = await service.getActiveBackgroundStyles();
      sendSuccess(res, { data: styles }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  // Canonical caption-length / background-eligibility limits — the single
  // config source Web reads instead of hardcoding 5000/300 (see
  // PostComposerConfig in schema.prisma).
  router.get(
    '/api/v1/taxonomies/post-composer-config',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const data = await service.getPostComposerConfig();
      sendSuccess(res, { data }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  // Backward-compatible feeling-activities endpoint (for Flutter compatibility)
  router.get(
    '/api/v1/feeling-activities',
    optional,
    asyncHandler(async (req, res) => {
      if (!prisma) {
        throw AppError.internal('Database not available');
      }
      const service = new TaxonomyService(prisma);
      const type = req.query.type?.toString().toUpperCase();
      const q = req.query.q?.toString();

      const allItems: Array<{
        id: string;
        labelEn: string;
        emoji: string | null | undefined;
        category: string | null | undefined;
        type: 'FEELING' | 'ACTIVITY';
      }> = [];

      if (type === 'FEELING' || !type) {
        const feelings = await service.getActivePostFeelings(q);
        allItems.push(...feelings.map(f => ({
          id: f.key,
          labelEn: f.label,
          emoji: f.emoji,
          category: 'Feelings',
          type: 'FEELING' as const,
        })));
      }

      if (type === 'ACTIVITY' || !type) {
        const activities = await service.getActivePostActivities(q);
        allItems.push(...activities.map(a => ({
          id: a.key,
          labelEn: a.label,
          emoji: a.emoji,
          category: a.category,
          type: 'ACTIVITY' as const,
        })));
      }

      sendSuccess(res, { data: allItems }, {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  // ── Admin taxonomy management ──────────────────────────────────────────
  // Every route below requires a valid session AND the 'admin' role (see
  // adminOnly above) — an ordinary authenticated user gets 403, not a
  // silently-scoped response. Web's own /admin route guard is defense in
  // depth only; this middleware is the actual enforcement boundary.

  router.get(
    '/api/v1/admin/taxonomies/feelings',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      const data = await service.listAllPostFeelings(req.query.q?.toString());
      sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/admin/taxonomies/feelings',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const key = normalizeContentField(req.body?.key);
        const label = normalizeContentField(req.body?.label);
        const emoji = normalizeContentField(req.body?.emoji);
        if (!key || !label || !emoji) throw AppError.validation('key, label, and emoji are required');
        const data = await service.createFeeling({
          key,
          label,
          emoji,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
        });
        sendSuccess(res, { data }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to create feeling');
      }
    }),
  );

  router.patch(
    '/api/v1/admin/taxonomies/feelings/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const id = toPositiveInt(req.params.id, 'id');
        const data = await service.updateFeeling(id, {
          label: normalizeContentField(req.body?.label) ?? undefined,
          emoji: normalizeContentField(req.body?.emoji) ?? undefined,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
          isActive: toBoolean(req.body?.isActive),
        });
        sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to update feeling');
      }
    }),
  );

  router.delete(
    '/api/v1/admin/taxonomies/feelings/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        await service.deleteFeeling(toPositiveInt(req.params.id, 'id'));
        sendSuccess(res, { success: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to delete feeling');
      }
    }),
  );

  router.get(
    '/api/v1/admin/taxonomies/activities',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      const data = await service.listAllPostActivities(req.query.q?.toString());
      sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/admin/taxonomies/activities',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const key = normalizeContentField(req.body?.key);
        const label = normalizeContentField(req.body?.label);
        const emoji = normalizeContentField(req.body?.emoji);
        const category = normalizeContentField(req.body?.category) || 'General';
        if (!key || !label || !emoji) throw AppError.validation('key, label, and emoji are required');
        const data = await service.createActivity({
          key,
          label,
          emoji,
          category,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
        });
        sendSuccess(res, { data }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to create activity');
      }
    }),
  );

  router.patch(
    '/api/v1/admin/taxonomies/activities/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const id = toPositiveInt(req.params.id, 'id');
        const data = await service.updateActivity(id, {
          label: normalizeContentField(req.body?.label) ?? undefined,
          emoji: normalizeContentField(req.body?.emoji) ?? undefined,
          category: normalizeContentField(req.body?.category) ?? undefined,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
          isActive: toBoolean(req.body?.isActive),
        });
        sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to update activity');
      }
    }),
  );

  router.delete(
    '/api/v1/admin/taxonomies/activities/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        await service.deleteActivity(toPositiveInt(req.params.id, 'id'));
        sendSuccess(res, { success: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to delete activity');
      }
    }),
  );

  router.get(
    '/api/v1/admin/taxonomies/categories',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      const data = await service.listAllPostCategories(req.query.q?.toString());
      sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/admin/taxonomies/categories',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const key = normalizeContentField(req.body?.key);
        const label = normalizeContentField(req.body?.label);
        if (!key || !label) throw AppError.validation('key and label are required');
        const data = await service.createCategory({
          key,
          label,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
        });
        sendSuccess(res, { data }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to create category');
      }
    }),
  );

  router.patch(
    '/api/v1/admin/taxonomies/categories/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const id = toPositiveInt(req.params.id, 'id');
        const data = await service.updateCategory(id, {
          label: normalizeContentField(req.body?.label) ?? undefined,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
          isActive: toBoolean(req.body?.isActive),
        });
        sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to update category');
      }
    }),
  );

  router.delete(
    '/api/v1/admin/taxonomies/categories/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        await service.deleteCategory(toPositiveInt(req.params.id, 'id'));
        sendSuccess(res, { success: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to delete category');
      }
    }),
  );

  router.get(
    '/api/v1/admin/taxonomies/tags',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      const data = await service.listAllContentTags(req.query.q?.toString());
      sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/admin/taxonomies/tags',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const key = normalizeContentField(req.body?.key);
        const label = normalizeContentField(req.body?.label);
        if (!key || !label) throw AppError.validation('key and label are required');
        const data = await service.createContentTag({
          key,
          label,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
        });
        sendSuccess(res, { data }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to create content tag');
      }
    }),
  );

  router.patch(
    '/api/v1/admin/taxonomies/tags/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const id = toPositiveInt(req.params.id, 'id');
        const data = await service.updateContentTag(id, {
          label: normalizeContentField(req.body?.label) ?? undefined,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
          isActive: toBoolean(req.body?.isActive),
        });
        sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to update content tag');
      }
    }),
  );

  router.delete(
    '/api/v1/admin/taxonomies/tags/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        await service.deleteContentTag(toPositiveInt(req.params.id, 'id'));
        sendSuccess(res, { success: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to delete content tag');
      }
    }),
  );

  router.get(
    '/api/v1/admin/taxonomies/background-styles',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      const data = await service.listAllBackgroundStyles();
      sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/admin/taxonomies/background-styles',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const key = normalizeContentField(req.body?.key);
        const label = normalizeContentField(req.body?.label);
        if (!key || !label) throw AppError.validation('key and label are required');
        const data = await service.createBackgroundStyle({
          key,
          label,
          styleType: normalizeContentField(req.body?.styleType) ?? undefined,
          colorValue: normalizeContentField(req.body?.colorValue),
          colorValueEnd: normalizeContentField(req.body?.colorValueEnd),
          textColor: normalizeContentField(req.body?.textColor) ?? undefined,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
        });
        sendSuccess(res, { data }, {
          requestId: req.requestId,
          correlationId: req.correlationId,
          statusCode: 201,
        });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to create background style');
      }
    }),
  );

  router.patch(
    '/api/v1/admin/taxonomies/background-styles/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        const id = toPositiveInt(req.params.id, 'id');
        const data = await service.updateBackgroundStyle(id, {
          label: normalizeContentField(req.body?.label) ?? undefined,
          styleType: normalizeContentField(req.body?.styleType) ?? undefined,
          colorValue: req.body?.colorValue === undefined ? undefined : normalizeContentField(req.body?.colorValue),
          colorValueEnd:
            req.body?.colorValueEnd === undefined ? undefined : normalizeContentField(req.body?.colorValueEnd),
          textColor: normalizeContentField(req.body?.textColor) ?? undefined,
          sortOrder: toOptionalPositiveInt(req.body?.sortOrder),
          isActive: toBoolean(req.body?.isActive),
        });
        sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to update background style');
      }
    }),
  );

  router.delete(
    '/api/v1/admin/taxonomies/background-styles/:id',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      try {
        await service.deleteBackgroundStyle(toPositiveInt(req.params.id, 'id'));
        sendSuccess(res, { success: true }, { requestId: req.requestId, correlationId: req.correlationId });
      } catch (error) {
        throw mapTaxonomyError(error, 'Failed to delete background style');
      }
    }),
  );

  router.patch(
    '/api/v1/admin/taxonomies/post-composer-config',
    required,
    adminOnly,
    asyncHandler(async (req, res) => {
      if (!prisma) throw AppError.internal('Database not available');
      const service = new TaxonomyService(prisma);
      const maxCaptionCharacters = toOptionalPositiveInt(req.body?.maxCaptionCharacters);
      const maxBackgroundCaptionCharacters = toOptionalPositiveInt(
        req.body?.maxBackgroundCaptionCharacters,
      );
      if (maxCaptionCharacters === undefined && maxBackgroundCaptionCharacters === undefined) {
        throw AppError.validation(
          'Provide maxCaptionCharacters and/or maxBackgroundCaptionCharacters',
        );
      }
      const data = await service.updatePostComposerConfig({
        maxCaptionCharacters,
        maxBackgroundCaptionCharacters,
      });
      sendSuccess(res, { data }, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}
