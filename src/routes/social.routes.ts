import { Router } from 'express';
import multer from 'multer';

import { sendSuccess } from '../core/http/api-response';
import { AppError } from '../core/errors/app-error';
import { requiredAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import { InMemoryMediaStorageAdapter } from '../modules/media/media-storage';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';

export interface SocialRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 } });

function readUserId(req: { principal?: { sub: string } }, store: SocialCoreStore): number {
  const id = req.principal ? store.resolveUserId(req.principal) : null;
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

function normalizeBodyArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

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

  router.get(
    '/api/v1/user/me',
    required,
    asyncHandler(async (req, res) => {
      const userId = readUserId(req, store);
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
      const userId = readUserId(req, store);
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
      const userId = readUserId(req, store);
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
      const userId = readUserId(req, store);
      if (!req.file) {
        throw AppError.validation('No file uploaded');
      }
      const media = await store.uploadMedia(userId, {
        ownerUserId: userId,
        filename: req.file.originalname || 'upload.bin',
        mimetype: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        buffer: req.file.buffer,
        purpose: 'generic',
      });
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
    '/api/v1/user/by-username/:username',
    required,
    asyncHandler(async (req, res) => {
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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
      const viewerId = readUserId(req, store);
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

  return router;
}
