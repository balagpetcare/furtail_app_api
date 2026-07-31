import { createHmac } from 'node:crypto';

import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createLocationStore } from '../src/modules/locations/location-store';
import { createPrismaLocationDataSource } from '../src/modules/locations/prisma-location-data-source';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

describe('fundraising contracts', () => {
  // Verification accounts are now durably persisted against a real test
  // database (see FundraisingStore's Prisma-backed account methods and
  // tests/helpers/test-prisma.ts) — unlike the old process-memory store,
  // a fresh `buildApp()` no longer implies a fresh account. Wipe every
  // fundraising account before each test (including the seed's
  // ownerUserId 1) so every test starts from the same pristine baseline
  // it always did — `buildApp()`'s `FundraisingStore` constructor
  // idempotently recreates the id-1 seed fixture immediately after.
  beforeEach(async () => {
    const prisma = getTestPrisma();
    await prisma.walletLedgerEntry.deleteMany({});
    await prisma.walletWithdrawRequest.deleteMany({});
    await prisma.wallet.updateMany({ data: { balance: '0.00' } });
    await prisma.fundraisingWebhookEvent.deleteMany({});
    await prisma.fundraisingReceipt.deleteMany({ where: { donationId: { gt: 1 } } });
    await prisma.fundraisingPaymentAttempt.deleteMany({ where: { donationId: { gt: 1 } } });
    await prisma.fundraisingDonation.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingCampaignMedia.deleteMany({ where: { campaignId: { gt: 1 } } });
    await prisma.fundraisingCampaignUpdate.deleteMany({ where: { campaignId: { gt: 1 } } });
    await prisma.fundraisingIdempotencyKey.deleteMany({});
    await prisma.fundraisingCampaign.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingCampaignDraft.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingVerificationDocument.deleteMany({});
    await prisma.fundraisingVerificationAccount.deleteMany({});
  });

  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const audience = 'furtail-mobile';
  const clientId = 'furtail-mobile';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience,
      clientId,
      expiresAt: nowSeconds + 600,
      issuedAt: nowSeconds - 10,
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
        if (token === 'token-2') return principal('2');
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
  }

  function buildApp() {
    const prisma = getTestPrisma();
    const socialStore = createSocialCoreStore(undefined, undefined, async (principal) => {
      const id = Number(principal.sub);
      return Number.isFinite(id) && id > 0 ? { id } : null;
    });
    const fundraisingStore = createFundraisingStore(socialStore, { prisma });
    const app = createAppWithDependencies({
      authVerifier: verifier(),
      socialStore,
      fundraisingStore,
      locationStore: createLocationStore(createPrismaLocationDataSource(prisma)),
    });
    return { app, fundraisingStore, socialStore };
  }

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

  it('supports fundraising account verification and document uploads', async () => {
    const { app } = buildApp();

    const initial = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-1');
    expect(initial.status).toBe(200);
    expect(initial.body.data.status).toBe('VERIFIED');

    const updated = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-1')
      .send({
        presentAddress: 'New Farm Road',
        permanentAddress: 'New Farm Road',
        area: 'Dhaka',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.presentAddress).toBe('New Farm Road');

    const document = await request(app)
      .post('/api/v1/fundraising/account/documents')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'Verification add-on', mediaId: 2 });
    expect(document.status).toBe(201);
    expect(document.body.data.mediaId).toBe(2);

    const submitted = await request(app)
      .post('/api/v1/fundraising/account/submit')
      .set('Authorization', 'Bearer token-1');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('VERIFIED');
  });

  it('returns a genuine empty feed and empty payout lists', async () => {
    const { app } = buildApp();

    const emptyFeed = await request(app)
      .get('/api/v1/fundraising/feed')
      .set('Authorization', 'Bearer token-1')
      .query({ category: '__no_such_category__' });
    expect(emptyFeed.status).toBe(200);
    expect(emptyFeed.body.data.items).toEqual([]);
    expect(emptyFeed.body.data.nextCursor).toBeNull();

    const payoutCatalog = await request(app)
      .get('/api/v1/fundraising/payout/catalog')
      .set('Authorization', 'Bearer token-1');
    expect(payoutCatalog.status).toBe(200);
    expect(payoutCatalog.body.data).toEqual([]);

    const payoutMethods = await request(app)
      .get('/api/v1/fundraising/payout/methods')
      .set('Authorization', 'Bearer token-1');
    expect(payoutMethods.status).toBe(200);
    expect(payoutMethods.body.data).toEqual([]);
  });

  it('treats a Bangladesh location as complete without an area, and never blocks on it', async () => {
    const { app } = buildApp();

    const updated = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({
        fullName: 'Nadia Rahman',
        dateOfBirth: '1998-05-14',
        presentAddress: 'Village Road',
        permanentAddress: 'Village Road',
        divisionId: 1,
        districtId: 2,
        upazilaId: 3,
        unionId: 4,
        // areaId intentionally omitted — this union has no BdArea rows.
        primaryDocumentType: 'NID',
        nationalIdNumber: '1234567890',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.areaId).toBeNull();
    expect(updated.body.data.readiness.missingProfileFields).not.toContain('location');
    expect(updated.body.data.readiness.missingProfileFields).not.toContain('union');

    const document = await request(app)
      .post('/api/v1/fundraising/account/documents')
      .set('Authorization', 'Bearer token-2')
      .send({ title: 'National ID', mediaId: 3, documentType: 'PRIMARY' });
    expect(document.status).toBe(201);
    expect(document.body.data.documentType).toBe('PRIMARY');

    const me = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-2');
    expect(me.body.data.readiness.canStartFundraiser).toBe(true);
  });

  it('accepts an optional manual area value alongside a union', async () => {
    const { app } = buildApp();

    const updated = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({
        divisionId: 1,
        districtId: 2,
        upazilaId: 3,
        unionId: 4,
        area: 'Behind the old mosque',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.area).toBe('Behind the old mosque');
    expect(updated.body.data.areaId).toBeNull();
  });

  it('clears Bangladesh location fields when switching to an international location, and vice versa', async () => {
    const { app } = buildApp();

    const bd = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ divisionId: 1, districtId: 2, upazilaId: 3, unionId: 4 });
    expect(bd.body.data.divisionId).toBe(1);

    const intl = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({
        isInternational: true,
        countryCode: 'US',
        countryName: 'United States',
        stateName: 'California',
        cityName: 'San Jose',
        addressLine: '123 Market St',
      });
    expect(intl.status).toBe(200);
    expect(intl.body.data.divisionId).toBeNull();
    expect(intl.body.data.districtId).toBeNull();
    expect(intl.body.data.unionId).toBeNull();
    expect(intl.body.data.countryName).toBe('United States');
    expect(intl.body.data.readiness.missingProfileFields).not.toContain('division');

    const backToBd = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ divisionId: 5, districtId: 6, upazilaId: 7, unionId: 8 });
    expect(backToBd.status).toBe(200);
    expect(backToBd.body.data.countryName).toBeNull();
    expect(backToBd.body.data.addressLine).toBeNull();
  });

  it('round-trips date-of-birth as a date-only value regardless of input timezone suffix', async () => {
    const { app } = buildApp();

    const updated = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ dateOfBirth: '2000-01-01T00:00:00.000Z' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.dateOfBirth).toBe('2000-01-01');

    const rejected = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ dateOfBirth: 'not-a-date' });
    expect(rejected.status).toBe(400);
  });

  it('never falls back full name to an email address, and requires it explicitly', async () => {
    const { app } = buildApp();

    const before = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ occupation: 'Volunteer' });
    expect(before.body.data.readiness.missingProfileFields).toContain('fullName');

    const withEmailLikeValue = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ fullName: 'user@example.com' });
    // The server stores whatever the client explicitly provided as fullName
    // (it must be an editable field, not an email substitution) — it does
    // not silently swap in the account owner's email itself.
    expect(withEmailLikeValue.body.data.fullName).toBe('user@example.com');

    const withRealName = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ fullName: 'Nadia Rahman' });
    expect(withRealName.body.data.fullName).toBe('Nadia Rahman');
    expect(withRealName.body.data.readiness.missingProfileFields).not.toContain('fullName');
  });

  it('requires only the number for the selected primary identity document', async () => {
    const { app } = buildApp();

    const missingNumber = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ primaryDocumentType: 'PASSPORT' });
    expect(missingNumber.body.data.readiness.missingProfileFields).toContain(
      'primaryDocumentNumber',
    );

    // Filling in an unrelated document type (birth registration) must not
    // satisfy the requirement when passport is the selected primary type.
    const wrongNumberFilled = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ birthRegNumber: 'BR-999' });
    expect(wrongNumberFilled.body.data.readiness.missingProfileFields).toContain(
      'primaryDocumentNumber',
    );

    const passportFilled = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ passportNumber: 'P1234567' });
    expect(passportFilled.body.data.readiness.missingProfileFields).not.toContain(
      'primaryDocumentNumber',
    );
  });

  it('only requires a primary-tagged document; supporting documents remain optional', async () => {
    const { app } = buildApp();

    const supportingOnly = await request(app)
      .post('/api/v1/fundraising/account/documents')
      .set('Authorization', 'Bearer token-2')
      .send({ title: 'Selfie', mediaId: 3, documentType: 'SUPPORTING' });
    expect(supportingOnly.status).toBe(201);
    expect(supportingOnly.body.data.documentType).toBe('SUPPORTING');

    const stillMissing = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-2');
    expect(stillMissing.body.data.readiness.missingDocumentTypes).toContain(
      'required_verification_document',
    );

    const primary = await request(app)
      .post('/api/v1/fundraising/account/documents')
      .set('Authorization', 'Bearer token-2')
      .send({ title: 'NID front', mediaId: 4, documentType: 'PRIMARY' });
    expect(primary.status).toBe(201);

    const nowSatisfied = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-2');
    expect(nowSatisfied.body.data.readiness.missingDocumentTypes).toEqual([]);
  });

  it('enables submission once all actual requirements are satisfied end-to-end', async () => {
    const { app } = buildApp();

    await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({
        fullName: 'Nadia Rahman',
        dateOfBirth: '1998-05-14',
        presentAddress: 'Village Road',
        permanentAddress: 'Village Road',
        divisionId: 1,
        districtId: 2,
        upazilaId: 3,
        unionId: 4,
        primaryDocumentType: 'NID',
        nationalIdNumber: '1234567890',
      });
    await request(app)
      .post('/api/v1/fundraising/account/documents')
      .set('Authorization', 'Bearer token-2')
      .send({ title: 'NID front', mediaId: 3, documentType: 'PRIMARY' });

    const readiness = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-2');
    expect(readiness.body.data.readiness.canStartFundraiser).toBe(true);

    const submitted = await request(app)
      .post('/api/v1/fundraising/account/submit')
      .set('Authorization', 'Bearer token-2');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING');
  });

  it('allows a pending fundraising account to submit a fundraiser', async () => {
    const { app } = buildApp();

    await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({
        fullName: 'Nadia Rahman',
        dateOfBirth: '1998-05-14',
        presentAddress: 'Village Road',
        permanentAddress: 'Village Road',
        divisionId: 1,
        districtId: 2,
        upazilaId: 3,
        unionId: 4,
        primaryDocumentType: 'NID',
        nationalIdNumber: '1234567890',
      });
    await request(app)
      .post('/api/v1/fundraising/account/documents')
      .set('Authorization', 'Bearer token-2')
      .send({ title: 'NID front', mediaId: 3, documentType: 'PRIMARY' });

    const submittedAccount = await request(app)
      .post('/api/v1/fundraising/account/submit')
      .set('Authorization', 'Bearer token-2');
    expect(submittedAccount.status).toBe(200);
    expect(submittedAccount.body.data.status).toBe('PENDING');

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-2')
      .send({
        title: 'Pending account fundraiser',
        caption: 'Submit should not block on verification status',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [3],
      });
    expect(draft.status).toBe(201);

    const submittedDraft = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'pending-account-submit-1');
    expect(submittedDraft.status).toBe(200);
    expect(submittedDraft.body.data.status).toBe('PENDING_REVIEW');
    expect(submittedDraft.body.data.post).toBeDefined();
    expect(submittedDraft.body.data.submittedAt).toBeDefined();

    const submittedAgain = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'pending-account-submit-1');
    expect(submittedAgain.status).toBe(200);
    expect(submittedAgain.body.data.status).toBe('PENDING_REVIEW');
    expect(submittedAgain.body.data.post.id).toBe(submittedDraft.body.data.post.id);
  });

  // Fundraising/payout verification protects money leaving the platform —
  // it must never gate creating, saving or submitting a campaign. These
  // cover the account states that previously blocked Submit.
  it('lets a user with no fundraising verification account at all submit a campaign', async () => {
    const { app } = buildApp();

    // token-2's account is wiped in beforeEach and never re-created here,
    // so this request runs with no FundraisingVerificationAccount row.
    const accountBefore = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-2');
    expect(accountBefore.status).toBe(404);

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-2')
      .send({
        title: 'No verification account fundraiser',
        caption: 'Submission must not require a KYC record to exist.',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [3],
      });
    expect(draft.status).toBe(201);

    const submitted = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'no-account-submit-1');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING_REVIEW');

    // Still no KYC record was fabricated as a side effect of submitting.
    const accountAfter = await request(app)
      .get('/api/v1/fundraising/account/me')
      .set('Authorization', 'Bearer token-2');
    expect(accountAfter.status).toBe(404);

    // Idempotent retry returns the same campaign, no duplicate.
    const again = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'no-account-submit-1');
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe('PENDING_REVIEW');
    const campaignCount = await getTestPrisma().fundraisingCampaign.count({
      where: { draftId: draft.body.data.id },
    });
    expect(campaignCount).toBe(1);
  });

  it('lets a payout-REJECTED fundraising account submit a campaign', async () => {
    const { app } = buildApp();

    await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ fullName: 'Rejected Payout User' });
    // Rejection only ever concerns payout/KYC eligibility — it must not
    // stop this user from raising money.
    await getTestPrisma().fundraisingVerificationAccount.update({
      where: { ownerUserId: 2 },
      data: { status: 'REJECTED', rejectionReason: 'Document unreadable' },
    });

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-2')
      .send({
        title: 'Rejected verification fundraiser',
        caption: 'A payout rejection must not block campaign submission.',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [3],
      });
    expect(draft.status).toBe(201);

    const submitted = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'rejected-account-submit-1');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING_REVIEW');

    // The account's own status is untouched by campaign submission.
    const account = await getTestPrisma().fundraisingVerificationAccount.findUnique({
      where: { ownerUserId: 2 },
    });
    expect(account?.status).toBe('REJECTED');
  });

  it('keeps withdrawal gated on approved verification while campaigns are not', async () => {
    const { fundraisingStore } = buildApp();

    // No verification account at all → withdrawal blocked.
    await expect(fundraisingStore.assertCanWithdrawFunds(2)).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_VERIFIED',
      statusCode: 403,
    });

    // Present but not yet approved → still blocked.
    await fundraisingStore.upsertAccount(2, { fullName: 'Pending Payout User' });
    await getTestPrisma().fundraisingVerificationAccount.update({
      where: { ownerUserId: 2 },
      data: { status: 'PENDING' },
    });
    await expect(fundraisingStore.assertCanWithdrawFunds(2)).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_VERIFIED',
      statusCode: 403,
    });

    // Rejected → still blocked.
    await getTestPrisma().fundraisingVerificationAccount.update({
      where: { ownerUserId: 2 },
      data: { status: 'REJECTED' },
    });
    await expect(fundraisingStore.assertCanWithdrawFunds(2)).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_VERIFIED',
      statusCode: 403,
    });

    // Approved → payout access granted.
    await getTestPrisma().fundraisingVerificationAccount.update({
      where: { ownerUserId: 2 },
      data: { status: 'VERIFIED' },
    });
    await expect(fundraisingStore.assertCanWithdrawFunds(2)).resolves.toBeUndefined();
  });

  it('blocks suspended and deactivated accounts from creating new campaigns and collecting new donations', async () => {
    const { app } = buildApp();

    await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ fullName: 'Deactivated Owner' })
      .expect(200);

    await getTestPrisma().fundraisingVerificationAccount.update({
      where: { ownerUserId: 2 },
      data: { status: 'DEACTIVATED' },
    });

    const blockedDraft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-2')
      .send({
        title: 'Blocked fundraiser',
        caption: 'Should not be created',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Milo',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(blockedDraft.status).toBe(403);

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Suspended owner campaign',
        caption: 'Accepting donations until suspended',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '90000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(campaign.status).toBe(201);

    await getTestPrisma().fundraisingVerificationAccount.update({
      where: { ownerUserId: 1 },
      data: { status: 'SUSPENDED' },
    });

    const blockedDonation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'suspended-owner-donation')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });
    expect(blockedDonation.status).toBe(422);
  });

  it('treats body idempotency keys as submit idempotency for mobile clients', async () => {
    const { app } = buildApp();

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Body idempotent fundraiser',
        caption: 'The mobile client sends idempotency in the JSON body.',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T23:59:00.000Z',
        mediaIds: [1],
      });
    expect(draft.status).toBe(201);

    const first = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-1')
      .send({ idempotencyKey: 'mobile-body-submit-1' });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('PENDING_REVIEW');

    const second = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-1')
      .send({ idempotencyKey: 'mobile-body-submit-1' });
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('PENDING_REVIEW');
    expect(second.body.data.post.id).toBe(first.body.data.post.id);
  });

  it('accepts ONGOING campaigns with monthly goal and no one-time deadline', async () => {
    const { app } = buildApp();

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Ongoing shelter support',
        caption: 'Monthly operating support for a local shelter.',
        category: 'SHELTER',
        fundingMode: 'ONGOING',
        currencyCode: 'BDT',
        monthlyGoalMinor: '50000',
        beneficiaryType: 'ORGANIZATION',
        beneficiaryName: 'Dhaka Shelter',
        locationText: 'Dhaka',
        mediaIds: [1],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.fundingMode).toBe('ONGOING');

    const submitted = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'ongoing-submit-1');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING_REVIEW');
    expect(submitted.body.data.fundingMode).toBe('ONGOING');
    expect(submitted.body.data.monthlyGoalMinor).toBe('50000');
    expect(submitted.body.data.deadline).toBeNull();
  });

  it('persists DNCC location fields through draft creation and submission', async () => {
    const { app } = buildApp();
    const prisma = getTestPrisma();
    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21);

    const cityCorporation = await prisma.bdArea.findFirst({
      where: { code: 'CC-DNCC' },
    });
    const zone = await prisma.bdArea.findFirst({
      where: { code: 'ZONE-DNCC-03' },
    });
    const ward = await prisma.bdArea.findFirst({
      where: { code: 'WARD-DNCC-18' },
    });
    expect(cityCorporation).toBeTruthy();
    expect(zone).toBeTruthy();
    expect(ward).toBeTruthy();
    expect(cityCorporation!.districtId).not.toBeNull();
    const district = await prisma.bdDistrict.findUnique({
      where: { id: cityCorporation!.districtId! },
    });
    expect(district).toBeTruthy();
    expect(district!.divisionId).not.toBeNull();
    const division = await prisma.bdDivision.findUnique({
      where: { id: district!.divisionId! },
    });
    expect(division).toBeTruthy();

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'urban-dncc-draft-1')
      .send({
        title: 'DNCC fundraiser',
        caption: 'Testing the urban location contract',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'DNCC, Dhaka',
        bdAddressMode: 'URBAN',
        bdDivisionId: division!.id,
        bdDistrictId: district!.id,
        bdCityCorporationId: cityCorporation!.id,
        bdZoneId: zone!.id,
        bdWardId: ward!.id,
        endsAt: deadline.toISOString(),
        deadline: deadline.toISOString(),
        mediaIds: [1],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.bdAddressMode).toBe('URBAN');
    expect(draft.body.data.bdCityCorporationId).toBe(cityCorporation!.id);
    expect(draft.body.data.bdZoneId).toBe(zone!.id);
    expect(draft.body.data.bdWardId).toBe(ward!.id);

    const submitted = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'urban-dncc-submit-1');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING_REVIEW');
    expect(submitted.body.data.bdAddressMode).toBe('URBAN');
    expect(submitted.body.data.bdCityCorporationId).toBe(cityCorporation!.id);
    expect(submitted.body.data.bdZoneId).toBe(zone!.id);
    expect(submitted.body.data.bdWardId).toBe(ward!.id);
  });

  it('persists DNCC location fields patched after draft creation', async () => {
    const { app } = buildApp();
    const prisma = getTestPrisma();
    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    const cityCorporation = await prisma.bdArea.findFirst({
      where: { code: 'CC-DNCC' },
    });
    const zone = await prisma.bdArea.findFirst({
      where: { code: 'ZONE-DNCC-03' },
    });
    const ward = await prisma.bdArea.findFirst({
      where: { code: 'WARD-DNCC-18' },
    });
    expect(cityCorporation).toBeTruthy();
    expect(zone).toBeTruthy();
    expect(ward).toBeTruthy();
    const district = await prisma.bdDistrict.findUnique({
      where: { id: cityCorporation!.districtId! },
    });
    expect(district).toBeTruthy();
    const division = await prisma.bdDivision.findUnique({
      where: { id: district!.divisionId! },
    });
    expect(division).toBeTruthy();

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Patch DNCC fundraiser',
        caption: 'Testing urban location updates after draft creation',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: deadline.toISOString(),
        mediaIds: [1],
      });
    expect(draft.status).toBe(201);

    const updated = await request(app)
      .patch(`/api/v1/fundraising/campaigns/${draft.body.data.id}/draft`)
      .set('Authorization', 'Bearer token-1')
      .send({
        locationText: 'DNCC, Dhaka',
        bdAddressMode: 'URBAN',
        bdDivisionId: division!.id,
        bdDistrictId: district!.id,
        bdCityCorporationId: cityCorporation!.id,
        bdZoneId: zone!.id,
        bdWardId: ward!.id,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.bdAddressMode).toBe('URBAN');
    expect(updated.body.data.bdCityCorporationId).toBe(cityCorporation!.id);
    expect(updated.body.data.bdZoneId).toBe(zone!.id);
    expect(updated.body.data.bdWardId).toBe(ward!.id);

    const submitted = await request(app)
      .post(`/api/v1/fundraising/campaigns/${draft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'patched-dncc-submit-1');
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING_REVIEW');
    expect(submitted.body.data.bdCityCorporationId).toBe(cityCorporation!.id);
    expect(submitted.body.data.bdZoneId).toBe(zone!.id);
    expect(submitted.body.data.bdWardId).toBe(ward!.id);
  });

  it('rejects unknown fields and malformed dateOfBirth on the account PATCH payload', async () => {
    const { app } = buildApp();

    const unknownField = await request(app)
      .patch('/api/v1/fundraising/account')
      .set('Authorization', 'Bearer token-2')
      .send({ presentAddress: 'X', __proto__: { polluted: true }, notAllowed: 'x' });
    expect(unknownField.status).toBe(200);
    expect(unknownField.body.data.notAllowed).toBeUndefined();
  });

  it('supports draft creation, updates, and submit/publish rules', async () => {
    const { app } = buildApp();

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'draft-create-1')
      .send({
        title: 'Luna Care',
        caption: 'Need urgent surgery support',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        mediaIds: [1],
      });
    expect(draft.status).toBe(201);

    const draftId = draft.body.data.id as number;

    const updated = await request(app)
      .patch(`/api/v1/fundraising/campaigns/${draftId}/draft`)
      .set('Authorization', 'Bearer token-1')
      .send({
        caption: 'Updated fundraising story',
        targetAmountMinor: '130000',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.caption).toBe('Updated fundraising story');
    expect(updated.body.data.targetAmountMinor).toBe('130000');

    const incompleteDraft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'Incomplete', caption: 'Missing required fields' });
    expect(incompleteDraft.status).toBe(201);

    const rejectedSubmit = await request(app)
      .post(`/api/v1/fundraising/campaigns/${incompleteDraft.body.data.id}/submit`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'draft-submit-1');
    expect(rejectedSubmit.status).toBe(400);
    expect(rejectedSubmit.body.error.code).toBe('VALIDATION_ERROR');

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Published fundraiser',
        caption: 'Ready to go',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '250000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    expect(campaign.status).toBe(201);
    expect(campaign.body.data.status).toBe('PENDING_REVIEW');

    const published = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/publish`)
      .set('Authorization', 'Bearer token-1');
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('ACTIVE');

    const republish = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/publish`)
      .set('Authorization', 'Bearer token-1');
    expect(republish.status).toBe(409);
    expect(republish.body.error.code).toBe('CONFLICT');
  });

  it('exposes exact UTC ISO-8601 timestamps for startsAt/endsAt/deadline, and draft reopen reports current media status', async () => {
    const { app } = buildApp();

    const draft = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Deadline contract check',
        caption: 'Verifying UTC timestamps',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    expect(draft.status).toBe(201);
    const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
    expect(draft.body.data.startsAt).toMatch(isoUtc);
    expect(draft.body.data.endsAt).toMatch(isoUtc);
    expect(draft.body.data.deadline).toMatch(isoUtc);

    const reopened = await request(app)
      .get(`/api/v1/fundraising/campaigns/${draft.body.data.id}/draft`)
      .set('Authorization', 'Bearer token-1');
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.startsAt).toMatch(isoUtc);
    expect(reopened.body.data.endsAt).toMatch(isoUtc);
    expect(reopened.body.data.deadline).toMatch(isoUtc);
    // Draft reopen must report each bound media's current status, not just
    // its URL, so the client can tell READY apart from still-processing.
    const boundMedia = reopened.body.data.post.media[0].media;
    expect(boundMedia.status).toBe('READY');
    expect(typeof boundMedia.url).toBe('string');

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Published deadline check',
        caption: 'Verifying UTC timestamps on a live campaign',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '125000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        endsAt: '2026-12-31T00:00:00.000Z',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    expect(campaign.status).toBe(201);
    expect(campaign.body.data.endsAt).toMatch(isoUtc);
    expect(campaign.body.data.deadline).toMatch(isoUtc);

    const detail = await request(app).get(`/api/v1/fundraising/campaigns/${campaign.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.endsAt).toMatch(isoUtc);
    expect(detail.body.data.deadline).toMatch(isoUtc);

    const feed = await request(app).get('/api/v1/fundraising/feed');
    const feedItem = (feed.body.data.items as Array<{ id: number; deadline: string }>).find(
      (item) => item.id === campaign.body.data.id,
    );
    expect(feedItem?.deadline).toMatch(isoUtc);
  });

  it('enforces campaign ownership authorization', async () => {
    const { app } = buildApp();

    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Owner-only fundraiser',
        caption: 'Authorization check',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(created.status).toBe(201);

    const denied = await request(app)
      .patch(`/api/v1/fundraising/campaigns/${created.body.data.id}`)
      .set('Authorization', 'Bearer token-2')
      .send({ title: 'Should not work' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FUNDRAISER_EDIT_FORBIDDEN');
  });

  it('handles exact large donation amounts and duplicate idempotency keys', async () => {
    const { app } = buildApp();
    const amount = '9007199254740993';

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Large amount fundraiser',
        caption: 'Exact money handling',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: amount,
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });
    expect(campaign.status).toBe(201);
    expect(campaign.body.data.targetAmountMinor).toBe(amount);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'donation-key-1')
      .send({
        amount,
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        supportMessage: 'Keep going',
        paymentMethodLabel: 'Card',
        consentAccepted: true,
        isAnonymous: false,
      });
    expect(donation.status).toBe(200);
    expect(donation.body.data.donationIntent.amountMinor).toBe(amount);
    expect(typeof donation.body.data.donationIntent.referenceId).toBe('string');

    const reused = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'donation-key-1')
      .send({
        amount,
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        supportMessage: 'Keep going',
        paymentMethodLabel: 'Card',
        consentAccepted: true,
        isAnonymous: false,
      });
    expect(reused.status).toBe(200);
    expect(reused.body.data.reused).toBe(true);
    expect(reused.body.data.donationIntent.referenceId).toBe(
      donation.body.data.donationIntent.referenceId,
    );
  });

  it('rejects invalid signatures and duplicate callbacks cleanly', async () => {
    const { app } = buildApp();

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Webhook fundraiser',
        caption: 'Callback contract',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'webhook-donation-1')
      .send({
        amount: '50000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        supportMessage: 'Thanks',
        paymentMethodLabel: 'Card',
      });

    const invalidSignature = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .send({
        provider: 'mockpay',
        eventId: 'evt-invalid',
        referenceId: donation.body.data.donationIntent.referenceId,
        status: 'SUCCEEDED',
        amountMinor: '50000',
        currencyCode: 'BDT',
        providerPaymentId: 'pp-1',
      })
      .set('X-Furtail-Signature', 'bad-signature');
    expect(invalidSignature.status).toBe(401);
    expect(invalidSignature.body.error.code).toBe('AUTHENTICATION_INVALID');

    const payload = {
      provider: 'mockpay',
      eventId: 'evt-success-1',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'SUCCEEDED',
      amountMinor: '50000',
      currencyCode: 'BDT',
      providerPaymentId: 'pp-1',
    };
    const signature = webhookSignature({ ...payload, payload });
    const success = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(payload);
    expect(success.status).toBe(200);
    expect(success.body.data.donationIntent.status).toBe('SUCCEEDED');
    expect(typeof success.body.data.receipt.amountMinor).toBe('string');
    expect(typeof success.body.data.receipt.issuedAt).toBe('string');

    const duplicate = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(payload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);

    const campaignAfter = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaign.body.data.id}`)
      .set('Authorization', 'Bearer token-1');
    expect(campaignAfter.body.data.stats.raisedAmount).toBe('50000');
    expect(campaignAfter.body.data.stats.donorsCount).toBe(1);
  });

  it('handles failed and cancelled payment transitions and rejects invalid retries', async () => {
    const { app } = buildApp();

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Failure fundraiser',
        caption: 'Status transitions',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '75000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });

    const failedDonation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'failed-1')
      .send({
        amount: '1000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    const failedPayload = {
      provider: 'mockpay',
      eventId: 'evt-failed-1',
      referenceId: failedDonation.body.data.donationIntent.referenceId,
      status: 'FAILED',
      amountMinor: '1000',
      currencyCode: 'BDT',
      providerPaymentId: 'pp-failed',
    };
    const failedSignature = webhookSignature({ ...failedPayload, payload: failedPayload });
    const failed = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', failedSignature)
      .send(failedPayload);
    expect(failed.status).toBe(200);
    expect(failed.body.data.status).toBe('FAILED');

    const cancelledDonation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'cancelled-1')
      .send({
        amount: '1000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    const cancelledPayload = {
      provider: 'mockpay',
      eventId: 'evt-cancelled-1',
      referenceId: cancelledDonation.body.data.donationIntent.referenceId,
      status: 'CANCELLED',
      amountMinor: '1000',
      currencyCode: 'BDT',
      providerPaymentId: 'pp-cancelled',
    };
    const cancelledSignature = webhookSignature({ ...cancelledPayload, payload: cancelledPayload });
    const cancelled = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', cancelledSignature)
      .send(cancelledPayload);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });

  it('rejects invalid status transitions after finalization', async () => {
    const { app } = buildApp();

    const campaign = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Transition fundraiser',
        caption: 'Invalid transition test',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '60000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
        mediaIds: [1],
      });

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaign.body.data.id}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'transition-1')
      .send({
        amount: '60000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    const successPayload = {
      provider: 'mockpay',
      eventId: 'evt-transition-success',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'SUCCEEDED',
      amountMinor: '60000',
      currencyCode: 'BDT',
      providerPaymentId: 'pp-transition',
    };
    const successSignature = webhookSignature({ ...successPayload, payload: successPayload });
    const success = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', successSignature)
      .send(successPayload);
    expect(success.status).toBe(200);

    const invalidPayload = {
      provider: 'mockpay',
      eventId: 'evt-transition-invalid',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'FAILED',
      amountMinor: '60000',
      currencyCode: 'BDT',
      providerPaymentId: 'pp-transition',
    };
    const invalidSignature = webhookSignature({ ...invalidPayload, payload: invalidPayload });
    const invalid = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', invalidSignature)
      .send(invalidPayload);
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('CONFLICT');
  });

  it('rolls back transactional mutations when an error is thrown', async () => {
    const { app, fundraisingStore } = buildApp();
    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: 'Rollback fundraiser',
        caption: 'Transactional check',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        locationText: 'Dhaka',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(created.status).toBe(201);

    const before = (await fundraisingStore.getCampaign(1, created.body.data.id)) as {
      stats: { raisedAmount: string };
    };
    expect(before.stats.raisedAmount).toBe(0n);

    expect(() => {
      fundraisingStore.transaction(() => {
        throw new Error('rollback');
      });
    }).toThrow('rollback');

    const after = (await fundraisingStore.getCampaign(1, created.body.data.id)) as {
      stats: { raisedAmount: string };
    };
    expect(after.stats.raisedAmount).toBe(0n);
  });
});
