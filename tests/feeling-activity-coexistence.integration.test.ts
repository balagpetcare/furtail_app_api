import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * SELECTOR UX UNIFICATION §7/§21 — proves the backend has no mutual
 * exclusion between Post.feelingId and Post.activityId (verified by
 * reading social-store.ts/social.routes.ts/schema.prisma directly: both
 * are independent nullable fields with no validation rejecting both being
 * set), and that both persist and survive a restart together. Same
 * fresh-store-as-restart-stand-in pattern as command03-final-integrity and
 * reaction-runtime.
 */
describe('Feeling + Activity coexistence (backend)', () => {
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
      data: { profile: { create: { username: `feelact_${suffix}`, displayName: `FeelAct User ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  it('a Post created with both Feeling and Activity persists both, and both survive GET, feed, and a simulated API restart', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({
          caption: 'Feeling + Activity coexistence proof',
          type: 'TEXT',
          category: 'GENERAL',
          privacy: 'PUBLIC',
          postType: 'GENERAL',
          feelingId: 'happy',
          feelingLabel: 'Happy',
          feelingEmoji: '😊',
          activityId: 'playing',
          activityLabel: 'Playing',
          activityEmoji: '🎮',
        });

      // 1. The create-Post response itself contains both.
      expect(created.status).toBe(201);
      expect(created.body.data.feelingId).toBe('happy');
      expect(created.body.data.feelingLabel).toBe('Happy');
      expect(created.body.data.feelingEmoji).toBe('😊');
      expect(created.body.data.activityId).toBe('playing');
      expect(created.body.data.activityLabel).toBe('Playing');
      expect(created.body.data.activityEmoji).toBe('🎮');
      const postId = created.body.data.id as number;

      // 2. The database row itself has both sets of values.
      const row = await getTestPrisma().post.findUnique({ where: { id: postId } });
      expect(row?.feelingId).toBe('happy');
      expect(row?.feelingLabel).toBe('Happy');
      expect(row?.feelingEmoji).toBe('😊');
      expect(row?.activityId).toBe('playing');
      expect(row?.activityLabel).toBe('Playing');
      expect(row?.activityEmoji).toBe('🎮');

      // 3. Fresh store = the in-process stand-in for "restart the API": a
      // brand-new in-memory cache, same underlying Postgres data. GET must
      // still return both.
      const app2 = buildApp(freshStore());
      const reread = await request(app2)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(reread.status).toBe(200);
      expect(reread.body.data.feelingId).toBe('happy');
      expect(reread.body.data.feelingLabel).toBe('Happy');
      expect(reread.body.data.activityId).toBe('playing');
      expect(reread.body.data.activityLabel).toBe('Playing');

      // 4. The feed, on that same post-restart instance, also returns both.
      const feed = await request(app2)
        .get('/api/v1/posts/feed?limit=50')
        .set('Authorization', `Bearer user-${author.id}`);
      expect(feed.status).toBe(200);
      const feedItems = Array.isArray(feed.body.data) ? feed.body.data : feed.body.data.items;
      const feedPost = feedItems.find((p: { id: number }) => p.id === postId);
      expect(feedPost).toBeTruthy();
      expect(feedPost.feelingId).toBe('happy');
      expect(feedPost.feelingLabel).toBe('Happy');
      expect(feedPost.activityId).toBe('playing');
      expect(feedPost.activityLabel).toBe('Playing');
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('changing only Activity via PATCH leaves an existing Feeling on the Post untouched, and vice versa', async () => {
    const author = await createTestUser();
    const app = buildApp();
    try {
      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({
          caption: 'Patch independence proof',
          type: 'TEXT',
          category: 'GENERAL',
          privacy: 'PUBLIC',
          postType: 'GENERAL',
          feelingId: 'happy',
          feelingLabel: 'Happy',
          activityId: 'playing',
          activityLabel: 'Playing',
        });
      expect(created.status).toBe(201);
      const postId = created.body.data.id as number;

      const patchedActivity = await request(app)
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ activityId: 'walking', activityLabel: 'Walking' });
      expect(patchedActivity.status).toBe(200);
      expect(patchedActivity.body.data.activityId).toBe('walking');
      expect(patchedActivity.body.data.feelingId).toBe('happy');
      expect(patchedActivity.body.data.feelingLabel).toBe('Happy');

      const patchedFeeling = await request(app)
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ feelingId: 'excited', feelingLabel: 'Excited' });
      expect(patchedFeeling.status).toBe(200);
      expect(patchedFeeling.body.data.feelingId).toBe('excited');
      expect(patchedFeeling.body.data.activityId).toBe('walking');
      expect(patchedFeeling.body.data.activityLabel).toBe('Walking');
    } finally {
      await cleanupUser(author.id);
    }
  });
});
