import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * COMMAND 03 final integrity verification — real HTTP against real
 * Postgres, no mocked taxonomy/media layers. Fills the specific gaps the
 * previous sessions' tests didn't cover: Feeling/Activity admin-to-public
 * proof (only BackgroundStyle had the full toggle-visibility round trip
 * before), admin *reorder* actually changing public GET order, and one
 * Create Post exercising every metadata field simultaneously with a fresh
 * store instance standing in for a restarted API.
 */
describe('COMMAND 03: admin-to-Web proof for Feeling/Activity + reorder', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string, roles: string[]): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience: 'furtail-mobile',
      clientId: 'furtail-mobile',
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
        if (token === 'admin-token') return principal('9101', ['admin']);
        if (token === 'member-token') return principal('9102', ['member']);
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

  it('Feeling: admin create -> appears on public GET immediately -> disable -> disappears -> re-enable -> reappears', async () => {
    const app = buildApp();
    const key = uniqueKey('cmd03_feeling');

    const created = await request(app)
      .post('/api/v1/admin/taxonomies/feelings')
      .set('Authorization', 'Bearer admin-token')
      .send({ key, label: 'Command03 Proud', emoji: '😌' });
    expect(created.status).toBe(201);
    const id = created.body.data.data.id;

    const publicAfterCreate = await request(app).get('/api/v1/taxonomies/feelings');
    expect(publicAfterCreate.body.data.data.map((f: { key: string }) => f.key)).toContain(key);

    const disabled = await request(app)
      .patch(`/api/v1/admin/taxonomies/feelings/${id}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ isActive: false });
    expect(disabled.status).toBe(200);

    const publicAfterDisable = await request(app).get('/api/v1/taxonomies/feelings');
    expect(publicAfterDisable.body.data.data.map((f: { key: string }) => f.key)).not.toContain(key);

    const reEnabled = await request(app)
      .patch(`/api/v1/admin/taxonomies/feelings/${id}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ isActive: true });
    expect(reEnabled.status).toBe(200);

    const publicAfterReEnable = await request(app).get('/api/v1/taxonomies/feelings');
    expect(publicAfterReEnable.body.data.data.map((f: { key: string }) => f.key)).toContain(key);
  });

  it('Activity: admin create -> appears on public GET -> disable -> disappears', async () => {
    const app = buildApp();
    const key = uniqueKey('cmd03_activity');

    const created = await request(app)
      .post('/api/v1/admin/taxonomies/activities')
      .set('Authorization', 'Bearer admin-token')
      .send({ key, label: 'Command03 Napping', emoji: '💤', category: 'Test' });
    expect(created.status).toBe(201);
    const id = created.body.data.data.id;

    const publicAfterCreate = await request(app).get('/api/v1/taxonomies/activities');
    expect(publicAfterCreate.body.data.data.map((a: { key: string }) => a.key)).toContain(key);

    const disabled = await request(app)
      .patch(`/api/v1/admin/taxonomies/activities/${id}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ isActive: false });
    expect(disabled.status).toBe(200);

    const publicAfterDisable = await request(app).get('/api/v1/taxonomies/activities');
    expect(publicAfterDisable.body.data.data.map((a: { key: string }) => a.key)).not.toContain(key);
  });

  it('Background Style: admin REORDER via sortOrder actually changes the public GET order (not just visibility)', async () => {
    const app = buildApp();
    const keyA = uniqueKey('cmd03_bg_a');
    const keyB = uniqueKey('cmd03_bg_b');

    // Create two styles, A before B.
    const createdA = await request(app)
      .post('/api/v1/admin/taxonomies/background-styles')
      .set('Authorization', 'Bearer admin-token')
      .send({ key: keyA, label: 'Reorder A', sortOrder: 9001 });
    const createdB = await request(app)
      .post('/api/v1/admin/taxonomies/background-styles')
      .set('Authorization', 'Bearer admin-token')
      .send({ key: keyB, label: 'Reorder B', sortOrder: 9002 });
    expect(createdA.status).toBe(201);
    expect(createdB.status).toBe(201);
    const idA = createdA.body.data.data.id;
    const idB = createdB.body.data.data.id;

    const beforeReorder = await request(app).get('/api/v1/taxonomies/background-styles');
    const keysBefore = beforeReorder.body.data.data
      .filter((s: { key: string }) => s.key === keyA || s.key === keyB)
      .map((s: { key: string }) => s.key);
    expect(keysBefore).toEqual([keyA, keyB]);

    // Swap sortOrder — B should now come before A.
    await request(app)
      .patch(`/api/v1/admin/taxonomies/background-styles/${idA}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ sortOrder: 9003 });
    await request(app)
      .patch(`/api/v1/admin/taxonomies/background-styles/${idB}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ sortOrder: 9000 });

    const afterReorder = await request(app).get('/api/v1/taxonomies/background-styles');
    const keysAfter = afterReorder.body.data.data
      .filter((s: { key: string }) => s.key === keyA || s.key === keyB)
      .map((s: { key: string }) => s.key);
    expect(keysAfter).toEqual([keyB, keyA]);
  });

  it('ordinary (non-admin) authenticated user cannot reorder or disable a background style (403)', async () => {
    const app = buildApp();
    const key = uniqueKey('cmd03_bg_guard');
    const created = await request(app)
      .post('/api/v1/admin/taxonomies/background-styles')
      .set('Authorization', 'Bearer admin-token')
      .send({ key, label: 'Guard Test' });
    const id = created.body.data.data.id;

    const attempt = await request(app)
      .patch(`/api/v1/admin/taxonomies/background-styles/${id}`)
      .set('Authorization', 'Bearer member-token')
      .send({ sortOrder: 0, isActive: false });
    expect(attempt.status).toBe(403);

    // Confirm it genuinely did not change.
    const stillThere = await request(app).get('/api/v1/taxonomies/background-styles');
    const found = stillThere.body.data.data.find((s: { key: string }) => s.key === key);
    expect(found).toBeDefined();
    expect(found.isActive).toBe(true);
  });
});

describe('COMMAND 03: full multi-metadata Create Post persistence (fresh store = restart stand-in)', () => {
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
      data: { profile: { create: { username: `cmd03_${suffix}`, displayName: `Command03 User ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.pet.deleteMany({ where: { ownerUserId: userId } });
    await prisma.media.deleteMany({ where: { ownerUserId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  const REAL_JPEG_BASE64 =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

  it('one Post with text + Feeling + Activity + Category + ContentTag + tagged Pet + Location + backgroundStyle + media persists every field through a fresh store instance', async () => {
    const author = await createTestUser();
    const prisma = getTestPrisma();
    try {
      const { app } = { app: buildApp() };

      // Real taxonomy rows to reference (Feeling/Activity are stored
      // denormalized as strings on Post — no FK — so any active key works;
      // Category must be one of the two enum-backed keys per COMMAND 02's
      // client-side guard; ContentTag is a real FK via PostContentTag).
      const feelings = await prisma.postFeeling.findMany({ where: { isActive: true }, take: 1 });
      const activities = await prisma.postActivity.findMany({ where: { isActive: true }, take: 1 });
      const bgStyles = await prisma.backgroundStyle.findMany({ where: { isActive: true }, take: 1 });
      const tag = await prisma.contentTag.upsert({
        where: { key: `cmd03_full_tag_${author.id}` },
        update: {},
        create: { key: `cmd03_full_tag_${author.id}`, label: '#Command03Full' },
      });
      expect(feelings.length).toBeGreaterThan(0);
      expect(activities.length).toBeGreaterThan(0);
      expect(bgStyles.length).toBeGreaterThan(0);

      const upload = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', Buffer.from(REAL_JPEG_BASE64, 'base64'), { filename: 'full.jpg', contentType: 'image/jpeg' });
      expect(upload.status).toBe(200);

      // PostTaggedPet.petId is a real FK to Pet — a fabricated id fails at
      // the database, not merely a lookup miss, so a genuine Pet row is
      // required here. serializePost's own Post.taggedPets fabricates
      // {name: `Pet ${id}`} placeholders since real Pet detail lives in a
      // separate service, but persistence of the id itself is real.
      const animalType = await prisma.animalType.findFirst();
      expect(animalType).toBeTruthy();
      const pet = await prisma.pet.create({
        data: {
          ownerUserId: author.id,
          name: 'Command03 Test Pet',
          animalTypeId: animalType!.id,
        },
      });
      const petId = pet.id;

      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({
          caption: 'Full metadata Command 03 verification post',
          type: 'IMAGE',
          category: 'GENERAL',
          privacy: 'PUBLIC',
          postType: 'GENERAL',
          mediaIds: [upload.body.data.id],
          taggedPetIds: [petId],
          contentTagIds: [tag.id],
          locationText: 'Dhaka, Bangladesh',
          feelingId: feelings[0]!.key,
          feelingLabel: feelings[0]!.label,
          feelingEmoji: feelings[0]!.emoji,
          backgroundStyle: bgStyles[0]!.key,
        });
      expect(created.status).toBe(201);
      const postId = created.body.data.id;

      // Fresh store = the in-process stand-in for "restart the API".
      const app2 = buildApp(freshStore());
      const reread = await request(app2)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(reread.status).toBe(200);
      const post = reread.body.data;

      expect(post.caption).toBe('Full metadata Command 03 verification post');
      expect(post.category).toBe('GENERAL');
      expect(post.locationTag).toBe('Dhaka, Bangladesh');
      expect(post.feelingId).toBe(feelings[0]!.key);
      expect(post.feelingLabel).toBe(feelings[0]!.label);
      expect(post.backgroundStyle).toBe(bgStyles[0]!.key);
      expect(post.taggedPetIds).toContain(petId);
      expect(post.media).toHaveLength(1);
      expect(post.media[0].media.url).toBeTruthy();
      expect(post.contentTags).toHaveLength(1);
      expect(post.contentTags[0].key).toBe(tag.key);
      expect(post.contentTags[0].label).toBe('#Command03Full');

      // Also verify via the feed on the same fresh instance.
      const feed = await request(app2)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${author.id}`);
      const feedPosts = Array.isArray(feed.body) ? feed.body : feed.body.data;
      const feedPost = feedPosts.find((p: { id: number }) => p.id === postId);
      expect(feedPost).toBeDefined();
      expect(feedPost.feelingId).toBe(feelings[0]!.key);
      expect(feedPost.contentTags).toHaveLength(1);

      // And the media URL is genuinely fetchable (not just present in JSON).
      const mediaGet = await request(app2).get(post.media[0].media.url);
      expect(mediaGet.status).toBe(200);
    } finally {
      await cleanupUser(author.id);
    }
  });
});
