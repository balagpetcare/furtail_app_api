# Step 7 - Social Core Modules

## Summary

Implemented the confirmed Flutter social/profile/post contracts in `furtail_app_api` with a seeded in-memory social store, multipart media upload support, duplicated-reaction/follow protection, pagination support, and Prisma schema constraints/indexes for the social data model.

## Implemented Endpoints

### Current user and profile

- `GET /api/v1/user/me`
- `GET /api/v1/user/profile`
- `PATCH /api/v1/user/me`
- `POST /api/v1/media/upload`
- `GET /api/v1/user/:userId`
- `GET /api/v1/user/by-username/:username`

### Social graph

- `GET /api/v1/social/status/:userId`
- `POST /api/v1/social/follow/:userId`
- `DELETE /api/v1/social/follow/:userId`
- `POST /api/v1/social/like/:userId`
- `DELETE /api/v1/social/like/:userId`
- `POST /api/v1/social/friend-request/:userId`
- `POST /api/v1/social/friend-request/:requestId/accept`
- `POST /api/v1/social/friend-request/:requestId/reject`
- `DELETE /api/v1/social/friend-request/:requestId/cancel`

### Posts and feed

- `GET /api/v1/posts/feed`
- `GET /api/v1/posts/videos`
- `GET /api/v1/posts/user/:userId`
- `GET /api/v1/posts/user/:userId/photos`
- `GET /api/v1/posts/user/:userId/videos`
- `GET /api/v1/posts/bookmarked`
- `POST /api/v1/posts`
- `GET /api/v1/posts/:postId`
- `PATCH /api/v1/posts/:postId`
- `DELETE /api/v1/posts/:postId`
- `POST /api/v1/posts/:postId/like`
- `DELETE /api/v1/posts/:postId/like`
- `POST /api/v1/posts/:postId/bookmark`
- `DELETE /api/v1/posts/:postId/bookmark`
- `POST /api/v1/posts/:postId/share`
- `POST /api/v1/posts/:postId/view`

### Comments and replies

- `GET /api/v1/posts/:postId/comments`
- `POST /api/v1/posts/:postId/comments`
- `PATCH /api/v1/posts/:postId/comments/:commentId`
- `DELETE /api/v1/posts/:postId/comments/:commentId`
- `POST /api/v1/posts/:postId/comments/:commentId/like`
- `DELETE /api/v1/posts/:postId/comments/:commentId/like`
- `POST /api/v1/posts/:postId/comments/:commentId/replies`

## Data Model / Constraints

Added Prisma models and constraints for:

- user/profile
- media
- posts and post-media joins
- post likes, bookmarks, views, shares
- comments, comment likes, replies
- follows
- profile likes
- blocks
- friend requests

Key protections now enforced by schema:

- duplicate follows are blocked by `@@unique([followerId, followingId])`
- duplicate post likes are blocked by `@@unique([postId, userId])`
- duplicate comment likes are blocked by `@@unique([commentId, userId])`
- duplicate bookmarks are blocked by `@@unique([postId, userId])`

Indexes were added for the feed, comment, and lookup paths used by the app.

## Packages Changed

- Added `multer@2.2.0`
- Added `@types/multer@2.0.0`

## Files Created Or Modified

- `package.json`
- `package-lock.json`
- `prisma/schema.prisma`
- `src/app.ts`
- `src/core/http/api-response.ts`
- `src/modules/media/media-storage.ts`
- `src/modules/social/social-store.ts`
- `src/routes/index.ts`
- `src/routes/social.routes.ts`
- `tests/social.integration.test.ts`

## Commands Executed

- `npm install`
- `npx prisma validate`
- `npx prisma generate`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test`
- `npm run build`
- `npm run check`
- Compiled smoke test on port `7300` using the built app with a mocked verifier
- `GET /health`
- `GET /ready`
- `GET /api/v1/version`
- `GET /api/v1/auth/me` with `Authorization: Bearer valid-token`

## Test And Smoke Results

- `npm run check` passed
- Jest suites passed: `5/5`
- Tests passed: `34/34`
- Prisma validate passed
- Prisma generate passed
- Smoke responses:
  - `GET /health` -> 200, `status: alive`
  - `GET /ready` -> 200, `database: NOT_CONFIGURED`
  - `GET /api/v1/version` -> 200
  - `GET /api/v1/auth/me` -> 200 with mocked principal

## Port Cleanup

- Temporary process on port `7300` was stopped
- Final port check: `PORT_7300_FREE`

## Deferred Gaps

- Backend block-management endpoints were not added because the Flutter app currently keeps blocked users in local storage and does not expose a confirmed server contract for them.
- Fundraising, pets, payments, and notifications were intentionally not implemented in this step.
- The in-memory social store is the active runtime backing for this step; a real Prisma-backed repository can be introduced later without changing the client contract.

## Reference Repositories

- `D:\wpa\furtail\furtail_api` remained git-clean
- `D:\wpa\wpa_auth\wpa_auth_api` remained git-clean
