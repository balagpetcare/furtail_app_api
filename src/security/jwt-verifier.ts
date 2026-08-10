import { createPublicKey, createVerify, createHmac, type KeyObject } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { env } from '../config/env';
import { AppError } from '../core/errors/app-error';
import { logger } from '../shared/logger';
import { collectRoleValues, collectScopes } from './authorization';
import type { AuthenticatedPrincipal, TokenVerifier } from './principal';

type JwkKey = {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  crv?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
};

type JwksResponse = {
  keys: JwkKey[];
};

interface JwtParts {
  header: Record<string, unknown> & { alg?: string; kid?: string; typ?: string };
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

export interface SafeJwtDiagnostics {
  header: {
    alg?: string;
    kid?: string;
    typ?: string;
  };
  claims: {
    iss?: string;
    aud?: string | string[];
    azp?: string;
    client_id?: string;
    sub?: string;
    iat?: number;
    exp?: number;
  };
}

export interface JwtVerifierConfig {
  issuer: string;
  audience: string | string[];
  clientId: string | string[];
  jwksUri: string;
  jwtSecret?: string;
  requiredClaims: string[];
  clockToleranceSeconds: number;
  fetchJwks?: (jwksUri: string) => Promise<JwksResponse>;
  now?: () => number;
}

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

export class CentralAuthJwtVerifier implements TokenVerifier {
  private readonly jwksCache = new Map<string, { at: number; jwks: JwksResponse }>();

  constructor(private readonly config: JwtVerifierConfig) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const tokenParts = parseJwt(token);
    const alg = tokenParts.header.alg;
    if (!alg) {
      throw AppError.authenticationInvalid('Missing token signature algorithm');
    }

    if (alg === 'HS256' && this.config.jwtSecret) {
      if (!verifyHsSignature(tokenParts, this.config.jwtSecret, alg)) {
        throw AppError.authenticationInvalid('The access token signature could not be verified');
      }
    } else if (['RS256', 'ES256'].includes(alg)) {
      const jwks = await this.getJwks(this.config.jwksUri);
      const key = selectJwk(jwks, tokenParts.header.kid, alg);
      if (!key) {
        throw AppError.authenticationInvalid('No matching signing key was found');
      }

      const publicKey = createPublicKey({ key, format: 'jwk' });
      if (!verifySignature(tokenParts, publicKey, alg)) {
        throw AppError.authenticationInvalid('The access token signature could not be verified');
      }
    } else {
      throw AppError.authenticationInvalid('Unsupported token signature algorithm');
    }

    const nowSeconds = Math.floor((this.config.now?.() ?? Date.now()) / 1000);
    const issuer = expectString(tokenParts.payload.iss, 'iss');
    const subject = expectString(tokenParts.payload.sub, 'sub');
    const audience = normalizeAudience(tokenParts.payload.aud);
    const issuedAt = expectNumber(tokenParts.payload.iat, 'iat');
    const expiresAt = expectNumber(tokenParts.payload.exp, 'exp');
    // Use client_id claim if present; fall back to audience (which IS the client ID)
    const clientId =
      typeof tokenParts.payload.client_id === 'string' && tokenParts.payload.client_id.trim()
        ? tokenParts.payload.client_id
        : typeof audience === 'string'
          ? audience
          : audience[0] || '';

    assertClaimPresence(tokenParts.payload, this.config.requiredClaims);
    assertClaimMatches('iss', issuer, this.config.issuer);
    assertAudience(tokenParts.payload.aud, this.config.audience);
    assertClientId(clientId, this.config.clientId);
    assertNotExpired(expiresAt, nowSeconds, this.config.clockToleranceSeconds);
    assertNotBefore(tokenParts.payload.nbf, nowSeconds, this.config.clockToleranceSeconds);

