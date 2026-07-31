import { createHmac, randomUUID } from 'node:crypto';

import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import { getTestPrisma } from './helpers/test-prisma';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

interface DonationAttemptView {
  amountMinor: bigint;
  referenceId: string;
  payment: { provider: string } | null;
}

describe('fundraising donation persistence', () => {
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
    return { app, fundraisingStore };
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

  async function cleanupFundraisingRows(): Promise<void> {
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
  }

  async function createCampaign(app: ReturnType<typeof buildApp>['app']): Promise<number> {
    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: `Test Campaign ${randomUUID()}`,
        caption: 'Funding the test ledger',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '50000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(created.status).toBe(201);
    return created.body.data.id as number;
  }

  beforeEach(async () => {
    await cleanupFundraisingRows();
  });

  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  it('persists donation state across store instances', async () => {
    const { app, fundraisingStore } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'persist-cross-instance')
      .send({
        amount: '12500',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(donation.status).toBe(200);

    const secondStore = createFundraisingStore(createSocialCoreStore(), {
      prisma: getTestPrisma(),
    });
    const lookup = (await secondStore.getDonationAttemptByReference(
      1,
      donation.body.data.donationIntent.referenceId,
    )) as unknown as DonationAttemptView;
    expect(lookup.amountMinor).toBe(12500n);
    expect(lookup.referenceId).toBe(donation.body.data.donationIntent.referenceId);
    expect(lookup.payment?.provider).toBe('wpa');

    void fundraisingStore;
  });

  it('checkout success response always matches the canonical contract, with payment.redirectUrl present (even when null for a non-redirect provider)', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'checkout-contract-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(donation.status).toBe(200);

    const body = donation.body.data;
    expect(body.reused).toBe(false);
    expect(typeof body.donationIntent.id).toBe('number');
    expect(typeof body.donationIntent.publicId).toBe('string');
    expect(typeof body.donationIntent.referenceId).toBe('string');
    expect(body.donationIntent.status).toBe('PENDING');
    expect(String(body.donationIntent.amountMinor)).toBe('10000');
    expect(body.donationIntent.currencyCode).toBe('BDT');
    expect(typeof body.donationIntent.expiresAt).toBe('string');

    expect(body.payment).not.toBeNull();
    expect(typeof body.payment.provider).toBe('string');
    // The field must exist even when this provider has no redirect step —
    // it must never be silently dropped from the response, only ever null.
    expect(Object.prototype.hasOwnProperty.call(body.payment, 'redirectUrl')).toBe(true);
    // The historical bug: the client's own returnUrl was echoed back as if
    // it were a real payment-provider redirect. It must never equal that.
    expect(body.payment.redirectUrl).not.toBe('https://app.example/return');

    // Idempotent retry returns the identical payment attempt, not a new one.
    const retry = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'checkout-contract-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    expect(retry.status).toBe(200);
    expect(retry.body.data.reused).toBe(true);
    expect(retry.body.data.payment.paymentAttemptId).toBe(body.payment.paymentAttemptId);

    const attemptCount = await getTestPrisma().fundraisingPaymentAttempt.count({
      where: { donationId: retry.body.data.donationIntent.id },
    });
    expect(attemptCount).toBe(1);
  });

  it('is visible to an independent Prisma worker', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'worker-visible')
      .send({
        amount: '33000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });
    expect(donation.status).toBe(200);

    const row = await getTestPrisma().fundraisingDonation.findUnique({
      where: {
        referenceId: donation.body.data.donationIntent.referenceId,
      },
      include: {
        paymentAttempts: true,
      },
    });
    expect(row).not.toBeNull();
    expect(row?.amountMinor).toBe(33000n);
    expect(row?.paymentAttempts).toHaveLength(1);
  });

  it('returns the original checkout on duplicate idempotency keys', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const first = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'duplicate-checkout')
      .send({
        amount: '20000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'duplicate-checkout')
      .send({
        amount: '20000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });
    expect(second.status).toBe(200);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.donationIntent.referenceId).toBe(
      first.body.data.donationIntent.referenceId,
    );

    const donationCount = await getTestPrisma().fundraisingDonation.count({
      where: { campaignId },
    });
    expect(donationCount).toBe(1);
  });

  it('deduplicates webhook handling and receipt creation', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'webhook-dedup')
      .send({
        amount: '17500',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    const payload = {
      provider: 'mockpay',
      eventId: 'evt-webhook-1',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'SUCCEEDED',
      amountMinor: '17500',
      currencyCode: 'BDT',
      providerPaymentId: 'pay-webhook-1',
    };
    const signature = webhookSignature({ ...payload, payload });
    const first = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.data.donationIntent.status).toBe('SUCCEEDED');
    expect(first.body.data.receipt.amountMinor).toBe('17500');

    const second = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);

    const receiptCount = await getTestPrisma().fundraisingReceipt.count({
      where: {
        donation: {
          referenceId: donation.body.data.donationIntent.referenceId,
        },
      },
    });
    expect(receiptCount).toBe(1);
  });

  it('increments the collected total exactly once on duplicate payment confirmations', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'payment-confirmation')
      .send({
        amount: '24000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    const firstPayload = {
      provider: 'mockpay',
      eventId: 'evt-confirm-1',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'SUCCEEDED',
      amountMinor: '24000',
      currencyCode: 'BDT',
      providerPaymentId: 'pay-confirm-1',
    };
    const firstSignature = webhookSignature({ ...firstPayload, payload: firstPayload });
    await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', firstSignature)
      .send(firstPayload)
      .expect(200);

    const secondPayload = {
      ...firstPayload,
      eventId: 'evt-confirm-2',
      providerPaymentId: 'pay-confirm-1',
    };
    const secondSignature = webhookSignature({ ...secondPayload, payload: secondPayload });
    const second = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', secondSignature)
      .send(secondPayload);
    expect(second.status).toBe(200);

    const campaign = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer token-1');
    expect(campaign.body.data.stats.raisedAmount).toBe('24000');
    expect(campaign.body.data.stats.donorsCount).toBe(1);
  });

  it('persists receipts durably and returns them through the public donation status response', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'receipt-persist')
      .send({
        amount: '9000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    const payload = {
      provider: 'mockpay',
      eventId: 'evt-receipt-1',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'SUCCEEDED',
      amountMinor: '9000',
      currencyCode: 'BDT',
      providerPaymentId: 'pay-receipt-1',
    };
    const signature = webhookSignature({ ...payload, payload });
    await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(payload)
      .expect(200);

    const status = await request(app)
      .get(`/api/v1/fundraising/payments/${donation.body.data.donationIntent.referenceId}/status`)
      .set('Authorization', 'Bearer token-1');
    expect(status.status).toBe(200);
    expect(status.body.data.receipt.amountMinor).toBe('9000');
    expect(status.body.data.payment.providerPaymentId).toBe('pay-receipt-1');

    const receipt = await getTestPrisma().fundraisingReceipt.findUnique({
      where: {
        donationId: status.body.data.intentId as number,
      },
    });
    expect(receipt).not.toBeNull();
    expect(receipt?.amountMinor).toBe(9000n);
  });

  it('rejects invalid amount and currency inputs', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const invalidAmount = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'invalid-amount')
      .send({
        amount: '0',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });
    expect(invalidAmount.status).toBe(400);

    const invalidCurrency = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'invalid-currency')
      .send({
        amount: '1000',
        currencyCode: 'USD',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });
    expect(invalidCurrency.status).toBe(400);
  });

  it('rejects payment confirmation after campaign cancellation', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'cancelled-confirmation')
      .send({
        amount: '11111',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
      });

    await getTestPrisma().fundraisingCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    const payload = {
      provider: 'mockpay',
      eventId: 'evt-cancelled-1',
      referenceId: donation.body.data.donationIntent.referenceId,
      status: 'SUCCEEDED',
      amountMinor: '11111',
      currencyCode: 'BDT',
      providerPaymentId: 'pay-cancelled-1',
    };
    const signature = webhookSignature({ ...payload, payload });
    const result = await request(app)
      .post('/api/v1/fundraising/payments/webhooks/provider')
      .set('X-Furtail-Signature', signature)
      .send(payload);
    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe('FAILED');

    const after = await request(app)
      .get(`/api/v1/fundraising/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer token-1');
    expect(after.body.data.stats.raisedAmount).toBe('0');
    expect(after.body.data.stats.donorsCount).toBe(0);
  });

  it('keeps payment metadata private in API responses', async () => {
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'privacy-check')
      .send({
        amount: '14000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/private-return',
        cancelUrl: 'https://app.example/private-cancel',
        supportMessage: 'Secret note',
      });

    expect(JSON.stringify(donation.body)).not.toContain('providerMetadata');
    expect(JSON.stringify(donation.body)).not.toContain('requestFingerprint');
    expect(JSON.stringify(donation.body)).not.toContain('private-return');
    expect(JSON.stringify(donation.body)).not.toContain('private-cancel');
  });
});
