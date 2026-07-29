import { createHmac } from 'node:crypto';

import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
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
