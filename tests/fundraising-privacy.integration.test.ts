import { createHmac } from 'node:crypto';

import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

function webhookSignature(input: {
  provider: string;
  eventId: string;
  referenceId: string;
  status: string;
  amountMinor: string | number | bigint;
  currencyCode: string;
  providerPaymentId?: string | null;
  payload: Record<string, unknown>;
}): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(input.payload).sort()) {
    ordered[key] = input.payload[key];
  }
  const payload = JSON.stringify(ordered);
  return createHmac('sha256', 'local-dev-fundraising-secret')
    .update(
      [
        input.provider,
        input.eventId,
        input.referenceId,
        input.status,
        String(input.amountMinor),
        input.currencyCode,
        input.providerPaymentId ?? '',
        payload,
      ].join('|'),
    )
    .digest('hex');
}

/**
 * Privacy/authorization hardening tests for the fundraising campaign
 * feed/detail responses and the verification account endpoints.
 *
 * Root cause under test: `campaignPayload()` used to embed the complete
 * `FundraisingOwnerVerificationAccount` (identity numbers, DOB, addresses,
 * documents, raw media) into every campaign response — including the two
 * routes that allow unauthenticated (`optional`) access. These tests prove
 * the public projection never leaks those fields, and that the full
 * account is reachable only by its owner or an authorized reviewer/admin.
 */
