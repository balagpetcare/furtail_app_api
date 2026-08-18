import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Proves the admin taxonomy management routes actually enforce admin
 * authorization server-side (not merely hidden in the Web UI), and that the
 * full CRUD contract works end to end through real HTTP requests against
 * the real Postgres-backed TaxonomyService.
 */
describe('admin taxonomy routes — authorization + CRUD (real HTTP + real Prisma)', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const audience = 'furtail-mobile';
  const clientId = 'furtail-mobile';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string, roles: string[]): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience,
      clientId,
      expiresAt: nowSeconds + 600,
      issuedAt: nowSeconds - 10,
      roles,
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

  function buildApp() {
    const prisma = getTestPrisma();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token: string) {
        if (token === 'admin-token') return principal('9001', ['admin']);
        if (token === 'member-token') return principal('9002', ['member']);
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
    return createAppWithDependencies({ authVerifier: verifier, socialStore: freshStore(), prisma });
  }

  let counter = 0;
  function uniqueKey(prefix: string): string {
    counter += 1;
    return `${prefix}_${Date.now()}_${counter}`;
  }

  describe('authorization boundary', () => {
    it('rejects an ordinary authenticated (non-admin) user with 403 on every taxonomy mutation route', async () => {
      const app = buildApp();

      const postRes = await request(app)
        .post('/api/v1/admin/taxonomies/background-styles')
        .set('Authorization', 'Bearer member-token')
        .send({ key: uniqueKey('bg'), label: 'Should Not Work' });
      expect(postRes.status).toBe(403);

      const patchRes = await request(app)
        .patch('/api/v1/admin/taxonomies/background-styles/1')
        .set('Authorization', 'Bearer member-token')
        .send({ label: 'Should Not Work' });
      expect(patchRes.status).toBe(403);

      const deleteRes = await request(app)
        .delete('/api/v1/admin/taxonomies/background-styles/1')
        .set('Authorization', 'Bearer member-token');
      expect(deleteRes.status).toBe(403);

      const listRes = await request(app)
        .get('/api/v1/admin/taxonomies/background-styles')
        .set('Authorization', 'Bearer member-token');
      expect(listRes.status).toBe(403);
    });

    it('rejects an unauthenticated request with 401, not 403', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/admin/taxonomies/background-styles')
        .send({ key: uniqueKey('bg'), label: 'No Auth' });
      expect(res.status).toBe(401);
    });

    it('allows a genuinely admin-roled user through', async () => {
      const app = buildApp();
      const key = uniqueKey('bg_admin_ok');
      const res = await request(app)
        .post('/api/v1/admin/taxonomies/background-styles')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: 'Admin Created' });
      expect(res.status).toBe(201);
      expect(res.body.data.data.key).toBe(key);
    });
  });

  describe('Background Style admin CRUD via real HTTP', () => {
    it('create -> immediately visible on public GET -> disable -> no longer visible -> re-enable -> visible again', async () => {
      const app = buildApp();
      const key = uniqueKey('bg_e2e');

      const created = await request(app)
        .post('/api/v1/admin/taxonomies/background-styles')
        .set('Authorization', 'Bearer admin-token')
        .send({
          key,
          label: 'E2E Test Style',
          styleType: 'gradient',
          colorValue: '#111111',
          colorValueEnd: '#222222',
          textColor: '#FFFFFF',
        });
      expect(created.status).toBe(201);
      const id = created.body.data.data.id;

      // Public, unauthenticated-capable read endpoint sees it immediately.
      const publicList1 = await request(app).get('/api/v1/taxonomies/background-styles');
      expect(publicList1.status).toBe(200);
      expect(publicList1.body.data.data.map((s: { key: string }) => s.key)).toContain(key);
      const found = publicList1.body.data.data.find((s: { key: string }) => s.key === key);
      expect(found.colorValueEnd).toBe('#222222');
      expect(found.textColor).toBe('#FFFFFF');

      const disabled = await request(app)
        .patch(`/api/v1/admin/taxonomies/background-styles/${id}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ isActive: false });
      expect(disabled.status).toBe(200);
      expect(disabled.body.data.data.isActive).toBe(false);

      const publicList2 = await request(app).get('/api/v1/taxonomies/background-styles');
      expect(publicList2.body.data.data.map((s: { key: string }) => s.key)).not.toContain(key);

      const reEnabled = await request(app)
        .patch(`/api/v1/admin/taxonomies/background-styles/${id}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ isActive: true });
      expect(reEnabled.body.data.data.isActive).toBe(true);

      const publicList3 = await request(app).get('/api/v1/taxonomies/background-styles');
      expect(publicList3.body.data.data.map((s: { key: string }) => s.key)).toContain(key);

      const deleted = await request(app)
        .delete(`/api/v1/admin/taxonomies/background-styles/${id}`)
        .set('Authorization', 'Bearer admin-token');
      expect(deleted.status).toBe(200);

      const publicList4 = await request(app).get('/api/v1/taxonomies/background-styles');
      expect(publicList4.body.data.data.map((s: { key: string }) => s.key)).not.toContain(key);
    });

    it('rejects a duplicate key with 409, not a raw 500', async () => {
      const app = buildApp();
      const key = uniqueKey('bg_dup_http');
      const first = await request(app)
        .post('/api/v1/admin/taxonomies/background-styles')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: 'First' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/admin/taxonomies/background-styles')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: 'Second' });
      expect(second.status).toBe(409);
    });
  });

  describe('Feeling / Activity / Category / Tag admin CRUD via real HTTP', () => {
    it('Feeling: create, list-all includes it, public list excludes disabled', async () => {
      const app = buildApp();
      const key = uniqueKey('feeling_http');
      const created = await request(app)
        .post('/api/v1/admin/taxonomies/feelings')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: 'HTTP Test', emoji: '🙂' });
      expect(created.status).toBe(201);

      const adminList = await request(app)
        .get('/api/v1/admin/taxonomies/feelings')
        .set('Authorization', 'Bearer admin-token');
      expect(adminList.body.data.data.map((f: { key: string }) => f.key)).toContain(key);
    });

    it('Activity: create with category, update category', async () => {
      const app = buildApp();
      const key = uniqueKey('activity_http');
      const created = await request(app)
        .post('/api/v1/admin/taxonomies/activities')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: 'HTTP Activity', emoji: '🎯', category: 'Test' });
      expect(created.status).toBe(201);
      expect(created.body.data.data.category).toBe('Test');

      const updated = await request(app)
        .patch(`/api/v1/admin/taxonomies/activities/${created.body.data.data.id}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ category: 'Renamed' });
      expect(updated.body.data.data.category).toBe('Renamed');
    });

    it('Category: create, visible on public endpoint', async () => {
      const app = buildApp();
      const key = uniqueKey('category_http');
      const created = await request(app)
        .post('/api/v1/admin/taxonomies/categories')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: 'HTTP Category' });
      expect(created.status).toBe(201);

      const publicList = await request(app).get('/api/v1/taxonomies/categories');
      expect(publicList.body.data.data.map((c: { key: string }) => c.key)).toContain(key);
    });

    it('ContentTag: create, visible on public endpoint, delete removes it', async () => {
      const app = buildApp();
      const key = uniqueKey('tag_http');
      const created = await request(app)
        .post('/api/v1/admin/taxonomies/tags')
        .set('Authorization', 'Bearer admin-token')
        .send({ key, label: '#HttpTag' });
      expect(created.status).toBe(201);

      const publicList = await request(app).get('/api/v1/taxonomies/tags');
      expect(publicList.body.data.data.map((t: { key: string }) => t.key)).toContain(key);

      const deleted = await request(app)
        .delete(`/api/v1/admin/taxonomies/tags/${created.body.data.data.id}`)
        .set('Authorization', 'Bearer admin-token');
      expect(deleted.status).toBe(200);

      const publicListAfter = await request(app).get('/api/v1/taxonomies/tags');
      expect(publicListAfter.body.data.data.map((t: { key: string }) => t.key)).not.toContain(key);
    });
  });
});

/**
 * Post <-> ContentTag persistence: selecting tags on Create Post must
 * actually persist (real join table), survive a fresh store instance (the
 * in-process stand-in for an API restart), and appear correctly in the
 * feed/single-post response shape.
 */
describe('Post <-> ContentTag persistence (real join relation)', () => {
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
      data: { profile: { create: { username: `tagpost_${suffix}`, displayName: `Tag Post ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  it('selected content tags persist through create -> PostContentTag rows -> fresh store reread -> feed', async () => {
    const author = await createTestUser();
    const prisma = getTestPrisma();
    try {
      const tag1 = await prisma.contentTag.upsert({
        where: { key: `persist_tag_1_${author.id}` },
        update: {},
        create: { key: `persist_tag_1_${author.id}`, label: '#PersistOne' },
      });
      const tag2 = await prisma.contentTag.upsert({
        where: { key: `persist_tag_2_${author.id}` },
        update: {},
        create: { key: `persist_tag_2_${author.id}`, label: '#PersistTwo' },
      });

      const { app } = { app: buildApp() };
      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({
          caption: 'tagged post',
          type: 'TEXT',
          privacy: 'PUBLIC',
          contentTagIds: [tag1.id, tag2.id],
        });
      expect(created.status).toBe(201);
      const postId = created.body.data.id;

      expect(created.body.data.contentTags).toHaveLength(2);
      expect(created.body.data.contentTags.map((t: { id: number }) => t.id).sort()).toEqual(
        [tag1.id, tag2.id].sort(),
      );

      // Real DB proof, independent of any in-memory cache.
      const rows = await prisma.postContentTag.findMany({ where: { postId } });
      expect(rows.map((r) => r.tagId).sort()).toEqual([tag1.id, tag2.id].sort());

      // Fresh store — restart stand-in.
      const app2 = buildApp(freshStore());
      const reread = await request(app2)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(reread.status).toBe(200);
      expect(reread.body.data.contentTags.map((t: { key: string }) => t.key).sort()).toEqual(
        [tag1.key, tag2.key].sort(),
      );
      expect(reread.body.data.contentTags.find((t: { id: number }) => t.id === tag1.id).label).toBe(
        '#PersistOne',
      );

      const feed = await request(app2)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${author.id}`);
      const feedPosts = Array.isArray(feed.body) ? feed.body : feed.body.data;
      const feedPost = feedPosts.find((p: { id: number }) => p.id === postId);
      expect(feedPost.contentTags).toHaveLength(2);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('rejects a non-existent content tag id', async () => {
    const author = await createTestUser();
    try {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'bad tag', type: 'TEXT', contentTagIds: [999_999_999] });
      expect(res.status).toBe(400);
    } finally {
      await cleanupUser(author.id);
    }
  });
});
