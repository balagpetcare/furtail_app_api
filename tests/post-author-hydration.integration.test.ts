import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Regression coverage for the Phase 3B hotfix: a persisted Post loaded from
 * Prisma into a store instance that never independently authenticated the
 * post's author (a fresh process, or — as here — a different viewer whose
 * own resolveUserId() call only hydrates *their own* user shadow, not the
 * author's) used to throw "User not found" out of mustGetUser() inside
 * serializePost(). The original Phase 3B restart test didn't catch this
 * because every test in that file used the same user as both author and
 * viewer, so that viewer's own auth flow always incidentally hydrated the
 * author too — see docs/jobs job file for the full postmortem.
 */
describe('persisted Post author hydration on cold start (Prisma-backed)', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const audience = 'furtail-mobile';
  const clientId = 'furtail-mobile';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience,
      clientId,
      expiresAt: nowSeconds + 600,
      issuedAt: nowSeconds - 10,
      roles: ['member'],
      permissions: [],
      scopes: ['openid', 'profile'],
      claims: {},
    };
  }

  /** Fresh SocialCoreStore each call — empty this.users/this.posts/this.media, standing in for a restarted process. */
  function freshStore(): SocialCoreStore {
    return createSocialCoreStore(
      new InMemoryMediaStorageAdapter(),
      undefined,
      async (p) => {
        const id = Number(p.sub);
        return Number.isFinite(id) && id > 0 ? { id } : null;
      },
      getTestPrisma(),
    );
  }

  function buildApp(store: SocialCoreStore = freshStore()) {
    const prisma = getTestPrisma();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token: string) {
        const match = /^user-(\d+)$/.exec(token);
        if (match) return principal(match[1]!);
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore: store, prisma });
    return { app, store };
  }

  let counter = 0;
  async function createTestUser(overrides: Record<string, unknown> = {}) {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    return prisma.user.create({
      data: {
        profile: {
          create: { username: `authhyd_${suffix}`, displayName: `Author Hydration ${suffix}`, ...overrides },
        },
      },
      include: { profile: true },
    });
  }

  async function createTestMedia(ownerUserId: number) {
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return prisma.media.create({
      data: {
        ownerUserId,
        filename: `avatar-${suffix}.jpg`,
        mimetype: 'image/jpeg',
        size: 1024,
        storageKey: `test/${suffix}`,
        url: `https://cdn.test/${suffix}`,
        status: 'READY',
      },
    });
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.media.deleteMany({ where: { ownerUserId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  it('a persisted Post survives cold-start author hydration when the viewer is not the author', async () => {
    const author = await createTestUser();
    const viewer = await createTestUser();
    try {
      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'hydration test', type: 'TEXT', privacy: 'PUBLIC' });
      expect(created.status).toBe(201);

      // Fresh store; the request is authenticated as the VIEWER, whose own
      // resolveUserId() call hydrates only the viewer's own shadow, not the
      // author's — before the fix this reproduced "User not found".
      const feed = await request(buildApp(freshStore()).app)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${viewer.id}`);
      expect(feed.status).toBe(200);
      const found = feed.body.data.find((p: { id: number }) => p.id === created.body.data.id);
      expect(found).toBeDefined();
      expect(found.author.id).toBe(author.id);
      expect(found.author.profile.displayName).toBe(author.profile!.displayName);
      expect(found.author.profile.username).toBe(author.profile!.username);
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(viewer.id);
    }
  });

  it('feed hydrates multiple posts by different authors correctly in one cold start', async () => {
    const authorA = await createTestUser();
    const authorB = await createTestUser();
    const viewer = await createTestUser();
    try {
      const postA = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${authorA.id}`)
        .send({ caption: 'by author A', type: 'TEXT', privacy: 'PUBLIC' });
      const postB = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${authorB.id}`)
        .send({ caption: 'by author B', type: 'TEXT', privacy: 'PUBLIC' });

      const feed = await request(buildApp(freshStore()).app)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${viewer.id}`);
      expect(feed.status).toBe(200);

      const foundA = feed.body.data.find((p: { id: number }) => p.id === postA.body.data.id);
      const foundB = feed.body.data.find((p: { id: number }) => p.id === postB.body.data.id);
      expect(foundA.author.id).toBe(authorA.id);
      expect(foundA.author.profile.displayName).toBe(authorA.profile!.displayName);
      expect(foundB.author.id).toBe(authorB.id);
      expect(foundB.author.profile.displayName).toBe(authorB.profile!.displayName);
    } finally {
      await cleanupUser(authorA.id);
      await cleanupUser(authorB.id);
      await cleanupUser(viewer.id);
    }
  });

  it('an author with no avatar serializes with avatarMedia: null after cold start (not a "Media not found" crash)', async () => {
    const author = await createTestUser();
    const viewer = await createTestUser();
    try {
      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'no avatar', type: 'TEXT', privacy: 'PUBLIC' });

      const res = await request(buildApp(freshStore()).app)
        .get(`/api/v1/posts/${created.body.data.id}`)
        .set('Authorization', `Bearer user-${viewer.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.author.profile.avatarMedia).toBeNull();
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(viewer.id);
    }
  });

  it('an author WITH an avatar serializes the avatar correctly after cold start', async () => {
    const author = await createTestUser();
    const viewer = await createTestUser();
    try {
      const avatar = await createTestMedia(author.id);
      await getTestPrisma().userProfile.update({
        where: { userId: author.id },
        data: { avatarMediaId: avatar.id },
      });

      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'with avatar', type: 'TEXT', privacy: 'PUBLIC' });

      // Fresh store: neither the Post's media cache nor the author's avatar
      // Media cache has been warmed by anything other than this request.
      const res = await request(buildApp(freshStore()).app)
        .get(`/api/v1/posts/${created.body.data.id}`)
        .set('Authorization', `Bearer user-${viewer.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.author.profile.avatarMedia).not.toBeNull();
      expect(res.body.data.author.profile.avatarMedia.id).toBe(avatar.id);
      expect(res.body.data.author.profile.avatarMedia.url).toBe(avatar.url);
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(viewer.id);
    }
  });

  it('getPostById resolves the author correctly through a fresh store when the viewer is not the author', async () => {
    const author = await createTestUser();
    const viewer = await createTestUser();
    try {
      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'get by id', type: 'TEXT', privacy: 'PUBLIC' });

      const res = await request(buildApp(freshStore()).app)
        .get(`/api/v1/posts/${created.body.data.id}`)
        .set('Authorization', `Bearer user-${viewer.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.author.id).toBe(author.id);
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(viewer.id);
    }
  });

  it('an idempotency replay through a fresh store still serializes the original author correctly', async () => {
    const author = await createTestUser();
    const viewer = await createTestUser();
    try {
      const key = `author-hydration-idem-${Date.now()}`;
      const first = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .set('Idempotency-Key', key)
        .send({ caption: 'idem replay', type: 'TEXT', privacy: 'PUBLIC' });
      expect(first.status).toBe(201);

      // Replay from a fresh store, as the AUTHOR themself this time (the
      // idempotency lookup path is what's under test, not the viewer path).
      const replay = await request(buildApp(freshStore()).app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .set('Idempotency-Key', key)
        .send({ caption: 'idem replay', type: 'TEXT', privacy: 'PUBLIC' });
      expect(replay.status).toBe(201);
      expect(replay.body.data.id).toBe(first.body.data.id);
      expect(replay.body.data.author.id).toBe(author.id);

      void viewer;
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(viewer.id);
    }
  });

  it('existing Post response author shape is unchanged: {id, profile: {displayName, username, avatarMedia}}', async () => {
    const author = await createTestUser();
    try {
      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'shape check', type: 'TEXT', privacy: 'PUBLIC' });
      expect(created.status).toBe(201);
      const author_ = created.body.data.author;
      expect(Object.keys(author_).sort()).toEqual(['id', 'profile']);
      expect(Object.keys(author_.profile).sort()).toEqual(['avatarMedia', 'displayName', 'username']);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('a Post authored by a User with no UserProfile row fails honestly (404), not with fabricated author data', async () => {
    const prisma = getTestPrisma();
    const viewer = await createTestUser();
    // Deliberately bypass the store's createPost — a User row with no
    // UserProfile is a legitimate (if unusual) database state per schema
    // (User.profile is optional), and this constructs it directly to prove
    // mapUserRowToRecord()'s "return null rather than fabricate" behavior.
    const profilelessUser = await prisma.user.create({ data: {} });
    const corruptPost = await prisma.post.create({
      data: { authorId: profilelessUser.id, type: 'TEXT', caption: 'orphaned author', privacy: 'PUBLIC' },
    });
    try {
      const res = await request(buildApp(freshStore()).app)
        .get(`/api/v1/posts/${corruptPost.id}`)
        .set('Authorization', `Bearer user-${viewer.id}`);
      // Must not be 200 with a placeholder "Unknown User" author — the
      // existing mustGetUser() "User not found" error, mapped to 404 by the
      // existing generic error-mapping rule, is the correct honest failure.
      expect(res.status).toBe(404);
    } finally {
      await prisma.post.delete({ where: { id: corruptPost.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: profilelessUser.id } }).catch(() => undefined);
      await cleanupUser(viewer.id);
    }
  });
});
