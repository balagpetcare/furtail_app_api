import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import { AppError } from '../src/core/errors/app-error';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

function principalFor(
  sub: string,
  overrides: Partial<AuthenticatedPrincipal> = {},
): AuthenticatedPrincipal {
  return {
    sub,
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    issuedAt: Math.floor(Date.now() / 1000) - 10,
    roles: ['member'],
    permissions: [],
    scopes: ['openid', 'profile'],
    claims: {},
    ...overrides,
  };
}

describe('authenticated media upload — identity resolution and typed errors', () => {
  it('resolves a valid seeded user and lets them upload media', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('1');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('bytes'), 'photo.jpg');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeGreaterThan(0);
  });

  it('auto-provisions a local shadow user for a Central Auth subject never seen before, and reuses it on a second request', async () => {
    // A `sub` that is NOT one of the three seeded demo ids (1/2/3) previously
    // caused resolveUserId() to return null for every real Central Auth
    // user — the confirmed root cause of the "not allowed to upload" bug.
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('999');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const first = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('bytes-1'), 'a.jpg');
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('bytes-2'), 'b.jpg');
    expect(second.status).toBe(200);

    // Both uploads must resolve to the SAME local user (ownership must be
    // stable across requests for the same principal, not re-derived).
    const resolvedOwnerId = await socialStore.resolveUserId(principalFor('999'));
    expect(resolvedOwnerId).not.toBeNull();
    expect(socialStore.isMediaOwnedBy(resolvedOwnerId as number, first.body.data.id)).toBe(true);
    expect(socialStore.isMediaOwnedBy(resolvedOwnerId as number, second.body.data.id)).toBe(true);
  });

  it('returns 401 AUTH_REQUIRED, not a permission error, when no token is presented', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken() {
        throw AppError.authenticationRequired();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('bytes'), 'photo.jpg');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns a distinct ACCESS_TOKEN_EXPIRED (401) code for an expired access token, so the client can refresh-and-retry', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken() {
        throw AppError.accessTokenExpired();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer expired-token')
      .attach('file', Buffer.from('bytes'), 'photo.jpg');

    expect(res.status).toBe(401);
    // Wire value is 'CENTRAL_TOKEN_EXPIRED' — the Flutter AuthInterceptor's
    // refresh-and-retry flow keys off this exact string.
    expect(res.body.error.code).toBe('CENTRAL_TOKEN_EXPIRED');
  });

  it('returns TOKEN_AUDIENCE_INVALID (401) for a token issued for a different audience/client', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken() {
        throw AppError.tokenAudienceInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer wrong-audience-token')
      .attach('file', Buffer.from('bytes'), 'photo.jpg');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_AUDIENCE_INVALID');
  });

  it('rejects an unsupported file type with MEDIA_TYPE_UNSUPPORTED (415), not a generic 500', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('1');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('MZ...'), {
        filename: 'payload.exe',
        contentType: 'application/x-msdownload',
      });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('MEDIA_TYPE_UNSUPPORTED');
  });

  it('rejects a file whose extension does not match its declared content type', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('1');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('bytes'), { filename: 'script.js', contentType: 'image/jpeg' });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('MEDIA_TYPE_UNSUPPORTED');
  });

  it('rejects an oversized file with MEDIA_SIZE_EXCEEDED (413)', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('1');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const oversized = Buffer.alloc(33 * 1024 * 1024, 1);
    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', oversized, 'huge.jpg');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('MEDIA_SIZE_EXCEEDED');
  }, 20000);

  it('accepts a PDF document upload and normalizes it as a file media item', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('1');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .field('contentType', 'FUNDRAISING_DRAFT')
      .field('contentId', 'draft-pdf-1')
      .attach('file', Buffer.from('%PDF-1.4\n%fake\n'), {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('FILE');
    expect(res.body.data.url).toContain('.pdf');
  });

  it('keeps ownership distinguishable between two different resolved users (owner vs non-owner)', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'user-1') return principalFor('1');
        if (token === 'user-2') return principalFor('2');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const upload = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer user-1')
      .attach('file', Buffer.from('bytes'), 'photo.jpg');
    expect(upload.status).toBe(200);
    const mediaId = upload.body.data.id;

    expect(socialStore.isMediaOwnedBy(1, mediaId)).toBe(true);
    expect(socialStore.isMediaOwnedBy(2, mediaId)).toBe(false);
  });

  it('handles a duplicate/replayed multipart upload as two independent, successful requests (no corruption, no crash)', async () => {
    const socialStore = createSocialCoreStore();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token) {
        if (token === 'valid-token') return principalFor('1');
        throw AppError.authenticationInvalid();
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });

    const fileBytes = Buffer.from('same-bytes-replayed');
    const first = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', fileBytes, 'retry.jpg');
    const replay = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', fileBytes, 'retry.jpg');

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).not.toBe(first.body.data.id);
    expect(socialStore.isMediaOwnedBy(1, first.body.data.id)).toBe(true);
    expect(socialStore.isMediaOwnedBy(1, replay.body.data.id)).toBe(true);
  });
});

describe('SocialCoreStore.resolveUserId — Prisma-backed identity resolution', () => {
  it('goes through the injected identity resolver (JIT/Central-Auth-link path) when DATABASE_URL is configured, instead of parsing `sub` as a local id', async () => {
    const resolvedCalls: string[] = [];
    const socialStore = createSocialCoreStore(undefined, undefined, async (principal) => {
      resolvedCalls.push(principal.sub);
      // Simulate a Central Auth subject that is NOT numeric — this is the
      // realistic shape (opaque UUID/subject) that broke the old
      // `parseInt(sub)` implementation.
      return { id: 4242, username: 'central-auth-user', displayName: 'Central Auth User' };
    });

    const userId = await socialStore.resolveUserId({ sub: 'auth0|abc123' });

    expect(userId).toBe(4242);
    expect(resolvedCalls).toEqual(['auth0|abc123']);
    expect(socialStore.getUserById(4242)?.username).toBe('centralauthuser');
  });

  it('returns null (never a fabricated id) when the identity resolver cannot resolve the principal', async () => {
    const socialStore = createSocialCoreStore(undefined, undefined, async () => null);
    const userId = await socialStore.resolveUserId({ sub: 'unknown-subject' });
    expect(userId).toBeNull();
  });
});