describe('fundraising privacy and authorization hardening', () => {
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
        if (token === 'manager') return principal('4', ['fundraising-manager']);
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

  // Seeded campaign id=1 is owned by user 1, whose seed account is VERIFIED
  // and carries a full identity/document fixture (nationalIdNumber, DOB,
  // a PRIMARY document, etc.) — the canonical "has something to leak" case.
  const PUBLIC_CAMPAIGN_ID = 1;

  const SENSITIVE_ACCOUNT_KEYS = [
    'nationalIdNumber',
    'birthRegNumber',
    'passportNumber',
    'studentIdNumber',
    'drivingLicenceNumber',
    'dateOfBirth',
    'presentAddress',
    'permanentAddress',
    'documents',
    'verificationDraftJson',
    'rejectionReason',
    'primaryDocumentType',
    'occupation',
    'divisionId',
    'districtId',
    'upazilaId',
    'unionId',
    'areaId',
    'formattedAddress',
    'addressLine',
    'id', // internal account id — not required publicly
  ];

  function assertNoSensitiveAccountFields(account: unknown): void {
    expect(account).toBeDefined();
    expect(account).not.toBeNull();
    const keys = Object.keys(account as Record<string, unknown>);
    for (const sensitiveKey of SENSITIVE_ACCOUNT_KEYS) {
      expect(keys).not.toContain(sensitiveKey);
    }
    // Only the explicit public-safe projection may be present.
    expect(keys.sort()).toEqual(['status', 'verified']);
  }

  it('never exposes sensitive identity/document fields in the public feed (no auth)', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/api/v1/fundraising/feed');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      assertNoSensitiveAccountFields(item.account);
    }
  });

  it('never exposes sensitive identity/document fields in the public campaign detail (no auth)', async () => {
    const { app } = buildApp();

    const res = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(res.status).toBe(200);
    assertNoSensitiveAccountFields(res.body.data.account);

    const serialized = JSON.stringify(res.body);
    // The seed owner's identity number / DOB must not appear anywhere in
    // the response body, not just outside the `account` key.
    expect(serialized).not.toContain('SEED-NID-0001');
    expect(serialized).not.toContain('1995-01-01'); // seed dateOfBirth
  });

  it('never exposes sensitive fields to an authenticated non-owner viewer', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer non-owner');

    expect(res.status).toBe(200);
    assertNoSensitiveAccountFields(res.body.data.account);
  });

  it('still surfaces the safe owner summary the app needs (verified badge + status)', async () => {
    const { app } = buildApp();

    const res = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account).toEqual({ verified: true, status: 'VERIFIED' });
    expect(res.body.data.isAccountVerified).toBe(true);
    // Legitimate campaign post media (photos of the fundraiser) must remain
    // — this hardening only removes the *verification account's* documents.
    expect(Array.isArray(res.body.data.media)).toBe(true);
  });

  it('media metadata for verification documents cannot be enumerated through campaign responses', async () => {
    const { app } = buildApp();

    const feed = await request(app).get('/api/v1/fundraising/feed');
    const detail = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);

    for (const body of [feed.body, detail.body]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('"mediaId"');
      expect(serialized).not.toContain('"documentType"');
      expect(serialized).not.toContain('Verification document');
    }
  });

  it('lets the owner retrieve their own full verification account', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/v1/fundraising/accounts/1')
      .set('Authorization', 'Bearer owner');

    expect(res.status).toBe(200);
    expect(res.body.data.nationalIdNumber).toBe('SEED-NID-0001');
    expect(res.body.data.dateOfBirth).toBe('1995-01-01');
    expect(Array.isArray(res.body.data.documents)).toBe(true);
    expect(res.body.data.documents.length).toBeGreaterThan(0);
  });

  it("rejects an unrelated authenticated user from reading someone else's verification account", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/v1/fundraising/accounts/1')
      .set('Authorization', 'Bearer non-owner');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_DENIED');
    expect(res.body.data?.nationalIdNumber).toBeUndefined();
  });

  it('rejects an unauthenticated caller from reading any verification account (typed 401)', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/api/v1/fundraising/accounts/1');

    expect(res.status).toBe(401);
  });

  it("allows an authorized admin reviewer to read another user's verification account", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/v1/fundraising/accounts/1')
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(200);
    expect(res.body.data.nationalIdNumber).toBe('SEED-NID-0001');
  });

  it('rejects a caller with an unrelated role/permission from reviewer access', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/v1/fundraising/accounts/1')
      .set('Authorization', 'Bearer manager');

    expect(res.status).toBe(403);
  });

  it('returns 404 (not a data leak) when the target account does not exist', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/v1/fundraising/accounts/999999')
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(404);
  });

  // Root cause under test: `donorPayload()` in fundraising-store.ts ignored
  // `intent.isAnonymous` entirely and always resolved+returned the real
  // donor's profile, in both the "last 3 donors" campaign-detail widget and
  // the full donation list. Fixed to substitute a neutral "Anonymous Donor"
  // profile (id: null, no avatar) for any viewer other than the donor
  // themself when isAnonymous is true.
  it('shows "Anonymous Donor" for an anonymous donation to other viewers, but the real donor to themself', async () => {
    const { app } = buildApp();

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer owner')
      .send({
        title: 'Anonymous donor visibility fundraiser',
        caption: 'Privacy check',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(campaign.status).toBe(201);
    const campaignId = campaign.body.data.id;

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer non-owner')
      .set('Idempotency-Key', 'anon-donation-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        supportMessage: 'Stay strong',
        paymentMethodLabel: 'Card',
        consentAccepted: true,
        isAnonymous: true,
      });
    expect(donation.status).toBe(200);
    const referenceId = donation.body.data.donationIntent.referenceId;

    const webhookPayload = {
      provider: 'mockpay',
      eventId: 'evt-anon-1',
      referenceId,
      status: 'SUCCEEDED',
      amountMinor: '10000',
      currencyCode: 'BDT',
      providerPaymentId: 'pp-anon-1',
    };
    const signature = webhookSignature({ ...webhookPayload, payload: webhookPayload });
    const webhook = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(webhookPayload);
    expect(webhook.status).toBe(200);
    expect(webhook.body.data.donationIntent.status).toBe('SUCCEEDED');

    // 1) Campaign detail's "last 3 donors" widget, viewed by a stranger.
    const detailAsStranger = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer owner');
    expect(detailAsStranger.status).toBe(200);
    const donorsAsStranger = detailAsStranger.body.data.last3Donors as Array<
      Record<string, unknown>
    >;
    expect(donorsAsStranger.length).toBeGreaterThan(0);
    for (const donor of donorsAsStranger) {
      const profile = donor.profile as Record<string, unknown>;
      expect(profile.displayName).toBe('Anonymous Donor');
      expect(donor.id).toBeNull();
      // Never leaks the real donor's identity, email, or username.
      expect(JSON.stringify(donor)).not.toContain('@');
    }

    // 2) Full donation list, viewed by a stranger (the campaign owner).
    const listAsStranger = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}/donations`)
      .set('Authorization', 'Bearer owner');
    expect(listAsStranger.status).toBe(200);
    const itemsAsStranger = listAsStranger.body.data.items as Array<Record<string, unknown>>;
    expect(itemsAsStranger.length).toBeGreaterThan(0);
    for (const item of itemsAsStranger) {
      const profile = (item.donor as Record<string, unknown>).profile as Record<string, unknown>;
      expect(profile.displayName).toBe('Anonymous Donor');
    }

    // 3) The donor viewing their OWN donation still sees their real profile
    // (isAnonymous only hides identity from other viewers, not from the
    // donor's own history).
    const listAsDonor = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}/donations`)
      .set('Authorization', 'Bearer non-owner');
    expect(listAsDonor.status).toBe(200);
    const itemsAsDonor = listAsDonor.body.data.items as Array<Record<string, unknown>>;
    expect(itemsAsDonor.length).toBeGreaterThan(0);
    const ownDonation = itemsAsDonor.find(
      (item) => (item.donor as Record<string, unknown>).id === 2,
    );
    expect(ownDonation).toBeDefined();
    const ownProfile = (ownDonation!.donor as Record<string, unknown>).profile as Record<
      string,
      unknown
    >;
    expect(ownProfile.displayName).not.toBe('Anonymous Donor');
  });

  // Root cause under test: campaignPayload()'s author/post.author/
  // last3Donors[].profile embedded the FULL raw social-store profile
  // (bio, education, gender, birthdate, maritalStatus, showEmail,
  // showPhone, isLocked) whenever the target's profile visibility was
  // PUBLIC — the fundraising author/donor embeds are meant to use only
  // the safe PublicAuthor projection, same as Adoption.
  const SAFE_AUTHOR_KEYS = ['id', 'publicId', 'displayName', 'username', 'avatarUrl'];

  function assertOnlySafeAuthorKeys(profile: unknown, label: string): void {
    expect(profile).toBeDefined();
    const keys = Object.keys(profile as Record<string, unknown>);
    const unsafeKeys = keys.filter((key) => !SAFE_AUTHOR_KEYS.includes(key));
    expect(unsafeKeys).toEqual([]);
    if (unsafeKeys.length > 0) {
      throw new Error(`${label} leaked unsafe keys: ${unsafeKeys.join(', ')}`);
    }
  }

  it('fundraising feed/detail author and last3Donors expose only the safe PublicAuthor projection', async () => {
    const { app } = buildApp();

    const feed = await request(app).get('/api/v1/fundraising/feed');
    expect(feed.status).toBe(200);
    const feedItems = feed.body.data.items as Array<Record<string, unknown>>;
    expect(feedItems.length).toBeGreaterThan(0);
    for (const item of feedItems) {
      const author = item.author as Record<string, unknown>;
      assertOnlySafeAuthorKeys(author.profile, 'feed item author.profile');
      const postAuthor = (item.post as Record<string, unknown>).author as Record<string, unknown>;
      assertOnlySafeAuthorKeys(postAuthor.profile, 'feed item post.author.profile');
    }

    const detail = await request(app).get(`/api/v1/fundraising/campaigns/${PUBLIC_CAMPAIGN_ID}`);
    expect(detail.status).toBe(200);
    const detailAuthor = detail.body.data.author as Record<string, unknown>;
    assertOnlySafeAuthorKeys(detailAuthor.profile, 'campaign detail author.profile');
    const last3Donors = detail.body.data.last3Donors as Array<Record<string, unknown>>;
    for (const donor of last3Donors) {
      assertOnlySafeAuthorKeys(donor.profile, 'last3Donors[].profile');
    }

    // Belt-and-suspenders: none of these sensitive field names appear
    // anywhere in the serialized author/donor embeds.
    const serialized = JSON.stringify({
      feedAuthors: feedItems.map((i) => i.author),
      detailAuthor,
      last3Donors,
    });
    for (const sensitiveKey of [
      'bio',
      'education',
      'gender',
      'birthdate',
      'maritalStatus',
      'showEmail',
      'showPhone',
      'isLocked',
      'religiousStatus',
      'placeLive',
    ]) {
      expect(serialized).not.toContain(`"${sensitiveKey}"`);
    }
  });
});
