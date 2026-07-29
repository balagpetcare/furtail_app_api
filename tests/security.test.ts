import { generateKeyPairSync, createSign } from 'node:crypto';

import { Decimal } from '@prisma/client/runtime/client';
import express from 'express';
import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { errorHandler } from '../src/middleware/error-handler';
import { safeJsonStringify } from '../src/shared/safe-json';
import {
  requiredAuth,
  requireOwnership,
  requirePermission,
  requireRole,
} from '../src/security/auth-middleware';
import { CentralAuthJwtVerifier } from '../src/security/jwt-verifier';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

describe('safeJsonStringify', () => {
  it('serializes nested BigInt, Decimal, and Date values safely', () => {
    const payload = {
      id: 7n,
      nested: {
        amount: new Decimal('12.34'),
        when: new Date('2026-07-26T12:00:00.000Z'),
      },
    };

    expect(safeJsonStringify(payload)).toBe(
      JSON.stringify({
        id: '7',
        nested: {
          amount: '12.34',
          when: '2026-07-26T12:00:00.000Z',
        },
      }),
    );
  });
});

describe('CentralAuthJwtVerifier', () => {
  const issuer = 'https://central-auth.test';
  const audience = 'furtail-mobile';
  const clientId = 'furtail-mobile';
  const kid = 'central-auth-key-1';
  const now = Date.UTC(2026, 6, 26, 10, 0, 0);
  const clockToleranceSeconds = 0;
  const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = keyPair.publicKey.export({ format: 'jwk' }) as Record<string, string>;
  const jwks = {
    keys: [
      {
        ...publicJwk,
        kty: 'RSA',
        kid,
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };

  function verifierWithKey(fetchJwks = async (_jwksUri: string) => jwks) {
    return new CentralAuthJwtVerifier({
      issuer,
      audience,
      clientId,
      jwksUri: 'https://central-auth.test/.well-known/jwks.json',
      requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat', 'client_id'],
      clockToleranceSeconds,
      fetchJwks,
      now: () => now,
    });
  }

  function signToken(claims: Record<string, unknown>, key = keyPair.privateKey) {
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(key);
    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  it('accepts a valid token and returns a typed principal', async () => {
    const token = signToken({
      sub: 'user-123',
      iss: issuer,
      aud: audience,
      exp: Math.floor(now / 1000) + 300,
      iat: Math.floor(now / 1000) - 10,
      client_id: clientId,
      email: 'user@example.com',
      roles: ['admin'],
      permissions: ['post:create'],
      scope: 'openid profile',
    });

    const principal = await verifierWithKey().verifyAccessToken(token);
    expect(principal.sub).toBe('user-123');
    expect(principal.issuer).toBe(issuer);
    expect(principal.audience).toBe(audience);
    expect(principal.clientId).toBe(clientId);
    expect(principal.roles).toEqual(['admin']);
    expect(principal.permissions).toEqual(['post:create']);
    expect(principal.scopes).toEqual(['openid', 'profile']);
    expect(principal.email).toBe('user@example.com');
  });

  it('rejects an invalid signature', async () => {
    const otherKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = signToken(
      {
        sub: 'user-123',
        iss: issuer,
        aud: audience,
        exp: Math.floor(now / 1000) + 300,
        iat: Math.floor(now / 1000) - 10,
        client_id: clientId,
      },
      otherKeyPair.privateKey,
    );

    await expect(verifierWithKey().verifyAccessToken(token)).rejects.toMatchObject({
      code: 'AUTHENTICATION_INVALID',
    });
  });

  it('rejects the wrong issuer', async () => {
    const token = signToken({
      sub: 'user-123',
      iss: 'https://wrong-issuer.test',
      aud: audience,
      exp: Math.floor(now / 1000) + 300,
      iat: Math.floor(now / 1000) - 10,
      client_id: clientId,
    });

    await expect(verifierWithKey().verifyAccessToken(token)).rejects.toMatchObject({
      code: 'AUTHENTICATION_INVALID',
    });
  });

  it('rejects the wrong audience', async () => {
    const token = signToken({
      sub: 'user-123',
      iss: issuer,
      aud: 'another-audience',
      exp: Math.floor(now / 1000) + 300,
      iat: Math.floor(now / 1000) - 10,
      client_id: clientId,
    });

    await expect(verifierWithKey().verifyAccessToken(token)).rejects.toMatchObject({
      code: 'TOKEN_AUDIENCE_INVALID',
    });
  });

  it('rejects an expired token', async () => {
    const token = signToken({
      sub: 'user-123',
      iss: issuer,
      aud: audience,
      exp: Math.floor(now / 1000) - 1,
      iat: Math.floor(now / 1000) - 100,
      client_id: clientId,
    });

    // Wire value stays `CENTRAL_TOKEN_EXPIRED` — Flutter's AuthInterceptor
    // keys its single-flight refresh-and-retry flow off this exact string.
    await expect(verifierWithKey().verifyAccessToken(token)).rejects.toMatchObject({
      code: 'CENTRAL_TOKEN_EXPIRED',
    });
  });
});

describe('auth middleware and authorization helpers', () => {
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

  function buildTestApp() {
    const app = express();
    app.get('/required', requiredAuth({ verifier }), (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/role', requiredAuth({ verifier }), requireRole('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    app.get(
      '/permission',
      requiredAuth({ verifier }),
      requirePermission('post:create'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.get(
      '/owner/:id',
      requiredAuth({ verifier }),
      requireOwnership('owner-123'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.use(errorHandler());
    return app;
  }

  it('rejects a missing token', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/required');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects authorization denial', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/role').set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTHORIZATION_DENIED');
  });

  it('rejects ownership denial', async () => {
    const app = buildTestApp();
    const response = await request(app)
      .get('/owner/owner-456')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTHORIZATION_DENIED');
  });
});

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
