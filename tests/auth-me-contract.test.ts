import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';
import type { DatabaseReadinessService } from '../src/security/database';
import * as authService from '../src/modules/auth/auth.service';

// getOrProvisionUser talks to Prisma; stub it so this test verifies only the
// HTTP response contract that Flutter's AuthController._fetchProfile parses.
jest.mock('../src/modules/auth/auth.service', () => ({
  getOrProvisionUser: jest.fn(),
}));

const getOrProvisionUser = authService.getOrProvisionUser as jest.MockedFunction<
  typeof authService.getOrProvisionUser
>;

describe('GET /api/v1/auth/me contract', () => {
  const principal: AuthenticatedPrincipal = {
    sub: 'user-123',
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    issuedAt: Math.floor(Date.now() / 1000) - 10,
    roles: ['member'],
    permissions: ['profile:read'],
    scopes: ['openid'],
    claims: {},
  };

  const verifier: TokenVerifier = {
    async verifyAccessToken(token: string) {
      if (token === 'valid-token') return principal;
      throw Object.assign(new Error('Invalid or expired access token'), { statusCode: 401 });
    },
  };

  const databaseReadiness: DatabaseReadinessService = {
    async check() {
      return { status: 'READY', details: 'ok' };
    },
  };

  beforeEach(() => {
    getOrProvisionUser.mockReset();
  });

  it('wraps the resolved user as { success, data: { user } } — the exact shape Flutter unwraps', async () => {
    getOrProvisionUser.mockResolvedValue({
      id: 42,
      name: 'Jane Doe',
      email: 'jane@example.com',
    });

    const app = createAppWithDependencies({ authVerifier: verifier, databaseReadiness });
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // Flutter's AuthController._fetchProfile reads this exact path:
    // body['data']['user'] — not body['user'], not body['data'] directly.
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user).toEqual(
      expect.objectContaining({ id: 42, name: 'Jane Doe', email: 'jane@example.com' }),
    );
    // Never leak a raw Prisma model shape (e.g. internal-only columns).
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('gives repeated calls for the same principal an identical field shape (JIT-provision idempotency)', async () => {
    getOrProvisionUser.mockResolvedValue({
      id: 7,
      name: 'Repeat User',
      email: 'repeat@example.com',
    });

    const app = createAppWithDependencies({ authVerifier: verifier, databaseReadiness });
    const first = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');
    const second = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(Object.keys(first.body.data.user).sort()).toEqual(
      Object.keys(second.body.data.user).sort(),
    );
    expect(first.body.data.user).toEqual(second.body.data.user);
  });

  it('returns 401 without a token, never invoking user provisioning', async () => {
    const app = createAppWithDependencies({ authVerifier: verifier, databaseReadiness });
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(getOrProvisionUser).not.toHaveBeenCalled();
  });
});
