import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import { getTestPrisma } from './helpers/test-prisma';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

interface UpdateItemView {
  id: number;
  postId: number;
  caption: string | null;
  author: { id: number; profile: Record<string, unknown> };
  media: Array<{ id: number; url: string; mimetype: string; type: string }>;
  post: {
    id: number;
    caption: string | null;
    author: { id: number; profile: Record<string, unknown> };
    media: Array<{
      id: number;
      media: { id: number; url: string; mimetype: string; type: string };
    }>;
  };
}

function principal(sub: string): AuthenticatedPrincipal {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub,
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: now + 600,
    issuedAt: now - 10,
    roles: ['member'],
    permissions: ['fundraising:read'],
    scopes: ['openid', 'profile'],
    claims: {},
  };
}

function verifier(): TokenVerifier {
  return {
    async verifyAccessToken(token: string) {
      if (token === 'token-1') return principal('1');
      throw AppError.authenticationInvalid('Invalid or expired access token');
    },
  };
}

function buildApp() {
  const socialStore = createSocialCoreStore(undefined, undefined, async (principalLike) => {
    const id = Number(principalLike.sub);
    return Number.isFinite(id) && id > 0 ? { id } : null;
  });
  const fundraisingStore = createFundraisingStore(socialStore, { prisma: getTestPrisma() });
  const app = createAppWithDependencies({
    authVerifier: verifier(),
    socialStore,
    fundraisingStore,
  });
  return { app, fundraisingStore };
}

async function cleanupFundraisingRows(): Promise<void> {
  const prisma = getTestPrisma();
  await prisma.fundraisingCampaignUpdate.deleteMany({});
  await prisma.fundraisingCampaignMedia.deleteMany({ where: { campaignId: { gt: 1 } } });
  await prisma.fundraisingCampaign.deleteMany({ where: { id: { gt: 1 } } });
  await prisma.fundraisingCampaignDraft.deleteMany({ where: { id: { gt: 1 } } });
}

beforeEach(async () => {
  await cleanupFundraisingRows();
});

afterEach(async () => {
  await cleanupFundraisingRows();
});

afterAll(async () => {
  await getTestPrisma().$disconnect();
  await disconnectPrisma();
});

async function createUploadedMediaId(app: ReturnType<typeof buildApp>['app']): Promise<number> {
  const response = await request(app)
    .post('/api/v1/media/upload')
    .set('Authorization', 'Bearer token-1')
    .attach('file', Buffer.from('fundraising-update-media'), 'update.jpg');
  expect(response.status).toBe(200);
  return response.body.data.id as number;
}

async function createPublishedCampaign(app: ReturnType<typeof buildApp>['app']): Promise<number> {
  const mediaId = await createUploadedMediaId(app);
  const created = await request(app)
    .post('/api/v1/fundraising/campaigns')
    .set('Authorization', 'Bearer token-1')
    .send({
      title: `Seed campaign ${randomUUID()}`,
      caption: 'Public updates test campaign',
      category: 'PET_HEALTH',
      fundingMode: 'ONE_TIME',
      currencyCode: 'BDT',
      targetAmountMinor: '50000',
      beneficiaryType: 'PET',
      beneficiaryName: 'Luna',
      deadline: '2026-12-31T00:00:00.000Z',
      mediaIds: [mediaId],
    });
  expect(created.status).toBe(201);

  const campaignId = created.body.data.id as number;
  const published = await request(app)
    .post(`/api/v1/fundraising/campaigns/${campaignId}/publish`)
    .set('Authorization', 'Bearer token-1');
  expect(published.status).toBe(200);
  expect(published.body.data.status).toBe('ACTIVE');
  return campaignId;
}

describe('fundraising campaign update persistence', () => {
  it('persists updates across store instances and survives a restart', async () => {
    const first = buildApp();
    const campaignId = await createPublishedCampaign(first.app);

    const created = await request(first.app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/updates`)
      .set('Authorization', 'Bearer token-1')
      .send({ caption: 'Seed campaign update' });
    expect(created.status).toBe(201);

    const updateId = created.body.data.id as number;

    const second = buildApp();
    const listed = await request(second.app).get(
      `/api/v1/fundraising/campaigns/${campaignId}/updates`,
    );
    expect(listed.status).toBe(200);

    const updates = listed.body.data.items as UpdateItemView[];
    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe(updateId);
    expect(updates[0]?.caption).toBe('Seed campaign update');
    expect(updates[0]?.media).toHaveLength(0);
    expect(updates[0]?.post.media).toHaveLength(0);
  });

  it('is visible to an independent Prisma client worker', async () => {
    const { app } = buildApp();
    const campaignId = await createPublishedCampaign(app);

    const created = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/updates`)
      .set('Authorization', 'Bearer token-1')
      .send({ caption: 'Worker visible update' });
    expect(created.status).toBe(201);

    const updateId = created.body.data.id as number;
    const row = await getTestPrisma().fundraisingCampaignUpdate.findUnique({
      where: { id: updateId },
    });
    expect(row).not.toBeNull();
    expect(row?.caption).toBe('Worker visible update');
    expect(row?.mediaIds).toEqual([]);
    expect(row?.deletedAt).toBeNull();
  });

  it('keeps the public response free of private fundraising, KYC, and payment data', async () => {
    const { app } = buildApp();
    const campaignId = await createPublishedCampaign(app);

    const created = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/updates`)
      .set('Authorization', 'Bearer token-1')
      .send({ caption: 'Public privacy update' });
    expect(created.status).toBe(201);

    const listed = await request(app).get(`/api/v1/fundraising/campaigns/${campaignId}/updates`);
    expect(listed.status).toBe(200);

    const update = (listed.body.data.items as UpdateItemView[])[0]!;
    expect(update).not.toHaveProperty('payment');
    expect(update).not.toHaveProperty('verification');
    expect(update.author.profile).not.toHaveProperty('nationalIdNumber');
    expect(update.author.profile).not.toHaveProperty('presentAddress');
    expect(update.author.profile).not.toHaveProperty('privateMediaUrl');
    expect(update.media).toHaveLength(0);
    expect(JSON.stringify(update)).not.toContain('secret');
  });
});
