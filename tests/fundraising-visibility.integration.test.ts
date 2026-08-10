import request from 'supertest';
import type { Express } from 'express';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Test-only escape hatch into the in-memory store's private campaign map —
 * used to reach campaign statuses (ARCHIVED, REJECTED, ...) that the current
 * routes have no transition for, without adding a test-only mutation route
 * to production code.
 */
async function forceCampaignStatus(
  app: Express,
  campaignId: number,
  status: string,
): Promise<void> {
  await request(app).get(`/api/v1/fundraising/campaigns/${campaignId}`);
  await getTestPrisma().fundraisingCampaign.update({
    where: { id: campaignId },
    data: { status, deletedAt: null },
  });
}

describe('fundraiser visibility and authorization policy', () => {
  // See fundraising.integration.test.ts for why this reset (and the
  // explicit test-database Prisma client below) is needed now that
  // verification accounts are durably persisted.
  beforeEach(async () => {
    const prisma = getTestPrisma();
    await prisma.fundraisingWebhookEvent.deleteMany({});
    await prisma.fundraisingReceipt.deleteMany({ where: { donationId: { gt: 1 } } });
    await prisma.fundraisingPaymentAttempt.deleteMany({ where: { donationId: { gt: 1 } } });
    await prisma.fundraisingDonation.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingCampaignMedia.deleteMany({ where: { campaignId: { gt: 1 } } });
    await prisma.fundraisingCampaignUpdate.deleteMany({ where: { campaignId: { gt: 1 } } });
    await prisma.fundraisingCampaign.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingCampaignDraft.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingVerificationDocument.deleteMany({ where: { accountId: { gt: 1 } } });
    await prisma.fundraisingVerificationAccount.deleteMany({ where: { ownerUserId: { gt: 1 } } });
    await prisma.fundraisingIdempotencyKey.deleteMany({});
  });

  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const audience = 'furtail-mobile';
  const clientId = 'furtail-mobile';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string, roles: string[] = ['member']): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience,
      clientId,
      expiresAt: nowSeconds + 600,
      issuedAt: nowSeconds - 10,
      roles,
      permissions: [],
      scopes: ['openid', 'profile'],
      claims: {},
    };
  }

  function verifier(): TokenVerifier {
    return {
      async verifyAccessToken(token: string) {
        if (token === 'owner') return principal('1');
        if (token === 'non-owner') return principal('2');
        if (token === 'admin') return principal('3', ['admin']);
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
  }

  function buildApp() {
    const socialStore = createSocialCoreStore(undefined, undefined, async (principal) => {
      const id = Number(principal.sub);
      return Number.isFinite(id) && id > 0 ? { id } : null;
    });
    const fundraisingStore = createFundraisingStore(socialStore, { prisma: getTestPrisma() });
    const app = createAppWithDependencies({
      authVerifier: verifier(),
      socialStore,
      fundraisingStore,
    });
    return { app, fundraisingStore, socialStore };
  }

  // Seeded campaign id=1 ("Luna Surgery Support") is owned by user 1 and
  // published (ACTIVE) — the canonical "public, published" fixture.
  const PUBLIC_CAMPAIGN_ID = 1;

  it('lets a guest (no token) read a public, published fundraiser', async () => {
    const { app } = buildApp();

    const res = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PUBLIC_CAMPAIGN_ID);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('lets an authenticated non-owner read a public, published fundraiser', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer non-owner');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PUBLIC_CAMPAIGN_ID);
  });

  it('lets the owner read their own pending-review (pre-publish, non-public) campaign', async () => {
    const { app } = buildApp();

    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer owner')
      .send({
        title: 'Not yet public',
        caption: 'Still under review',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Milo',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING_REVIEW');
    const campaignId = created.body.data.id as number;

    const ownerRead = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer owner');
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.status).toBe('PENDING_REVIEW');

    return { campaignId };
  });

  it('lets a non-owner and a guest read a PENDING_REVIEW campaign, and it appears in the public feed — moderation status and donation eligibility are separate concerns', async () => {
    const { app } = buildApp();

    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer owner')
      .send({
        title: 'Awaiting moderation',
        caption: 'Still under review',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Milo',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    expect(created.body.data.status).toBe('PENDING_REVIEW');
    const campaignId = created.body.data.id as number;

    const nonOwnerRead = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer non-owner');
    expect(nonOwnerRead.status).toBe(200);
    expect(nonOwnerRead.body.data.status).toBe('PENDING_REVIEW');
    expect(nonOwnerRead.body.data.donationAllowed).toBe(true);

    const guestRead = await request(app).get(`/api/v1/fundraising/campaigns/${campaignId}`);
    expect(guestRead.status).toBe(200);
    expect(guestRead.body.data.donationAllowed).toBe(true);

    // A PENDING_REVIEW campaign must appear in the public feed too.
    const feed = await request(app).get('/api/v1/fundraising/feed');
    expect(feed.status).toBe(200);
    expect((feed.body.data.items as Array<{ id: number }>).some((c) => c.id === campaignId)).toBe(
      true,
    );

    // ...and must accept donations.
    const donate = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer non-owner')
      .set('Idempotency-Key', 'donate-pending-review-1')
      .send({
        amount: '5000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(donate.status).toBe(200);
    expect(donate.body.data.donationIntent.status).toBe('PENDING');
  });

  it('blocks a non-owner from reading a DRAFT campaign — 403 FUNDRAISER_NOT_PUBLIC, not leaked as a generic 500', async () => {
    const { app } = buildApp();
    await forceCampaignStatus(app, PUBLIC_CAMPAIGN_ID, 'DRAFT');

    const nonOwnerRead = await request(app)
      .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer non-owner');
    expect(nonOwnerRead.status).toBe(403);
    expect(nonOwnerRead.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');

    const guestRead = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(guestRead.status).toBe(403);
    expect(guestRead.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');

    // A DRAFT campaign must never appear in the public feed either.
    const feed = await request(app).get('/api/v1/fundraising/feed');
    expect(feed.status).toBe(200);
    expect(
      (feed.body.data.items as Array<{ id: number }>).some((c) => c.id === PUBLIC_CAMPAIGN_ID),
    ).toBe(false);
  });

  it('lets an admin/moderator read a campaign that is not theirs and not public', async () => {
    const { app } = buildApp();

    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer owner')
      .send({
        title: 'Needs moderation',
        caption: 'Pending review',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Milo',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    const campaignId = created.body.data.id as number;

    const adminRead = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer admin');
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data.id).toBe(campaignId);
  });

  it('blocks a non-owner from reading an archived campaign, but the owner can still read it', async () => {
    const { app } = buildApp();
    await forceCampaignStatus(app, PUBLIC_CAMPAIGN_ID, 'ARCHIVED');

    const nonOwner = await request(app)
      .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer non-owner');
    expect(nonOwner.status).toBe(403);
    expect(nonOwner.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');

    const owner = await request(app)
      .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer owner');
    expect(owner.status).toBe(200);
    expect(owner.body.data.status).toBe('ARCHIVED');

    // Archived campaigns must not appear in the public feed for a non-owner.
    const feed = await request(app)
      .get('/api/v1/fundraising/feed')
      .set('Authorization', 'Bearer non-owner');
    expect(
      (feed.body.data.items as Array<{ id: number }>).some((c) => c.id === PUBLIC_CAMPAIGN_ID),
    ).toBe(false);
  });

  it('returns 404 FUNDRAISER_NOT_FOUND for a deleted campaign, for owner and non-owner alike', async () => {
    const { app } = buildApp();

    const deleted = await request(app)
      .delete(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer owner');
    expect(deleted.status).toBe(200);

    const ownerRead = await request(app)
      .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer owner');
    expect(ownerRead.status).toBe(404);
    expect(ownerRead.body.error.code).toBe('FUNDRAISER_NOT_FOUND');

    const guestRead = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(guestRead.status).toBe(404);
    expect(guestRead.body.error.code).toBe('FUNDRAISER_NOT_FOUND');
  });

  it('keeps the public feed and detail endpoint in sync: every campaign in the guest feed opens successfully for the same guest', async () => {
    const { app } = buildApp();

    const feed = await request(app).get('/api/v1/fundraising/feed');
    expect(feed.status).toBe(200);
    const items = feed.body.data.items as Array<{ id: number; status: string }>;
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      const detail = await request(app).get(`/api/v1/fundraising/campaigns/${item.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.id).toBe(item.id);
    }
  });

  it('resolves a shared-link-style numeric campaign id the same way the detail route does', async () => {
    const { app } = buildApp();

    // Simulates Flutter's ShareService/deep-link path, which shares and
    // re-resolves the same numeric `id` field the list/detail payloads use
    // — not `publicId` or any other identifier.
    const detail = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(detail.status).toBe(200);
    const canonicalId = detail.body.data.id as number;

    const reopened = await request(app).get(`/api/v1/fundraising/campaigns/${canonicalId}`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.id).toBe(canonicalId);
  });

  it('checks donation eligibility separately from read access — a publicly readable but fully-funded campaign cannot be donated to', async () => {
    const { app, fundraisingStore } = buildApp();
    // Force the seeded public campaign to look fully funded while remaining ACTIVE/public.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaign = (fundraisingStore as any).state.campaigns.get(PUBLIC_CAMPAIGN_ID);
    campaign.targetAmountMinor = 1000n;
    campaign.stats.raisedAmountMinor = 1000n;

    const readable = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(readable.status).toBe(200);

    const donate = await request(app)
      .post(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}/donate`)
      .set('Authorization', 'Bearer non-owner')
      .set('Idempotency-Key', 'donate-eligibility-1')
      .send({
        amount: '5000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(donate.status).toBe(422);
    expect(donate.body.error.code).toBe('FUNDRAISER_NOT_DONATABLE');
  });

  it('blocks donation to a non-public (archived) campaign with the same visibility check used for reads', async () => {
    const { app } = buildApp();
    await forceCampaignStatus(app, PUBLIC_CAMPAIGN_ID, 'ARCHIVED');

    const donate = await request(app)
      .post(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}/donate`)
      .set('Authorization', 'Bearer non-owner')
      .set('Idempotency-Key', 'donate-archived-1')
      .send({
        amount: '5000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(donate.status).toBe(403);
    expect(donate.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');
  });

  it.each(['REJECTED', 'CANCELLED'])(
    'donationAllowed is false and donation is blocked for a %s campaign',
    async (status) => {
      const { app } = buildApp();
      await forceCampaignStatus(app, PUBLIC_CAMPAIGN_ID, status);

      const nonOwnerRead = await request(app)
        .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
        .set('Authorization', 'Bearer non-owner');
      expect(nonOwnerRead.status).toBe(403);
      expect(nonOwnerRead.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');

      const donate = await request(app)
        .post(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}/donate`)
        .set('Authorization', 'Bearer non-owner')
        .set('Idempotency-Key', `donate-${status}-1`)
        .send({
          amount: '5000',
          currencyCode: 'BDT',
          returnUrl: 'https://app.example/return',
          cancelUrl: 'https://app.example/cancel',
          consentAccepted: true,
        });
      expect(donate.status).toBe(403);
      expect(donate.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');
    },
  );

  it('an EXPIRED campaign stays publicly visible (donationAllowed: false) but blocks new donations', async () => {
    const { app } = buildApp();
    await forceCampaignStatus(app, PUBLIC_CAMPAIGN_ID, 'EXPIRED');

    const read = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(read.status).toBe(200);
    expect(read.body.data.donationAllowed).toBe(false);
    expect(read.body.data.acceptingDonations).toBe(false);
    expect(read.body.data.canDonate).toBe(false);

    const donate = await request(app)
      .post(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}/donate`)
      .set('Authorization', 'Bearer non-owner')
      .set('Idempotency-Key', 'donate-expired-1')
      .send({
        amount: '5000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(donate.status).toBe(422);
    expect(donate.body.error.code).toBe('FUNDRAISER_NOT_DONATABLE');
  });

  it('an ACTIVE, donatable campaign reports donationAllowed: true in both feed and detail', async () => {
    const { app } = buildApp();

    const detail = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.donationAllowed).toBe(true);

    const feed = await request(app).get('/api/v1/fundraising/feed');
    expect(feed.status).toBe(200);
    const item = (feed.body.data.items as Array<{ id: number; donationAllowed: boolean }>).find(
      (c) => c.id === PUBLIC_CAMPAIGN_ID,
    );
    expect(item?.donationAllowed).toBe(true);
  });

  it('keeps the public feed available when a campaign owner profile row is missing', async () => {
    const { app } = buildApp();
    await request(app).get('/api/v1/fundraising/feed');
    await getTestPrisma().fundraisingCampaign.update({
      where: { id: PUBLIC_CAMPAIGN_ID },
      data: { ownerUserId: 999999 },
    });

    const feed = await request(app).get('/api/v1/fundraising/feed?limit=20&sort=ENDING_SOON');

    expect(feed.status).toBe(200);
    const item = (feed.body.data.items as Array<{ id: number; author: { id: number } }>).find(
      (campaign) => campaign.id === PUBLIC_CAMPAIGN_ID,
    );
    expect(item).toBeDefined();
  });

  it.each(['SUSPENDED', 'DEACTIVATED'])(
    'excludes %s-account campaigns from the public feed and detail route',
    async (accountStatus) => {
      const { app } = buildApp();
      await request(app).get('/api/v1/fundraising/feed');
      await getTestPrisma().fundraisingVerificationAccount.update({
        where: { ownerUserId: 1 },
        data: { status: accountStatus as 'SUSPENDED' | 'DEACTIVATED' },
      });

      const feed = await request(app).get('/api/v1/fundraising/feed');
      expect(feed.status).toBe(200);
      expect(
        (feed.body.data.items as Array<{ id: number }>).some((c) => c.id === PUBLIC_CAMPAIGN_ID),
      ).toBe(false);

      const detail = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
      expect(detail.status).toBe(403);
      expect(detail.body.error.code).toBe('FUNDRAISER_NOT_PUBLIC');
    },
  );

  it('supports server-side filters, sorting, pagination, and stable string serialization', async () => {
    const { app } = buildApp();
    const createCampaign = async (
      title: string,
      category: string,
      deadline: string,
      raisedAmountMinor: bigint,
      donorsCount: number,
    ) => {
      const created = await request(app)
        .post('/api/v1/fundraising/campaigns')
        .set('Authorization', 'Bearer owner')
        .send({
          title,
          caption: `${title} caption`,
          category,
          fundingMode: 'ONE_TIME',
          currencyCode: 'BDT',
          targetAmountMinor: '50000',
          beneficiaryType: 'PET',
          beneficiaryName: title,
          urgency: 'HIGH',
          locationText: 'Dhaka',
          deadline,
          mediaIds: [1],
        });
      expect(created.status).toBe(201);
      await getTestPrisma().fundraisingCampaign.update({
        where: { id: created.body.data.id as number },
        data: {
          raisedAmountMinor,
          donorsCount,
        },
      });
      return created.body.data.id as number;
    };

    const firstId = await createCampaign(
      'Filter A',
      'TREATMENT',
      '2026-08-05T00:00:00.000Z',
      20000n,
      2,
    );
    const secondId = await createCampaign(
      'Filter B',
      'TREATMENT',
      '2026-08-03T00:00:00.000Z',
      40000n,
      4,
    );
    await createCampaign('Filter C', 'RESCUE', '2026-08-10T00:00:00.000Z', 10000n, 1);

    const filtered = await request(app).get(
      '/api/v1/fundraising/feed?category=TREATMENT&urgency=HIGH&sort=MOST_FUNDED&limit=1',
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].id).toBe(secondId);
    expect(typeof filtered.body.data.items[0].targetAmountMinor).toBe('string');
    expect(typeof filtered.body.data.items[0].createdAt).toBe('string');
    expect(filtered.body.data.nextCursor).toBe(String(secondId));

    const pageTwo = await request(app).get(
      `/api/v1/fundraising/feed?category=TREATMENT&urgency=HIGH&sort=MOST_FUNDED&limit=1&cursor=${filtered.body.data.nextCursor}`,
    );
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.data.items).toHaveLength(1);
    expect(pageTwo.body.data.items[0].id).toBe(firstId);
    expect(pageTwo.body.data.items[0].id).not.toBe(filtered.body.data.items[0].id);

    const endingSoon = await request(app).get(
      '/api/v1/fundraising/feed?category=TREATMENT&sort=ENDING_SOON&limit=2',
    );
    expect(endingSoon.status).toBe(200);
    expect((endingSoon.body.data.items as Array<{ id: number }>).map((item) => item.id)).toEqual([
      secondId,
      firstId,
    ]);
  });
});
