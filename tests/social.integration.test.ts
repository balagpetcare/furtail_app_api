import express from 'express';
import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import { errorHandler } from '../src/middleware/error-handler';
import { requiredAuth, requireOwnership } from '../src/security/auth-middleware';
import { AppError } from '../src/core/errors/app-error';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

describe('social core modules', () => {
  const principal: AuthenticatedPrincipal = {
    sub: '1',
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    issuedAt: Math.floor(Date.now() / 1000) - 10,
    roles: ['member'],
    permissions: ['profile:read'],
    scopes: ['openid', 'profile'],
    claims: {},
  };

  const verifier: TokenVerifier = {
    async verifyAccessToken(token: string) {
      if (token === 'valid-token') return principal;
      throw AppError.authenticationInvalid('Invalid or expired access token');
    },
  };

  function buildApp() {
    const socialStore = createSocialCoreStore();
    return { app: createAppWithDependencies({ authVerifier: verifier, socialStore }), socialStore };
  }

  it('returns current profile data, accepts media uploads, and applies profile updates', async () => {
    const { app } = buildApp();

    const me = await request(app).get('/api/v1/user/me').set('Authorization', 'Bearer valid-token');
    expect(me.status).toBe(200);
    expect(me.body.data.profile.username).toBe('amina');
    expect(me.body.data.followersCount).toBeGreaterThanOrEqual(0);

    const upload = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('avatar-bytes'), 'avatar.jpg');
    expect(upload.status).toBe(200);
    expect(upload.body.data.id).toBeGreaterThan(0);

    const updated = await request(app)
      .patch('/api/v1/user/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ displayName: 'Amina Updated', avatarMediaId: upload.body.data.id });
    expect(updated.status).toBe(200);
    expect(updated.body.data.profile.displayName).toBe('Amina Updated');
    expect(updated.body.data.profile.avatarMedia.id).toBe(upload.body.data.id);
  });

  it('ignores a birthdate sent to PATCH /user/me — DOB is owned by Central Auth, not Furtail', async () => {
    const { app } = buildApp();

    const before = await request(app)
      .get('/api/v1/user/me')
      .set('Authorization', 'Bearer valid-token');
    expect(before.status).toBe(200);

    const updated = await request(app)
      .patch('/api/v1/user/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ displayName: 'Amina DOB Test', birthdate: '1990-01-01T00:00:00.000Z' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.profile.displayName).toBe('Amina DOB Test');
    // Furtail's profile response must not have picked up the sent
    // birthdate — it stays exactly what it was before this PATCH.
    expect(updated.body.data.profile.birthdate).toBe(before.body.data.profile.birthdate);
  });

  it('rejects a duplicate username update', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .patch('/api/v1/user/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ username: 'zara' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.details).toMatchObject({ field: 'username' });
  });

  it('supports follow status and duplicate follow relationships idempotently', async () => {
    const { app } = buildApp();

    const first = await request(app)
      .post('/api/v1/social/follow/2')
      .set('Authorization', 'Bearer valid-token');
    const second = await request(app)
      .post('/api/v1/social/follow/2')
      .set('Authorization', 'Bearer valid-token');
    const status = await request(app)
      .get('/api/v1/social/status/2')
      .set('Authorization', 'Bearer valid-token');
    const unfollow = await request(app)
      .delete('/api/v1/social/follow/2')
      .set('Authorization', 'Bearer valid-token');
    const after = await request(app)
      .get('/api/v1/social/status/2')
      .set('Authorization', 'Bearer valid-token');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(status.body.data.isFollowing).toBe(true);
    expect(unfollow.status).toBe(200);
    expect(after.body.data.isFollowing).toBe(false);
  });

  it('returns post feeds, supports reactions, and keeps counts deduplicated', async () => {
    const { app } = buildApp();

    const feed = await request(app)
      .get('/api/v1/posts/feed')
      .set('Authorization', 'Bearer valid-token');
    expect(feed.status).toBe(200);
    expect(Array.isArray(feed.body.data)).toBe(true);
    expect(feed.body.data[0].author.profile.displayName).toBeDefined();

    const like1 = await request(app)
      .post('/api/v1/posts/1/like')
      .set('Authorization', 'Bearer valid-token');
    const like2 = await request(app)
      .post('/api/v1/posts/1/like')
      .set('Authorization', 'Bearer valid-token');
    const post = await request(app)
      .get('/api/v1/posts/1')
      .set('Authorization', 'Bearer valid-token');

    expect(like1.status).toBe(200);
    expect(like2.status).toBe(200);
    expect(post.body.data.likeCount).toBeGreaterThanOrEqual(1);
    expect(post.body.data.isLikedByMe).toBe(true);

    const unlike = await request(app)
      .delete('/api/v1/posts/1/like')
      .set('Authorization', 'Bearer valid-token');
    expect(unlike.status).toBe(200);
    expect(unlike.body.data.isLikedByMe).toBe(false);
  });

  it('supports comment pagination, replies, edit, delete, and comment reactions', async () => {
    const { app } = buildApp();

    const firstComment = await request(app)
      .post('/api/v1/posts/1/comments')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'First test comment' });
    const secondComment = await request(app)
      .post('/api/v1/posts/1/comments')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'Second test comment' });

    expect(firstComment.status).toBe(201);
    expect(secondComment.status).toBe(201);

    const paged = await request(app)
      .get(`/api/v1/posts/1/comments?limit=1&cursor=${secondComment.body.data.id}`)
      .set('Authorization', 'Bearer valid-token');
    expect(paged.status).toBe(200);
    expect(paged.body.data.items).toHaveLength(1);

    const edited = await request(app)
      .patch(`/api/v1/posts/1/comments/${firstComment.body.data.id}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'Edited test comment' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.isEdited).toBe(true);
    expect(edited.body.data.text).toBe('Edited test comment');

    const liked = await request(app)
      .post(`/api/v1/posts/1/comments/${firstComment.body.data.id}/like`)
      .set('Authorization', 'Bearer valid-token');
    const replied = await request(app)
      .post(`/api/v1/posts/1/comments/${firstComment.body.data.id}/replies`)
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'Reply test' });
    const deleted = await request(app)
      .delete(`/api/v1/posts/1/comments/${firstComment.body.data.id}`)
      .set('Authorization', 'Bearer valid-token');
    const postComments = await request(app)
      .get('/api/v1/posts/1/comments')
      .set('Authorization', 'Bearer valid-token');

    expect(liked.status).toBe(200);
    expect(replied.status).toBe(201);
    expect(replied.body.data.parentId).toBe(firstComment.body.data.id);
    expect(deleted.status).toBe(200);
    expect(
      postComments.body.data.some(
        (comment: { id: number; text: string }) =>
          comment.id === firstComment.body.data.id && comment.text === '[deleted]',
      ),
    ).toBe(true);
  });

  it('returns bookmarked posts, video feed pagination metadata, and visitor profile visibility', async () => {
    const { app } = buildApp();

    const bookmarked = await request(app)
      .get('/api/v1/posts/bookmarked')
      .set('Authorization', 'Bearer valid-token');
    expect(bookmarked.status).toBe(200);
    expect(Array.isArray(bookmarked.body.data.items)).toBe(true);

    const videos = await request(app)
      .get('/api/v1/posts/videos?limit=1&page=1')
      .set('Authorization', 'Bearer valid-token');
    expect(videos.status).toBe(200);
    expect(Array.isArray(videos.body.data)).toBe(true);
    expect(videos.body.meta.page).toBe(1);
    expect(videos.body.meta.limit).toBe(1);

    const visitor = await request(app)
      .get('/api/v1/user/by-username/zara')
      .set('Authorization', 'Bearer valid-token');
    expect(visitor.status).toBe(200);
    expect(visitor.body.data.profile.username).toBe('zara');
    expect(visitor.body.data.canViewFullProfile).toBe(false);
  });

  it('keeps ownership checks enforced on protected helper routes', async () => {
    const app = express();
    app.get('/own', requiredAuth({ verifier }), requireOwnership('1'), (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/deny', requiredAuth({ verifier }), requireOwnership('2'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler());

    const ok = await request(app).get('/own').set('Authorization', 'Bearer valid-token');
    const denied = await request(app).get('/deny').set('Authorization', 'Bearer valid-token');
    expect(ok.status).toBe(200);
    expect(denied.status).toBe(403);
  });

  describe('Stories API', () => {
    it('creates a new story, lists it in the feed, marks it viewed, and deletes it', async () => {
      const { app } = buildApp();

      // Get empty feed first (should return empty or seeded active stories)
      const feedBefore = await request(app)
        .get('/api/v1/stories/feed')
        .set('Authorization', 'Bearer valid-token');
      expect(feedBefore.status).toBe(200);
      expect(Array.isArray(feedBefore.body.data.stories)).toBe(true);

      // Create a story
      const createRes = await request(app)
        .post('/api/v1/stories')
        .set('Authorization', 'Bearer valid-token')
        .attach('media', Buffer.from('fake image content'), {
          filename: 'story.jpg',
          contentType: 'image/jpeg',
        })
        .field('caption', 'Test story caption');

      expect(createRes.status).toBe(201);
      // Wait, createStory returns { story: payload, data: payload }
      // So createRes.body.data is the payload!
      expect(createRes.body.data.story.caption).toBe('Test story caption');
      expect(createRes.body.data.story.mediaType).toBe('image');
      const storyId = createRes.body.data.story.id;

      // Check feed contains the new story
      const feedAfter = await request(app)
        .get('/api/v1/stories/feed')
        .set('Authorization', 'Bearer valid-token');
      expect(feedAfter.status).toBe(200);
      const createdStory = feedAfter.body.data.stories.find((s: { id: number }) => s.id === storyId);
      expect(createdStory).toBeDefined();
      expect(createdStory.isViewedByMe).toBe(false);

      // Mark story viewed
      const viewRes = await request(app)
        .post(`/api/v1/stories/${storyId}/view`)
        .set('Authorization', 'Bearer valid-token');
      expect(viewRes.status).toBe(200);

      // Check feed again to verify isViewedByMe is true
      const feedAfterView = await request(app)
        .get('/api/v1/stories/feed')
        .set('Authorization', 'Bearer valid-token');
      const viewedStory = feedAfterView.body.data.stories.find((s: { id: number }) => s.id === storyId);
      expect(viewedStory.isViewedByMe).toBe(true);
      expect(viewedStory.viewCount).toBe(1);

      // Delete the story
      const deleteRes = await request(app)
        .delete(`/api/v1/stories/${storyId}`)
        .set('Authorization', 'Bearer valid-token');
      expect(deleteRes.status).toBe(200);

      // Verify it's gone from the feed
      const feedFinal = await request(app)
        .get('/api/v1/stories/feed')
        .set('Authorization', 'Bearer valid-token');
      const deletedStory = feedFinal.body.data.stories.find((s: { id: number }) => s.id === storyId);

      expect(deletedStory).toBeUndefined();
    });
  });
});
