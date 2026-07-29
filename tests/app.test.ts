import express from 'express';
import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import { AppError } from '../src/core/errors/app-error';
import { errorHandler } from '../src/middleware/error-handler';
import { requiredAuth, optionalAuth, requireOwnership } from '../src/security/auth-middleware';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';
import type { DatabaseReadinessService } from '../src/security/database';

describe('application endpoints', () => {
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
      if (token === 'valid-token') {
        return principal;
      }
      throw AppError.authenticationInvalid('Invalid or expired access token');
    },
  };

  const databaseReadiness: DatabaseReadinessService = {
    async check() {
      return { status: 'UNAVAILABLE', details: 'connection refused' };
    },
  };

  it('serves health, ready, version, optional auth, and authenticated identity responses', async () => {
    const app = createAppWithDependencies({ authVerifier: verifier, databaseReadiness });

    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.data.status).toBe('alive');

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe('degraded');
    expect(ready.body.data.dependencies.database.status).toBe('UNAVAILABLE');

    const version = await request(app).get('/api/v1/version');
    expect(version.status).toBe(200);
    expect(version.body.data.service).toBe('furtail-app-api');

    const optional = await request(app).get('/api/v1/auth/session');
    expect(optional.status).toBe(200);
    expect(optional.body.data.authenticated).toBe(false);
    expect(optional.body.data.principal).toBeNull();

    // NOTE: `/api/v1/auth/me` now resolves the principal to a local Prisma
    // user via getOrProvisionUser(), so it requires a real database
    // connection and is verified separately (see auth-me-contract.test.ts).
    // The old inline assertion here (`data.principal.sub`) no longer
    // matches the route's actual `{ data: { user } }` contract.
  });

  it('rejects unauthorized access on required auth routes', async () => {
    const app = createAppWithDependencies({ authVerifier: verifier, databaseReadiness });
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects ownership denial in a protected route', async () => {
    const app = express();
    app.get('/own/:id', requiredAuth({ verifier }), requireOwnership('owner-123'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler());

    const response = await request(app)
      .get('/own/owner-456')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTHORIZATION_DENIED');
  });

  it('respects optional auth middleware with no token', async () => {
    const app = express();
    app.get('/maybe', optionalAuth({ verifier }), (req, res) => {
      res.json({ authenticated: Boolean(req.principal) });
    });
    app.use(errorHandler());

    const response = await request(app).get('/maybe');
    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(false);
  });
});
