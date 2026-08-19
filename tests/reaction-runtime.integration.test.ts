import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Backend Runtime Integrity Repair — reaction persistence + counter fix.
 * Real HTTP against real Postgres (furtail_app_test), same
 * fresh-store-as-restart-stand-in pattern as command03-final-integrity.
 * Covers the two reported crashes directly:
 *   1. PrismaClientValidationError: Unknown argument reactionType
 *      (stale generated Prisma Client vs. the reactionType column).
 *   2. TypeError: pair.endsWith is not a function in postLikeCount()
 *      (Set -> Map migration left one iteration site untouched).
 */
describe('reaction runtime integrity', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience: 'furtail-mobile',
      clientId: 'furtail-mobile',
      expiresAt: nowSeconds + 600,
      issuedAt: nowSeconds - 10,
      roles: ['member'],
      permissions: [],
      scopes: ['openid', 'profile'],
      claims: {},
    };
  }

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
    return createAppWithDependencies({ authVerifier: verifier, socialStore: store, prisma });
  }

  let counter = 0;
  async function createTestUser() {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    return prisma.user.create({
      data: { profile: { create: { username: `reaction_${suffix}`, displayName: `Reaction User ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function cleanupUsers(userIds: number[]) {
    const prisma = getTestPrisma();
    await prisma.postLike.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
  }

  async function createTextPost(app: ReturnType<typeof buildApp>, authorId: number, type: 'TEXT' | 'VIDEO' = 'TEXT') {
    const created = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer user-${authorId}`)
      .send({
        caption: `Reaction runtime test post (${type})`,
        type,
        category: 'GENERAL',
        privacy: 'PUBLIC',
        postType: 'GENERAL',
        mediaIds: [],
      });
    expect(created.status).toBe(201);
    return created.body.data.id as number;
  }

  it('reacting with LIKE succeeds without a PrismaClientValidationError', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const postId = await createTextPost(app, author.id);

      const reacted = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ reaction: 'LIKE' });

      expect(reacted.status).toBe(200);
      expect(reacted.body.data.isLikedByMe).toBe(true);
      expect(reacted.body.data.viewerReaction).toBe('LIKE');
      expect(reacted.body.data.likeCount).toBe(1);

      const row = await getTestPrisma().postLike.findUnique({
        where: { postId_userId: { postId, userId: author.id } },
      });
      expect(row?.reactionType).toBe('LIKE');
    } finally {
      await cleanupUsers([author.id]);
    }
  });

  it('switching reaction updates the same PostLike row instead of creating a second one', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const postId = await createTextPost(app, author.id);

      const first = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ reaction: 'LOVE' });
      expect(first.status).toBe(200);
      expect(first.body.data.viewerReaction).toBe('LOVE');
      const firstRowId = (
        await getTestPrisma().postLike.findUnique({ where: { postId_userId: { postId, userId: author.id } } })
      )?.id;

      const switched = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ reaction: 'WOW' });
      expect(switched.status).toBe(200);
      expect(switched.body.data.viewerReaction).toBe('WOW');
      // Still exactly one reaction from this user on this post — the
      // unique(postId, userId) constraint plus an upsert, not a second row.
      expect(switched.body.data.likeCount).toBe(1);
      expect(switched.body.data.totalReactionCount).toBe(1);

      const rows = await getTestPrisma().postLike.findMany({ where: { postId, userId: author.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(firstRowId);
      expect(rows[0]!.reactionType).toBe('WOW');
    } finally {
      await cleanupUsers([author.id]);
    }
  });

  it('removing a reaction deletes both the in-memory state and the persisted row', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const postId = await createTextPost(app, author.id);
      await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ reaction: 'HAHA' });

      const removed = await request(app)
        .delete(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(removed.status).toBe(200);
      expect(removed.body.data.isLikedByMe).toBe(false);
      expect(removed.body.data.likeCount).toBe(0);

      const row = await getTestPrisma().postLike.findUnique({
        where: { postId_userId: { postId, userId: author.id } },
      });
      expect(row).toBeNull();
    } finally {
      await cleanupUsers([author.id]);
    }
  });

  it('reactions survive a process restart (fresh store re-hydrated from Postgres)', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const postId = await createTextPost(app, author.id);
      await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ reaction: 'SAD' });

      // Fresh store = the in-process stand-in for "restart the API": a
      // brand-new in-memory Map, same underlying Postgres data.
      const app2 = buildApp(freshStore());
      const reread = await request(app2)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);

      expect(reread.status).toBe(200);
      expect(reread.body.data.viewerReaction).toBe('SAD');
      expect(reread.body.data.isLikedByMe).toBe(true);
      expect(reread.body.data.likeCount).toBe(1);
      expect(reread.body.data.reactionSummary).toMatchObject({ SAD: 1 });
    } finally {
      await cleanupUsers([author.id]);
    }
  });

  it('GET /api/v1/posts/videos?limit=10 returns 200 once a reaction exists (regression for the reported postLikeCount crash)', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const postId = await createTextPost(app, author.id, 'VIDEO');
      const reacted = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ reaction: 'LIKE' });
      expect(reacted.status).toBe(200);

      // sort=popular is the exact call path that crashed:
      // listVideosFeed -> postLikeCount -> `pair.endsWith is not a function`.
      const videos = await request(app)
        .get('/api/v1/posts/videos?limit=10&sort=popular')
        .set('Authorization', `Bearer user-${author.id}`);

      expect(videos.status).toBe(200);
      expect(Array.isArray(videos.body.data)).toBe(true);
    } finally {
      await cleanupUsers([author.id]);
    }
  });

  it('counts reactions per type correctly across three users with three different reactions, with no double-counting', async () => {
    const [userA, userB, userC] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    const app = buildApp();
    try {
      const postId = await createTextPost(app, userA.id);

      await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${userA.id}`)
        .send({ reaction: 'LIKE' });
      await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${userB.id}`)
        .send({ reaction: 'LOVE' });
      const afterC = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer user-${userC.id}`)
        .send({ reaction: 'WOW' });

      expect(afterC.status).toBe(200);
      expect(afterC.body.data.likeCount).toBe(3);
      expect(afterC.body.data.totalReactionCount).toBe(3);
      expect(afterC.body.data.reactionSummary).toMatchObject({ LIKE: 1, LOVE: 1, WOW: 1 });
      const sumOfSummary = Object.values(afterC.body.data.reactionSummary as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      expect(sumOfSummary).toBe(afterC.body.data.totalReactionCount);

      const viewA = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${userA.id}`);
      expect(viewA.body.data.viewerReaction).toBe('LIKE');

      const viewB = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${userB.id}`);
      expect(viewB.body.data.viewerReaction).toBe('LOVE');

      const viewC = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${userC.id}`);
      expect(viewC.body.data.viewerReaction).toBe('WOW');
    } finally {
      await cleanupUsers([userA.id, userB.id, userC.id]);
    }
  });
});
