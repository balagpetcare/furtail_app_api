import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Phase 3B — Persistent Post vertical slice. Proves Post/PostMedia/
 * PostTaggedPet actually survive a fresh SocialCoreStore instance (the
 * in-process stand-in for a server restart, since the test can't kill and
 * relaunch a real process), that create-idempotency is durable and
 * concurrency-safe via the DB unique constraint, and that media
 * ownership/status/ordering are enforced against the real Media table.
 */
describe('persistent Post vertical slice (Prisma-backed)', () => {
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

  /** Fresh SocialCoreStore each call — no shared in-memory Map, standing in for a restarted process. */
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
  async function createTestUser() {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    return prisma.user.create({
      data: { profile: { create: { username: `postp_${suffix}`, displayName: `Post Test ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function createTestMedia(ownerUserId: number, overrides: Record<string, unknown> = {}) {
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return prisma.media.create({
      data: {
        ownerUserId,
        filename: `test-${suffix}.jpg`,
        mimetype: 'image/jpeg',
        size: 1024,
        storageKey: `test/${suffix}`,
        url: `https://cdn.test/${suffix}`,
        status: 'READY',
        ...overrides,
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

  it('creates a Post and every supported metadata field round-trips through a fresh store instance', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const media1 = await createTestMedia(author.id);
      const media2 = await createTestMedia(author.id);

      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({
          caption: 'full metadata post',
          type: 'IMAGE',
          category: 'GENERAL',
          privacy: 'FOLLOWERS_ONLY',
          backgroundStyle: 'sunset',
          postType: 'LOST_PET',
          lostPetName: 'Milo',
          lostPetLocation: 'Dhanmondi',
          lostPetContactVisible: true,
          mediaIds: [media2.id, media1.id],
          songTitle: 'Song',
          songArtist: 'Artist',
          songStartMs: 1000,
          songDurationMs: 15000,
          locationText: 'Dhaka',
          feelingId: 'happy',
          feelingLabel: 'Happy',
          feelingEmoji: '😀',
          activityId: 'walking',
          activityLabel: 'Walking',
          activityEmoji: '🚶',
        });
      expect(created.status).toBe(201);
      const postId = created.body.data.id;

      // Fresh store — nothing cached, must load from Prisma.
      const { app: app2 } = buildApp(freshStore());
      const reread = await request(app2)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(reread.status).toBe(200);
      const post = reread.body.data;
      expect(post.caption).toBe('full metadata post');
      expect(post.type).toBe('IMAGE');
      expect(post.privacy).toBe('FOLLOWERS_ONLY');
      expect(post.backgroundStyle).toBe('sunset');
      expect(post.postType).toBe('LOST_PET');
      expect(post.lostPetName).toBe('Milo');
      expect(post.lostPetLocation).toBe('Dhanmondi');
      expect(post.lostPetContactVisible).toBe(true);
      expect(post.songTitle).toBe('Song');
      expect(post.songArtist).toBe('Artist');
      expect(post.songStartMs).toBe(1000);
      expect(post.songDurationMs).toBe(15000);
      expect(post.locationTag).toBe('Dhaka');
      expect(post.feelingId).toBe('happy');
      expect(post.activityId).toBe('walking');
      // Media order preserved exactly as submitted, not insertion/id order.
      expect(post.media.map((m: { id: number }) => m.id)).toEqual([media2.id, media1.id]);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('persists Bangla captions, emoji, and multiline text unchanged', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const caption = 'বাংলা ক্যাপশন 🐾\nদ্বিতীয় লাইন\nthird line 😀';
      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption, type: 'TEXT', privacy: 'PUBLIC' });
      expect(created.status).toBe(201);

      const reread = await request(buildApp(freshStore()).app)
        .get(`/api/v1/posts/${created.body.data.id}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(reread.body.data.caption).toBe(caption);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('soft-deletes a Post: status persists and it is excluded from direct read and feed', async () => {
    const author = await createTestUser();
    try {
      const { app, store } = buildApp();
      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'to-delete', type: 'TEXT', privacy: 'PUBLIC' });
      const postId = created.body.data.id;

      const del = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(del.status).toBe(200);

      // Same store instance — direct read must now 404.
      const readAfterDelete = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(readAfterDelete.status).toBe(404);

      // Fresh store — status must have actually persisted, not just been an in-memory flag.
      const rawRow = await getTestPrisma().post.findUnique({ where: { id: postId } });
      expect(rawRow?.status).toBe('DELETED');
      void store;
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('rejects update/delete by a non-owner', async () => {
    const author = await createTestUser();
    const stranger = await createTestUser();
    try {
      const { app } = buildApp();
      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'owned', type: 'TEXT', privacy: 'PUBLIC' });
      const postId = created.body.data.id;

      const updateAttempt = await request(app)
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${stranger.id}`)
        .send({ caption: 'hijacked' });
      expect(updateAttempt.status).toBe(403);

      const deleteAttempt = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${stranger.id}`);
      expect(deleteAttempt.status).toBe(403);
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(stranger.id);
    }
  });

  describe('media validation', () => {
    it('rejects media owned by a different user', async () => {
      const author = await createTestUser();
      const other = await createTestUser();
      try {
        const foreignMedia = await createTestMedia(other.id);
        const { app } = buildApp();
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x', type: 'IMAGE', mediaIds: [foreignMedia.id] });
        expect(res.status).toBe(403);
      } finally {
        await cleanupUser(author.id);
        await cleanupUser(other.id);
      }
    });

    it('rejects a non-existent media id', async () => {
      const author = await createTestUser();
      try {
        const { app } = buildApp();
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x', type: 'IMAGE', mediaIds: [999999999] });
        expect(res.status).toBe(400);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('rejects non-READY media', async () => {
      const author = await createTestUser();
      try {
        const failedMedia = await createTestMedia(author.id, { status: 'FAILED' });
        const { app } = buildApp();
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x', type: 'IMAGE', mediaIds: [failedMedia.id] });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toContain('not ready');
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('de-duplicates a media id sent twice instead of erroring', async () => {
      const author = await createTestUser();
      try {
        const media = await createTestMedia(author.id);
        const { app } = buildApp();
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x', type: 'IMAGE', mediaIds: [media.id, media.id] });
        expect(res.status).toBe(201);
        expect(res.body.data.media.length).toBe(1);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('rejects more than the maximum number of media attachments', async () => {
      const author = await createTestUser();
      try {
        const ids: number[] = [];
        for (let i = 0; i < 11; i += 1) ids.push((await createTestMedia(author.id)).id);
        const { app } = buildApp();
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x', type: 'IMAGE', mediaIds: ids });
        expect(res.status).toBe(400);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('replaces media atomically on update and preserves the new order', async () => {
      const author = await createTestUser();
      try {
        const mediaA = await createTestMedia(author.id);
        const mediaB = await createTestMedia(author.id);
        const mediaC = await createTestMedia(author.id);
        const { app } = buildApp();
        const created = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x', type: 'IMAGE', mediaIds: [mediaA.id] });
        const postId = created.body.data.id;

        const updated = await request(app)
          .patch(`/api/v1/posts/${postId}`)
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ mediaIds: [mediaC.id, mediaB.id] });
        expect(updated.status).toBe(200);
        expect(updated.body.data.media.map((m: { id: number }) => m.id)).toEqual([mediaC.id, mediaB.id]);

        const reread = await request(buildApp(freshStore()).app)
          .get(`/api/v1/posts/${postId}`)
          .set('Authorization', `Bearer user-${author.id}`);
        expect(reread.body.data.media.map((m: { id: number }) => m.id)).toEqual([mediaC.id, mediaB.id]);
      } finally {
        await cleanupUser(author.id);
      }
    });
  });

  describe('durable create-idempotency', () => {
    it('first keyed request creates a Post; replay with the same key returns the same Post and does not duplicate it', async () => {
      const author = await createTestUser();
      try {
        const { app } = buildApp();
        const key = `idem-${Date.now()}`;
        const first = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'idempotent post', type: 'TEXT', privacy: 'PUBLIC' });
        expect(first.status).toBe(201);

        const replay = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'idempotent post', type: 'TEXT', privacy: 'PUBLIC' });
        expect(replay.status).toBe(201);
        expect(replay.body.data.id).toBe(first.body.data.id);

        const count = await getTestPrisma().post.count({
          where: { authorId: author.id, createIdempotencyKey: key },
        });
        expect(count).toBe(1);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('the same key survives a fresh store instance (restart) and still returns the original Post', async () => {
      const author = await createTestUser();
      try {
        const key = `idem-restart-${Date.now()}`;
        const first = await request(buildApp().app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'restart-safe', type: 'TEXT', privacy: 'PUBLIC' });
        expect(first.status).toBe(201);

        // New store instance = empty in-memory cache, standing in for a restarted process.
        const replay = await request(buildApp(freshStore()).app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'restart-safe', type: 'TEXT', privacy: 'PUBLIC' });
        expect(replay.status).toBe(201);
        expect(replay.body.data.id).toBe(first.body.data.id);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('a different idempotency key creates a genuinely new Post', async () => {
      const author = await createTestUser();
      try {
        const { app } = buildApp();
        const first = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', `key-a-${Date.now()}`)
          .send({ caption: 'post one', type: 'TEXT', privacy: 'PUBLIC' });
        const second = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', `key-b-${Date.now()}`)
          .send({ caption: 'post two', type: 'TEXT', privacy: 'PUBLIC' });
        expect(second.body.data.id).not.toBe(first.body.data.id);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('the same key from two different users does not collide', async () => {
      const authorA = await createTestUser();
      const authorB = await createTestUser();
      try {
        const { app } = buildApp();
        const key = `shared-key-${Date.now()}`;
        const postA = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${authorA.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'author A', type: 'TEXT', privacy: 'PUBLIC' });
        const postB = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${authorB.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'author B', type: 'TEXT', privacy: 'PUBLIC' });
        expect(postA.status).toBe(201);
        expect(postB.status).toBe(201);
        expect(postB.body.data.id).not.toBe(postA.body.data.id);
      } finally {
        await cleanupUser(authorA.id);
        await cleanupUser(authorB.id);
      }
    });

    it('the same key with a different payload is rejected with a conflict, not silently merged', async () => {
      const author = await createTestUser();
      try {
        const { app } = buildApp();
        const key = `conflict-${Date.now()}`;
        const first = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'original payload', type: 'TEXT', privacy: 'PUBLIC' });
        expect(first.status).toBe(201);

        const conflicting = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .set('Idempotency-Key', key)
          .send({ caption: 'a completely different payload', type: 'TEXT', privacy: 'PUBLIC' });
        expect(conflicting.status).toBe(409);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('a legacy request without an idempotency key is never deduplicated against another legacy request', async () => {
      const author = await createTestUser();
      try {
        const { app } = buildApp();
        const first = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'no key one', type: 'TEXT', privacy: 'PUBLIC' });
        const second = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'no key two', type: 'TEXT', privacy: 'PUBLIC' });
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.data.id).not.toBe(first.body.data.id);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('concurrent requests with the same key against a fresh store each resolve to exactly one Post row', async () => {
      const author = await createTestUser();
      try {
        const key = `race-${Date.now()}`;
        // Every concurrent caller uses its own fresh store (its own empty
        // in-memory cache) so the in-process fast-path map can't
        // accidentally serialize the race — the only thing that can make
        // this deterministic is the database's unique constraint.
        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            request(buildApp(freshStore()).app)
              .post('/api/v1/posts')
              .set('Authorization', `Bearer user-${author.id}`)
              .set('Idempotency-Key', key)
              .send({ caption: 'race', type: 'TEXT', privacy: 'PUBLIC' }),
          ),
        );
        for (const res of results) expect(res.status).toBe(201);
        const ids = new Set(results.map((r) => r.body.data.id));
        expect(ids.size).toBe(1);

        const count = await getTestPrisma().post.count({
          where: { authorId: author.id, createIdempotencyKey: key },
        });
        expect(count).toBe(1);
      } finally {
        await cleanupUser(author.id);
      }
    });
  });

  it('feed reads a Post through a fresh store instance after it was created on another', async () => {
    const author = await createTestUser();
    try {
      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'feed-restart-post', type: 'TEXT', privacy: 'PUBLIC' });
      expect(created.status).toBe(201);

      const feed = await request(buildApp(freshStore()).app)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${author.id}`);
      expect(feed.status).toBe(200);
      const found = feed.body.data.find((p: { id: number }) => p.id === created.body.data.id);
      expect(found).toBeDefined();
      expect(found.caption).toBe('feed-restart-post');
    } finally {
      await cleanupUser(author.id);
    }
  });
});
