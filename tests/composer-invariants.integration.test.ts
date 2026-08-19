import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import {
  DEFAULT_MAX_CAPTION_CHARACTERS,
  DEFAULT_MAX_BACKGROUND_CAPTION_CHARACTERS,
} from '../src/modules/social/taxonomy-service';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * SELECTOR ICONS + TEXT SCROLL + TEXT LIMIT + BACKGROUND/MEDIA EXCLUSIVITY
 * §20/§21/§23/§31/§32 — backend-authoritative invariants: overall caption
 * length cap, and media/background mutual exclusivity, on both Create and
 * Update. Real HTTP + Postgres, same fresh-store-as-restart-stand-in
 * pattern as the other integration suites in this repo.
 */
describe('Composer invariants (caption length + media/background exclusivity)', () => {
  afterAll(async () => {
    // Restore the config row to its shipped defaults so this suite doesn't
    // leave global state behind for any other test file that runs after it.
    await getTestPrisma().postComposerConfig.upsert({
      where: { id: 1 },
      update: {
        maxCaptionCharacters: DEFAULT_MAX_CAPTION_CHARACTERS,
        maxBackgroundCaptionCharacters: DEFAULT_MAX_BACKGROUND_CAPTION_CHARACTERS,
      },
      create: {
        id: 1,
        maxCaptionCharacters: DEFAULT_MAX_CAPTION_CHARACTERS,
        maxBackgroundCaptionCharacters: DEFAULT_MAX_BACKGROUND_CAPTION_CHARACTERS,
      },
    });
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string, roles: string[] = ['member']): AuthenticatedPrincipal {
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

  function buildApp(store: SocialCoreStore = freshStore()) {
    const prisma = getTestPrisma();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token: string) {
        const memberMatch = /^user-(\d+)$/.exec(token);
        if (memberMatch) return principal(memberMatch[1]!);
        if (token === 'admin-token') return principal('999001', ['admin']);
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
      data: { profile: { create: { username: `composer_${suffix}`, displayName: `Composer User ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  async function uploadOneImage(app: ReturnType<typeof buildApp>, authorId: number): Promise<number> {
    const upload = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', `Bearer user-${authorId}`)
      .attach('file', Buffer.from('fake-image-bytes'), 'photo.jpg');
    expect(upload.status).toBe(200);
    return upload.body.data.id as number;
  }

  describe('overall caption length (§23, §29)', () => {
    it('accepts a caption below the maximum', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x'.repeat(100), type: 'TEXT', privacy: 'PUBLIC' });
        expect(res.status).toBe(201);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('accepts a caption exactly at the maximum', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x'.repeat(DEFAULT_MAX_CAPTION_CHARACTERS), type: 'TEXT', privacy: 'PUBLIC' });
        expect(res.status).toBe(201);
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('rejects a caption one character over the maximum with a stable error code', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x'.repeat(DEFAULT_MAX_CAPTION_CHARACTERS + 1), type: 'TEXT', privacy: 'PUBLIC' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('POST_CAPTION_TOO_LONG');
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('rejects an over-limit caption on Update the same as Create', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const created = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'short', type: 'TEXT', privacy: 'PUBLIC' });
        expect(created.status).toBe(201);

        const patched = await request(app)
          .patch(`/api/v1/posts/${created.body.data.id}`)
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x'.repeat(DEFAULT_MAX_CAPTION_CHARACTERS + 1) });
        expect(patched.status).toBe(400);
        expect(patched.body.error.code).toBe('POST_CAPTION_TOO_LONG');
      } finally {
        await cleanupUser(author.id);
      }
    });
  });

  describe('media + background mutual exclusivity (§17, §20, §21, §31)', () => {
    it('rejects Create with both media and a background style', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const mediaId = await uploadOneImage(app, author.id);
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({
            caption: 'media + background',
            type: 'IMAGE',
            privacy: 'PUBLIC',
            mediaIds: [mediaId],
            backgroundStyle: 'gradient_1',
          });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('POST_BACKGROUND_WITH_MEDIA_NOT_ALLOWED');
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('allows Create with a background and no media', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'just background', type: 'TEXT', privacy: 'PUBLIC', backgroundStyle: 'gradient_1' });
        expect(res.status).toBe(201);
        expect(res.body.data.backgroundStyle).toBe('gradient_1');
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('allows Create with media and no background (null background never conflicts with media, §22)', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const mediaId = await uploadOneImage(app, author.id);
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'just media', type: 'IMAGE', privacy: 'PUBLIC', mediaIds: [mediaId] });
        expect(res.status).toBe(201);
        expect(res.body.data.backgroundStyle).toBeFalsy();
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('rejects Update: a text-background post that then has media attached', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const created = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'background first', type: 'TEXT', privacy: 'PUBLIC', backgroundStyle: 'gradient_1' });
        expect(created.status).toBe(201);

        const mediaId = await uploadOneImage(app, author.id);
        const patched = await request(app)
          .patch(`/api/v1/posts/${created.body.data.id}`)
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ mediaIds: [mediaId] });
        expect(patched.status).toBe(400);
        expect(patched.body.error.code).toBe('POST_BACKGROUND_WITH_MEDIA_NOT_ALLOWED');
      } finally {
        await cleanupUser(author.id);
      }
    });

    it('rejects Update: a media post that then has a background style applied', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const mediaId = await uploadOneImage(app, author.id);
        const created = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'media first', type: 'IMAGE', privacy: 'PUBLIC', mediaIds: [mediaId] });
        expect(created.status).toBe(201);

        const patched = await request(app)
          .patch(`/api/v1/posts/${created.body.data.id}`)
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ backgroundStyle: 'gradient_1' });
        expect(patched.status).toBe(400);
        expect(patched.body.error.code).toBe('POST_BACKGROUND_WITH_MEDIA_NOT_ALLOWED');
      } finally {
        await cleanupUser(author.id);
      }
    });
  });

  describe('admin-configurable limits (§32)', () => {
    it('GET post-composer-config returns the shipped defaults', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/taxonomies/post-composer-config');
      expect(res.status).toBe(200);
      // sendSuccess(res, { data }, ...) wraps once, and this route's own
      // payload is itself { data: ... } — matching the existing
      // /taxonomies/* GET convention (see e.g. /taxonomies/feelings).
      expect(res.body.data.data.maxCaptionCharacters).toBe(DEFAULT_MAX_CAPTION_CHARACTERS);
      expect(res.body.data.data.maxBackgroundCaptionCharacters).toBe(DEFAULT_MAX_BACKGROUND_CAPTION_CHARACTERS);
    });

    it('an admin PATCH changes the value GET returns, and Create enforcement uses the NEW value — not the hardcoded default', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const patched = await request(app)
          .patch('/api/v1/admin/taxonomies/post-composer-config')
          .set('Authorization', 'Bearer admin-token')
          .send({ maxCaptionCharacters: 50, maxBackgroundCaptionCharacters: 20 });
        expect(patched.status).toBe(200);
        expect(patched.body.data.data.maxCaptionCharacters).toBe(50);
        expect(patched.body.data.data.maxBackgroundCaptionCharacters).toBe(20);

        const reread = await request(app).get('/api/v1/taxonomies/post-composer-config');
        expect(reread.body.data.data.maxCaptionCharacters).toBe(50);
        expect(reread.body.data.data.maxBackgroundCaptionCharacters).toBe(20);

        // A caption that easily fit the shipped default (5000) now exceeds
        // the admin-lowered limit (50) and must be rejected.
        const overNewLimit = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x'.repeat(51), type: 'TEXT', privacy: 'PUBLIC' });
        expect(overNewLimit.status).toBe(400);
        expect(overNewLimit.body.error.code).toBe('POST_CAPTION_TOO_LONG');

        const underNewLimit = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ caption: 'x'.repeat(50), type: 'TEXT', privacy: 'PUBLIC' });
        expect(underNewLimit.status).toBe(201);
      } finally {
        await cleanupUser(author.id);
        // Restore defaults immediately so subsequent tests in this file
        // (and any test running concurrently against the same DB) aren't
        // affected by the lowered limit.
        await getTestPrisma().postComposerConfig.update({
          where: { id: 1 },
          data: {
            maxCaptionCharacters: DEFAULT_MAX_CAPTION_CHARACTERS,
            maxBackgroundCaptionCharacters: DEFAULT_MAX_BACKGROUND_CAPTION_CHARACTERS,
          },
        });
      }
    });

    it('a non-admin cannot PATCH the composer config', async () => {
      const author = await createTestUser();
      const app = buildApp();
      try {
        const res = await request(app)
          .patch('/api/v1/admin/taxonomies/post-composer-config')
          .set('Authorization', `Bearer user-${author.id}`)
          .send({ maxCaptionCharacters: 1 });
        expect(res.status).toBe(403);
      } finally {
        await cleanupUser(author.id);
      }
    });
  });
});