    return {
      sub: subject,
      issuer,
      audience,
      clientId,
      expiresAt,
      issuedAt,
      roles: collectRoleValues(tokenParts.payload.roles),
      permissions: collectRoleValues(tokenParts.payload.permissions),
      scopes: collectScopes(tokenParts.payload.scope),
      email: asString(tokenParts.payload.email),
      name: asString(tokenParts.payload.name),
      claims: { ...tokenParts.payload },
    };
  }

  private async getJwks(jwksUri: string): Promise<JwksResponse> {
    const cached = this.jwksCache.get(jwksUri);
    const now = Date.now();
    if (cached && now - cached.at < JWKS_CACHE_TTL_MS) {
      return cached.jwks;
    }
    if (!this.config.fetchJwks) {
      throw AppError.serviceUnavailable('Central Auth signing keys are not configured');
    }
    const jwks = await retryJwksFetch(
      () => this.config.fetchJwks?.(jwksUri) ?? Promise.reject(new Error('Missing JWKS fetcher')),
    );
    if (!jwks || !Array.isArray(jwks.keys)) {
      throw AppError.authenticationInvalid('JWKS response is invalid');
    }
    this.jwksCache.set(jwksUri, { at: now, jwks });
    return jwks;
  }
}

export function createCentralAuthVerifier(): TokenVerifier {
  return new CentralAuthJwtVerifier({
    issuer: env.CENTRAL_AUTH_ISSUER,
    audience: env.CENTRAL_AUTH_ALLOWED_AUDIENCES,
    clientId: env.CENTRAL_AUTH_ALLOWED_CLIENT_IDS,
    jwksUri: env.CENTRAL_AUTH_JWKS_URI,
    jwtSecret: env.CENTRAL_AUTH_JWT_SECRET || undefined,
    requiredClaims: env.CENTRAL_AUTH_REQUIRED_CLAIMS,
    clockToleranceSeconds: 60,
    fetchJwks: async (jwksUri) => {
      const response = await fetch(jwksUri, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`JWKS fetch failed with status ${response.status}`);
      }
      return (await response.json()) as JwksResponse;
    },
  });
}

export function decodeJwtDiagnostics(token: string): SafeJwtDiagnostics {
  const parts = parseJwt(token);
  return {
    header: {
      alg: typeof parts.header.alg === 'string' ? parts.header.alg : undefined,
      kid: typeof parts.header.kid === 'string' ? parts.header.kid : undefined,
      typ: typeof parts.header.typ === 'string' ? parts.header.typ : undefined,
    },
    claims: {
      iss: typeof parts.payload.iss === 'string' ? parts.payload.iss : undefined,
      aud:
        typeof parts.payload.aud === 'string' || Array.isArray(parts.payload.aud)
          ? normalizeAudience(parts.payload.aud)
          : undefined,
      azp: typeof parts.payload.azp === 'string' ? parts.payload.azp : undefined,
      client_id: typeof parts.payload.client_id === 'string' ? parts.payload.client_id : undefined,
      sub: typeof parts.payload.sub === 'string' ? parts.payload.sub : undefined,
      iat: typeof parts.payload.iat === 'number' ? parts.payload.iat : undefined,
      exp: typeof parts.payload.exp === 'number' ? parts.payload.exp : undefined,
    },
  };
}

function parseJwt(token: string): JwtParts {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw AppError.authenticationInvalid('The access token is malformed');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  return {
    header: parseJson(base64UrlDecode(encodedHeader), 'JWT header'),
    payload: parseJson(base64UrlDecode(encodedPayload), 'JWT payload'),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: base64UrlDecode(encodedSignature),
  };
}

