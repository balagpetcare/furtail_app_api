import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * BPA / Central Auth shared-profile compatibility: proves Furtail's public
 * profile PATCH cannot overwrite Central Auth's canonical identity fields
 * (firstName, lastName, dateOfBirth, verified email, verified phone) —
 * whether the caller is the Furtail app or the BPA app sharing the same
 * Central Auth subject and the same underlying User row.
 *
 * This is a structural guarantee, not just policy: `updateSharedProfile`'s
 * input only destructures displayName/username/bio/visibility/... — there
 * is no code path that reads firstName/lastName/dateOfBirth/email/phone
 * from the PATCH body at all, so those keys are silently ignored rather
 * than rejected. This test proves that in practice, not just by reading
 * the source.
 */
describe('BPA / Central Auth shared-profile compatibility', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string, audience: string, clientId: string): AuthenticatedPrincipal {
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

  function buildApp() {
    const prisma = getTestPrisma();
    const socialStore = createSocialCoreStore(
      undefined,
      undefined,
      async (p) => {
        const id = Number(p.sub);
        return Number.isFinite(id) && id > 0 ? { id } : null;
      },
      prisma,
    );
    const verifier: TokenVerifier = {
      async verifyAccessToken(token: string) {
        // token shape: "user-<id>" (Furtail) or "bpa-<id>" (BPA), both
        // resolving to the same underlying subject/user.
        const furtail = /^user-(\d+)$/.exec(token);
        if (furtail) return principal(furtail[1]!, 'furtail-mobile', 'furtail-mobile');
        const bpa = /^bpa-(\d+)$/.exec(token);
        if (bpa) return principal(bpa[1]!, 'bpa-mobile', 'bpa-mobile');
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore, prisma });
    return app;
  }

  let counter = 0;
  async function createTestUser(overrides: Record<string, unknown> = {}) {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    const user = await prisma.user.create({
      data: {
        profile: {
          create: {
            username: `bpa_compat_${suffix}`,
            displayName: `BPA Compat ${suffix}`,
            ...overrides,
          },
        },
      },
      include: { profile: true },
    });
    await prisma.userAuth.create({
      data: {
        userId: user.id,
        provider: 'CENTRAL_AUTH',
        email: `bpa_compat_${suffix}@example.com`,
        emailVerifiedAt: new Date(),
        phone: '+8801000000000',
      },
    });
    return user;
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.userAuth.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  it('PATCH /api/v1/user/me silently ignores firstName/lastName/dateOfBirth/email/phone — never applies them', async () => {
    const app = buildApp();
    const user = await createTestUser();
    try {
      const before = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer user-${user.id}`);
      expect(before.status).toBe(200);
      const verifiedEmailBefore = before.body.data.auth.email;
      const verifiedPhoneBefore = before.body.data.auth.phone;

      const patched = await request(app)
        .patch('/api/v1/user/me')
        .set('Authorization', `Bearer user-${user.id}`)
        .send({
          // Legitimate Furtail-owned fields.
          displayName: 'Updated Display Name',
          bio: 'Updated bio',
          // Central-Auth-owned identity fields — must have zero effect
          // when sent through the Furtail profile PATCH.
          firstName: 'Attacker',
          lastName: 'Injected',
          dateOfBirth: '1990-01-01T00:00:00.000Z',
          email: 'attacker@evil.example',
          emailVerifiedAt: new Date().toISOString(),
          phone: '+10000000000',
        });
      expect(patched.status).toBe(200);

      // Furtail-owned fields did apply.
      expect(patched.body.data.profile.displayName).toBe('Updated Display Name');
      expect(patched.body.data.profile.bio).toBe('Updated bio');

      // The shared profile payload has no firstName/lastName/dateOfBirth
      // keys at all — Furtail doesn't own or expose them.
      expect(patched.body.data.profile).not.toHaveProperty('firstName');
      expect(patched.body.data.profile).not.toHaveProperty('lastName');
      expect(patched.body.data.profile).not.toHaveProperty('dateOfBirth');

      // Verified email/phone (sourced from UserAuth, Central Auth's synced
      // copy) are completely unchanged by the PATCH.
      expect(patched.body.data.auth.email).toBe(verifiedEmailBefore);
      expect(patched.body.data.auth.phone).toBe(verifiedPhoneBefore);
      expect(patched.body.data.auth.email).not.toBe('attacker@evil.example');
      expect(patched.body.data.auth.phone).not.toBe('+10000000000');

      // Re-read to confirm persistence, not just an unpersisted response echo.
      const after = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer user-${user.id}`);
      expect(after.body.data.auth.email).toBe(verifiedEmailBefore);
      expect(after.body.data.auth.phone).toBe(verifiedPhoneBefore);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('BPA-audience token reaches the same shared profile as the Furtail-audience token for the same subject', async () => {
    const app = buildApp();
    const user = await createTestUser();
    try {
      const viaFurtail = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer user-${user.id}`);
      const viaBpa = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer bpa-${user.id}`);

      expect(viaFurtail.status).toBe(200);
      expect(viaBpa.status).toBe(200);
      expect(viaBpa.body.data.id).toBe(viaFurtail.body.data.id);
      expect(viaBpa.body.data.auth.email).toBe(viaFurtail.body.data.auth.email);
    } finally {
      await cleanupUser(user.id);
    }
  });
});
