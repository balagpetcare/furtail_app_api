import request from 'supertest';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { getPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

// Prints ONLY status codes and response envelope/key shapes — never actual
// field values (no names, emails, phones, tokens). Run against the local
// dev database only (uses the already-configured DATABASE_URL).

const principal: AuthenticatedPrincipal = {
  sub: '7',
  issuer: 'https://central-auth.test',
  audience: 'furtail-mobile',
  clientId: 'furtail-mobile',
  expiresAt: Math.floor(Date.now() / 1000) + 300,
  issuedAt: Math.floor(Date.now() / 1000) - 10,
  roles: ['member'],
  permissions: [],
  scopes: ['openid', 'profile'],
  claims: {},
};

const verifier: TokenVerifier = {
  async verifyAccessToken(token: string) {
    if (token === 'valid-token') return principal;
    throw Object.assign(new Error('Invalid or expired access token'), {
      code: 'AUTHENTICATION_INVALID',
    });
  },
};

function keysOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? [keysOf(value[0])] : [];
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = v && typeof v === 'object' ? keysOf(v) : typeof v;
    }
    return out;
  }
  return typeof value;
}

async function main() {
  const prisma = getPrisma();
  const socialStore = createSocialCoreStore(undefined, undefined, async (p) => {
    const id = Number(p.sub);
    return Number.isFinite(id) && id > 0 ? { id } : null;
  });
  const fundraisingStore = createFundraisingStore(socialStore, { prisma });
  const app = createAppWithDependencies({ authVerifier: verifier, socialStore, fundraisingStore });

  const evidence: Record<string, unknown> = {};

  const me = await request(app).get('/api/v1/user/me').set('Authorization', 'Bearer valid-token');
  evidence['GET /api/v1/user/me'] = {
    status: me.status,
    envelope: keysOf(me.body),
  };

  const patched = await request(app)
    .patch('/api/v1/user/me')
    .set('Authorization', 'Bearer valid-token')
    .send({ bio: 'evidence-run-no-op' });
  evidence['PATCH /api/v1/user/me'] = {
    status: patched.status,
    envelope: keysOf(patched.body),
  };

  const visitor = await request(app)
    .get('/api/v1/user/8')
    .set('Authorization', 'Bearer valid-token');
  evidence['GET /api/v1/user/:userId (public)'] = {
    status: visitor.status,
    envelope: keysOf(visitor.body),
  };

  const feed = await request(app).get('/api/v1/posts/feed').set('Authorization', 'Bearer valid-token');
  evidence['GET /api/v1/posts/feed'] = {
    status: feed.status,
    envelope: keysOf(feed.body),
  };

  const fundraisingFeed = await request(app).get('/api/v1/fundraising/feed');
  evidence['GET /api/v1/fundraising/feed'] = {
    status: fundraisingFeed.status,
    envelope: keysOf(fundraisingFeed.body),
  };

  const fundraisingDetail = await request(app).get('/api/v1/fundraising/campaigns/1');
  evidence['GET /api/v1/fundraising/campaigns/:id'] = {
    status: fundraisingDetail.status,
    envelope: keysOf(fundraisingDetail.body),
  };

  // Negative auth evidence: bad token.
  const badToken = await request(app)
    .get('/api/v1/user/me')
    .set('Authorization', 'Bearer not-a-real-token');
  evidence['GET /api/v1/user/me (invalid token)'] = { status: badToken.status };

  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
  await prisma.$disconnect();
}

void main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: String(e) }) + '\n');
  process.exitCode = 1;
});