function parseJson(
  input: Buffer,
  label: string,
): Record<string, unknown> & { alg?: string; kid?: string } {
  try {
    const parsed = JSON.parse(input.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected object');
    }
    return parsed as Record<string, unknown> & { alg?: string; kid?: string };
  } catch {
    throw AppError.authenticationInvalid(`Invalid ${label}`);
  }
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function selectJwk(jwks: JwksResponse, kid: string | undefined, alg: string): JwkKey | undefined {
  const candidates = jwks.keys.filter((key) => key.use === undefined || key.use === 'sig');
  const keyed = kid ? candidates.filter((key) => key.kid === kid) : candidates;
  return keyed.find((key) => !key.alg || key.alg === alg);
}

function verifySignature(parts: JwtParts, publicKey: KeyObject, alg: string): boolean {
  const verifier = createVerify(alg === 'RS256' ? 'RSA-SHA256' : 'sha256');
  verifier.update(parts.signingInput);
  verifier.end();
  if (alg === 'ES256') {
    return verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, parts.signature);
  }
  return verifier.verify(publicKey, parts.signature);
}

function verifyHsSignature(parts: JwtParts, secret: string, alg: string): boolean {
  const hmacAlgo = alg === 'HS256' ? 'sha256' : alg === 'HS384' ? 'sha384' : 'sha512';
  const hmac = createHmac(hmacAlgo, secret);
  hmac.update(parts.signingInput);
  const expected = hmac.digest('base64url');
  const actual = parts.signature.toString('base64url');
  return expected === actual;
}

function assertClaimPresence(payload: Record<string, unknown>, requiredClaims: string[]): void {
  const missing = requiredClaims.filter(
    (claim) => payload[claim] === undefined || payload[claim] === null,
  );
  if (missing.length > 0) {
    throw AppError.authenticationInvalid(`Missing required token claims: ${missing.join(', ')}`);
  }
}

function assertClaimMatches(name: string, actual: string, expected: string): void {
  if (expected.length > 0 && actual !== expected) {
    throw AppError.authenticationInvalid(`Invalid ${name} claim`);
  }
}

function assertAudience(aud: unknown, expected: string | string[]): void {
  const normalized = normalizeAudience(aud);
  const values = Array.isArray(normalized) ? normalized : [normalized];
  const allowed = normalizeExpectedValues(expected);
  if (allowed.length > 0 && !values.some((value) => allowed.includes(value))) {
    throw AppError.tokenAudienceInvalid('Invalid audience claim');
  }
}

function normalizeAudience(aud: unknown): string | string[] {
  if (Array.isArray(aud)) {
    return aud.filter((value): value is string => typeof value === 'string');
  }
  if (typeof aud === 'string') {
    return aud;
  }
  throw AppError.authenticationInvalid('Missing or invalid aud claim');
}

function assertClientId(actual: string, expected: string | string[]): void {
  const allowed = normalizeExpectedValues(expected);
  if (allowed.length > 0 && !allowed.includes(actual)) {
    throw AppError.authenticationInvalid('Invalid client_id claim');
  }
}

function normalizeExpectedValues(expected: string | string[]): string[] {
  return Array.isArray(expected) ? expected : [expected].filter((value) => value.length > 0);
}

function assertNotExpired(exp: number, nowSeconds: number, toleranceSeconds: number): void {
  if (nowSeconds - toleranceSeconds >= exp) {
    throw AppError.accessTokenExpired('The access token is expired');
  }
}

function assertNotBefore(nbf: unknown, nowSeconds: number, toleranceSeconds: number): void {
  if (typeof nbf === 'number' && nowSeconds + toleranceSeconds < nbf) {
    throw AppError.authenticationInvalid('The access token is not yet valid');
  }
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw AppError.authenticationInvalid(`Missing or invalid ${label} claim`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw AppError.authenticationInvalid(`Missing or invalid ${label} claim`);
  }
  return value;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

async function retryJwksFetch<T>(factory: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        await delay(50);
      }
    }
  }
  logger.warn(
    { error: lastError instanceof Error ? lastError.message : String(lastError) },
    'Failed to fetch Central Auth JWKS',
  );
  throw AppError.serviceUnavailable('Unable to reach Central Auth JWKS');
}
