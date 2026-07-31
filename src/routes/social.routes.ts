import { Router } from 'express';
import multer from 'multer';

import { sendSuccess } from '../core/http/api-response';
import { AppError } from '../core/errors/app-error';
import { requiredAuth, optionalAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import {
  InMemoryMediaStorageAdapter,
  resolveStoredMediaPath,
} from '../modules/media/media-storage';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';
import { extname } from 'node:path';

export interface SocialRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
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
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Username already taken'))
    return AppError.conflict('Username already taken', { field: 'username' });
  if (message.includes('You cannot follow yourself')) return AppError.validation(message);
  if (message.includes('You cannot like your own profile')) return AppError.validation(message);
  if (message.includes('You cannot send a request to yourself'))
    return AppError.validation(message);
  if (message.includes('You cannot block yourself')) return AppError.validation(message);
  if (message.includes('Forbidden')) return AppError.authorizationDenied('Forbidden');
  if (message.includes('not found')) return AppError.notFound(message);
  if (message.includes('pending')) return AppError.validation(message);
  if (message.includes('Report type is required')) return AppError.validation(message);
  if (message.includes('Report reason is required')) return AppError.validation(message);
  if (message.includes('Invalid target')) return AppError.validation(message);
  return AppError.internal(fallbackMessage);
}

export function socialRoutes(deps: SocialRoutesDeps): Router {
  const router = Router();
  const store = deps.socialStore ?? createSocialCoreStore(new InMemoryMediaStorageAdapter());
  const required = requiredAuth({ verifier: deps.verifier });
  const optional = optionalAuth({ verifier: deps.verifier });

  router.get(
    '/api/v1/user/me',
    required,
    asyncHandler(async (req, res) => {
      const userId = await readUserId(req, store);
      sendSuccess(res, store.getCurrentUserPayload(userId), {
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
      sendSuccess(res, store.getCurrentUserPayload(userId), {
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
        const payload = store.updateCurrentUserProfile(userId, {
          displayName: req.body?.displayName,
          username: req.body?.username,
          bio: req.body?.bio,
          visibility: req.body?.visibility,
          showEmail: req.body?.showEmail,
          showPhone: req.body?.showPhone,
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
      const user = store.getUserByUsername(String(req.params.username || ''));
      if (!user) throw AppError.notFound('User not found');
      sendSuccess(res, store.getVisitorUserPayload(viewerId, user.id), {
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
      if (!store.getUserById(userId)) throw AppError.notFound('User not found');
      sendSuccess(res, store.getVisitorUserPayload(viewerId, userId), {
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
      sendSuccess(res, store.listBlockedUsers(viewerId), {
        requestId: req.requestId,
        correlationId: req.correlationId,
      });
    }),
  );

  router.post(
    '/api/v1/social/block/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
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

  router.post(
    '/api/v1/social/follow/:userId',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = await readUserId(req, store);
      const targetId = toPositiveInt(req.params.userId, 'userId');
      try {
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
      sendSuccess(res, store.listFeed(viewerId, limit, req.query.cursor), {
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
        const post = store.createPost(viewerId, {
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
        sendSuccess(res, store.getPostById(viewerId, postId), {
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
          store.updatePost(viewerId, postId, {
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
        sendSuccess(res, store.deletePost(viewerId, postId), {
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
      try {
        sendSuccess(res, store.likePost(viewerId, postId), {
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
      sendSuccess(res, store.unlikePost(viewerId, postId), {
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

  return router;
}
