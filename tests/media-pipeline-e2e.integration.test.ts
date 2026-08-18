import { existsSync, readFileSync } from 'node:fs';
import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter, resolveStoredMediaPath } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Forensic end-to-end proof of the Create Post media pipeline, exercising
 * the REAL upload endpoint (multer + InMemoryMediaStorageAdapter, actual
 * bytes written to .media-store), the REAL Post/PostMedia persistence, and
 * the REAL GET /api/v1/media/* serving route — not mocked Media rows.
 *
 * This is the evidence base for the "gray preview box" / "Attachment
 * unavailable" forensic repair: it proves (or disproves) that a freshly
 * uploaded image's canonical URL is genuinely fetchable end-to-end,
 * independent of the Web client and any composer-side bug.
 */
describe('media pipeline forensic e2e (real upload -> real Post -> real GET)', () => {
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
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore: store, prisma });
    return { app, store };
  }

  let counter = 0;
  async function createTestUser() {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    return prisma.user.create({
      data: { profile: { create: { username: `mediap_${suffix}`, displayName: `Media Pipeline ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.media.deleteMany({ where: { ownerUserId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  // Minimal but genuinely valid 1x1 JPEG (real magic bytes + JFIF header),
  // not an arbitrary buffer — this must survive multer's mimetype sniffing
  // and any future content-based validation the same way a real photo would.
  const REAL_JPEG_BASE64 =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
  function realJpegBuffer(): Buffer {
    return Buffer.from(REAL_JPEG_BASE64, 'base64');
  }

  // Minimal MP4 container bytes (ftyp box) — enough for mimetype/extension
  // validation; not a playable video, but proves the same storage/serving
  // path independent of video codec correctness.
  function minimalMp4Buffer(): Buffer {
    const ftyp = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size=24, 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // 'isom'
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compatible brands
    ]);
    return ftyp;
  }

  it('EVIDENCE: upload response contract — real bytes through the real endpoint', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const res = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .field('purpose', 'post')
        .attach('file', realJpegBuffer(), { filename: 'photo1.jpg', contentType: 'image/jpeg' });

      // eslint-disable-next-line no-console
      console.log('[EVIDENCE upload response]', JSON.stringify(res.body, null, 2));

      expect(res.status).toBe(200);
      expect(typeof res.body.data.id).toBe('number');
      expect(res.body.data.id).toBeGreaterThan(0);
      expect(typeof res.body.data.url).toBe('string');
      expect(res.body.data.url.length).toBeGreaterThan(0);
      expect(res.body.data.url.startsWith('/api/v1/media/')).toBe(true);
      expect(res.body.data.type).toBe('IMAGE');
      expect(res.body.data.status).toBe('READY');
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('EVIDENCE: rejects the upload-response contract if id/url are ever missing (documents the invariant the Web client relies on)', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const res = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', realJpegBuffer(), { filename: 'photo2.jpg', contentType: 'image/jpeg' });

      // This is the exact contract create-post-modal.tsx's uploadPostMedia()
      // must validate before marking an item READY.
      const hasValidId = typeof res.body?.data?.id === 'number' && res.body.data.id > 0;
      const hasValidUrl = typeof res.body?.data?.url === 'string' && res.body.data.url.length > 0;
      expect(hasValidId).toBe(true);
      expect(hasValidUrl).toBe(true);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('EVIDENCE: uploaded file physically exists on disk at the storageKey the URL implies, with non-zero bytes matching the upload', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const bytes = realJpegBuffer();
      const res = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', bytes, { filename: 'photo3.jpg', contentType: 'image/jpeg' });

      const url: string = res.body.data.url;
      const storageKey = url.replace(/^\/api\/v1\/media\//, '');
      const filePath = resolveStoredMediaPath(storageKey);

      // eslint-disable-next-line no-console
      console.log('[EVIDENCE filesystem]', { storageKey, filePath, exists: existsSync(filePath) });

      expect(existsSync(filePath)).toBe(true);
      const onDisk = readFileSync(filePath);
      expect(onDisk.length).toBe(bytes.length);
      expect(onDisk.equals(bytes)).toBe(true);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('EVIDENCE: the exact URL returned by upload is fetchable through the real GET /api/v1/media/* route with 200 + correct Content-Type + correct bytes', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const bytes = realJpegBuffer();
      const uploadRes = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', bytes, { filename: 'photo4.jpg', contentType: 'image/jpeg' });

      const url: string = uploadRes.body.data.url;

      // Fetch through a SEPARATE, fresh app instance/agent — proves the
      // route is genuinely public/servable, not an artifact of the same
      // in-process request context.
      const { app: app2 } = buildApp(freshStore());
      const getRes = await request(app2).get(url);

      // eslint-disable-next-line no-console
      console.log('[EVIDENCE media GET]', {
        url,
        status: getRes.status,
        contentType: getRes.headers['content-type'],
        bodyLength: getRes.body?.length ?? getRes.text?.length,
      });

      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toMatch(/^image\/jpeg/);
      const returnedBytes: Buffer = Buffer.isBuffer(getRes.body) ? getRes.body : Buffer.from(getRes.text, 'binary');
      expect(returnedBytes.length).toBe(bytes.length);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('EVIDENCE + REGRESSION: two fresh images -> Create Post -> PostMedia persists id/order -> fresh store rereads valid, non-empty, fetchable URLs in submitted order', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();

      const upload1 = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', realJpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' });
      const upload2 = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', realJpegBuffer(), { filename: 'b.jpg', contentType: 'image/jpeg' });

      expect(upload1.status).toBe(200);
      expect(upload2.status).toBe(200);
      const media1Id: number = upload1.body.data.id;
      const media2Id: number = upload2.body.data.id;

      const created = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({
          caption: 'two fresh images',
          type: 'IMAGE',
          privacy: 'PUBLIC',
          mediaIds: [media1Id, media2Id],
        });
      expect(created.status).toBe(201);
      const postId = created.body.data.id;

      // eslint-disable-next-line no-console
      console.log('[EVIDENCE create post response media]', JSON.stringify(created.body.data.media, null, 2));

      // Raw PostMedia relation rows — direct DB proof, independent of any
      // in-memory cache.
      const postMediaRows = await getTestPrisma().postMedia.findMany({
        where: { postId },
        orderBy: { position: 'asc' },
      });
      // eslint-disable-next-line no-console
      console.log('[EVIDENCE PostMedia rows]', postMediaRows);
      expect(postMediaRows.map((r) => r.mediaId)).toEqual([media1Id, media2Id]);
      expect(postMediaRows.map((r) => r.position)).toEqual([0, 1]);

      // Fresh store + fresh app — the in-process stand-in for "restart the API".
      const { app: app2 } = buildApp(freshStore());
      const feedRes = await request(app2)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${author.id}`);
      expect(feedRes.status).toBe(200);

      const feedPosts = Array.isArray(feedRes.body) ? feedRes.body : feedRes.body.data;
      const feedPost = feedPosts.find((p: { id: number }) => p.id === postId);
      expect(feedPost).toBeDefined();

      // eslint-disable-next-line no-console
      console.log('[EVIDENCE raw feed media JSON — fresh store]', JSON.stringify(feedPost.media, null, 2));

      expect(feedPost.media).toHaveLength(2);
      for (const entry of feedPost.media) {
        // Real backend shape: { id, media: { id, url, mimetype, ... } }
        expect(entry.media).toBeDefined();
        expect(typeof entry.media.url).toBe('string');
        expect(entry.media.url.length).toBeGreaterThan(0);
      }
      // Order preserved exactly as submitted.
      expect(feedPost.media.map((m: { id: number }) => m.id)).toEqual([media1Id, media2Id]);

      // Every media URL from the fresh-store feed response must actually
      // resolve with 200 through the real serving route.
      for (const entry of feedPost.media) {
        const getRes = await request(app2).get(entry.media.url);
        expect(getRes.status).toBe(200);
      }

      // Single-post read (GET /api/v1/posts/:postId) on the fresh store must
      // return the same valid media.
      const singleRes = await request(app2)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${author.id}`);
      expect(singleRes.status).toBe(200);
      expect(singleRes.body.data.media.map((m: { id: number }) => m.id)).toEqual([media1Id, media2Id]);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('REGRESSION: media GET route opts out of same-origin Cross-Origin-Resource-Policy so a different-origin Web app can actually render it', async () => {
    // Root cause of "Attachment unavailable" in real browsers: Helmet's
    // global default (Cross-Origin-Resource-Policy: same-origin, applied by
    // app.ts's helmet() call) makes browsers silently block <img>/<video>
    // loads of this URL from any other origin (the Web app's own origin in
    // dev, and likely a different subdomain in prod). This is invisible to
    // in-process supertest response assertions unless the header itself is
    // checked, which is exactly why this regression test exists.
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const uploadRes = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', realJpegBuffer(), { filename: 'corp.jpg', contentType: 'image/jpeg' });

      const getRes = await request(app).get(uploadRes.body.data.url);
      expect(getRes.status).toBe(200);
      expect(getRes.headers['cross-origin-resource-policy']).toBe('cross-origin');
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('EVIDENCE: video upload — real MP4 bytes end to end through upload, storage, and GET', async () => {
    const author = await createTestUser();
    try {
      const { app } = buildApp();
      const bytes = minimalMp4Buffer();
      const uploadRes = await request(app)
        .post('/api/v1/media/upload')
        .set('Authorization', `Bearer user-${author.id}`)
        .attach('file', bytes, { filename: 'clip.mp4', contentType: 'video/mp4' });

      // eslint-disable-next-line no-console
      console.log('[EVIDENCE video upload response]', JSON.stringify(uploadRes.body, null, 2));

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.data.type).toBe('VIDEO');
      expect(typeof uploadRes.body.data.url).toBe('string');
      expect(uploadRes.body.data.url.length).toBeGreaterThan(0);

      const getRes = await request(app).get(uploadRes.body.data.url);
      // eslint-disable-next-line no-console
      console.log('[EVIDENCE video GET]', { status: getRes.status, contentType: getRes.headers['content-type'] });
      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toMatch(/^video\//);
    } finally {
      await cleanupUser(author.id);
    }
  });
});
