import request from 'supertest';
import type { Express } from 'express';

/**
 * `env` (src/config/env.ts) is a singleton loaded once per Jest module
 * registry, so EPS must be configured (and `fetch` mocked) BEFORE anything
 * that transitively imports it is required — hence `jest.resetModules()` +
 * `require()` instead of top-level `import`. These tests never call
 * production EPS: every EPS HTTP call is intercepted by the `fetch` mock
 * installed in `mockEpsFetch()`.
 */

const BASE_ENV = { ...process.env };

const EPS_ENV = {
  PAYMENT_PROVIDER: 'eps',
  EPS_MERCHANT_ID: 'merchant-123',
  EPS_MERCHANT_SECRET: 'hash-key-abc',
  EPS_STORE_ID: 'store-123',
  EPS_USERNAME: 'eps-user',
  EPS_PASSWORD: 'eps-pass',
  EPS_SANDBOX: 'true',
};

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mocks EPS's GetToken/InitializeEPS/CheckMerchantTransactionStatus. */
function mockEpsFetch(opts: {
  init?: { transactionId?: string; redirectUrl?: string; errorMessage?: string };
  status?: { Status: string; EPSTransactionId?: string; TotalAmount?: string };
}) {
  global.fetch = jest.fn(async (url: string | URL) => {
    const href = url.toString();
    if (href.includes('/Auth/GetToken')) {
      return jsonResponse({ token: 'test-bearer-token' });
    }
    if (href.includes('/InitializeEPS')) {
      if (opts.init?.errorMessage) {
        return jsonResponse({ ErrorMessage: opts.init.errorMessage });
      }
      return jsonResponse({
        TransactionId: opts.init?.transactionId ?? 'eps-txn-1',
        RedirectURL: opts.init?.redirectUrl ?? 'https://sandboxpg.eps.com.bd/checkout/eps-txn-1',
      });
    }
    if (href.includes('/CheckMerchantTransactionStatus')) {
      return jsonResponse(
        opts.status ?? { Status: 'success', EPSTransactionId: 'eps-txn-1', TotalAmount: '100.00' },
      );
    }
    throw new Error(`Unexpected fetch to ${href}`);
  }) as unknown as typeof fetch;
}

function freshModules(envOverrides: Record<string, string>) {
  jest.resetModules();
  process.env = { ...BASE_ENV, ...envOverrides };
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createAppWithDependencies } = require('../src/app');
  const { createFundraisingStore } = require('../src/modules/fundraising/fundraising-store');
  const { createSocialCoreStore } = require('../src/modules/social/social-store');
  const { getTestPrisma } = require('./helpers/test-prisma');
  const { disconnectPrisma } = require('../src/infrastructure/db/prisma-client');
  const { AppError } = require('../src/core/errors/app-error');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    createAppWithDependencies,
    createFundraisingStore,
    createSocialCoreStore,
    getTestPrisma,
    disconnectPrisma,
    AppError,
  };
}

describe('EPS redirect-payment integration', () => {
  const originalFetch = global.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mods: any;

  function buildApp(): { app: Express; fundraisingStore: unknown } {
    const nowSeconds = Math.floor(Date.now() / 1000);
    function principal(sub: string) {
      return {
        sub,
        issuer: 'https://central-auth.test',
        audience: 'furtail-mobile',
        clientId: 'furtail-mobile',
        expiresAt: nowSeconds + 600,
        issuedAt: nowSeconds - 10,
        roles: ['member'],
        permissions: [],
        scopes: ['openid'],
        claims: {},
      };
    }
    const verifier = {
      async verifyAccessToken(token: string) {
        if (token === 'token-1') return principal('1');
        throw mods.AppError.authenticationInvalid();
      },
    };
    const socialStore = mods.createSocialCoreStore(
      undefined,
      undefined,
      async (p: { sub: string }) => {
        const id = Number(p.sub);
        return Number.isFinite(id) && id > 0 ? { id } : null;
      },
    );
    const fundraisingStore = mods.createFundraisingStore(socialStore, {
      prisma: mods.getTestPrisma(),
    });
    const app = mods.createAppWithDependencies({
      authVerifier: verifier,
      socialStore,
      fundraisingStore,
    });
    return { app, fundraisingStore };
  }

  async function cleanup(): Promise<void> {
    const prisma = mods.getTestPrisma();
    await prisma.fundraisingWebhookEvent.deleteMany({});
    await prisma.fundraisingReceipt.deleteMany({ where: { donationId: { gt: 1 } } });
    await prisma.fundraisingPaymentAttempt.deleteMany({ where: { donationId: { gt: 1 } } });
    await prisma.fundraisingDonation.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingCampaignMedia.deleteMany({ where: { campaignId: { gt: 1 } } });
    await prisma.fundraisingCampaign.deleteMany({ where: { id: { gt: 1 } } });
    await prisma.fundraisingCampaignDraft.deleteMany({ where: { id: { gt: 1 } } });
  }

  async function createCampaign(app: Express): Promise<number> {
    const created = await request(app)
      .post('/api/v1/fundraising/campaigns')
      .set('Authorization', 'Bearer token-1')
      .send({
        title: `EPS Test Campaign ${Date.now()}`,
        caption: 'Funding the EPS integration test',
        category: 'PET_HEALTH',
        fundingMode: 'ONE_TIME',
        currencyCode: 'BDT',
        targetAmountMinor: '500000',
        beneficiaryType: 'PET',
        beneficiaryName: 'Luna',
        deadline: '2026-12-31T00:00:00.000Z',
      });
    expect(created.status).toBe(201);
    return created.body.data.id as number;
  }

  beforeEach(() => {
    mods = freshModules(EPS_ENV);
  });

  afterEach(async () => {
    await cleanup();
    await mods.getTestPrisma().$disconnect();
    await mods.disconnectPrisma();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    process.env = { ...BASE_ENV };
  });

  it('checkout returns a real absolute EPS redirect URL and persists the provider transaction id', async () => {
    mockEpsFetch({
      init: {
        transactionId: 'eps-txn-abc',
        redirectUrl: 'https://sandboxpg.eps.com.bd/checkout/abc',
      },
    });
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-checkout-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });

    expect(donation.status).toBe(200);
    expect(donation.body.data.payment.provider).toBe('eps');
    expect(donation.body.data.payment.redirectUrl).toBe(
      'https://sandboxpg.eps.com.bd/checkout/abc',
    );
    expect(donation.body.data.payment.redirectUrl).toMatch(/^https:\/\//);
    expect(donation.body.data.payment.providerPaymentId).toBe('eps-txn-abc');
    // The historical bug this replaces: the client's own returnUrl must
    // never be echoed back as the provider redirect.
    expect(donation.body.data.payment.redirectUrl).not.toBe('https://app.example/return');
  });

  it('duplicate checkout requests (same Idempotency-Key) reuse the same intent/payment attempt and do not call EPS again', async () => {
    mockEpsFetch({});
    const { app } = buildApp();
    const campaignId = await createCampaign(app);
    const body = {
      amount: '10000',
      currencyCode: 'BDT',
      returnUrl: 'https://app.example/return',
      cancelUrl: 'https://app.example/cancel',
      consentAccepted: true,
    };

    const first = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-dup-1')
      .send(body);
    expect(first.status).toBe(200);
    const callsAfterFirst = (global.fetch as jest.Mock).mock.calls.length;

    const second = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-dup-1')
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.payment.paymentAttemptId).toBe(
      first.body.data.payment.paymentAttemptId,
    );
    // No second call to EPS for the reused attempt.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsAfterFirst);

    const attemptCount = await mods.getTestPrisma().fundraisingPaymentAttempt.count({
      where: { donationId: first.body.data.donationIntent.id },
    });
    expect(attemptCount).toBe(1);
  });

  it('a verified successful reconciliation increments raised totals exactly once, even if repeated', async () => {
    mockEpsFetch({
      status: { Status: 'success', EPSTransactionId: 'eps-txn-ok', TotalAmount: '100.00' },
    });
    const { app, fundraisingStore } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-success-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    const referenceId = donation.body.data.donationIntent.referenceId as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = await (fundraisingStore as any).reconcileEpsPayment(referenceId);
    expect(first.status).toBe('SUCCEEDED');

    const campaignAfterFirst = await mods.getTestPrisma().fundraisingCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    expect(campaignAfterFirst.raisedAmountMinor.toString()).toBe('10000');

    // Repeated reconciliation of the same settled outcome must not double-apply.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fundraisingStore as any).reconcileEpsPayment(referenceId);
    const campaignAfterSecond = await mods.getTestPrisma().fundraisingCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    expect(campaignAfterSecond.raisedAmountMinor.toString()).toBe('10000');
  });

  it('a verified cancelled outcome never increases raised totals', async () => {
    mockEpsFetch({ status: { Status: 'cancelled', EPSTransactionId: 'eps-txn-cancel' } });
    const { app, fundraisingStore } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-cancel-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    const referenceId = donation.body.data.donationIntent.referenceId as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fundraisingStore as any).reconcileEpsPayment(referenceId);
    expect(result.status).toBe('CANCELLED');

    const campaign = await mods.getTestPrisma().fundraisingCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    expect(campaign.raisedAmountMinor.toString()).toBe('0');
  });

  it('a verified failed outcome never increases raised totals', async () => {
    mockEpsFetch({ status: { Status: 'failed', EPSTransactionId: 'eps-txn-fail' } });
    const { app, fundraisingStore } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-fail-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    const referenceId = donation.body.data.donationIntent.referenceId as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fundraisingStore as any).reconcileEpsPayment(referenceId);
    expect(result.status).toBe('FAILED');

    const campaign = await mods.getTestPrisma().fundraisingCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    expect(campaign.raisedAmountMinor.toString()).toBe('0');
  });

  it('misconfigured EPS returns PAYMENT_PROVIDER_UNAVAILABLE (503) at the HTTP layer, never a false 200', async () => {
    mods = freshModules({ ...EPS_ENV, EPS_MERCHANT_SECRET: '' });
    mockEpsFetch({});
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-misconfigured-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });

    expect(donation.status).toBe(503);
    expect(donation.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    // No stray donation/payment-attempt row must be left behind.
    const count = await mods.getTestPrisma().fundraisingDonation.count({
      where: { campaignId },
    });
    expect(count).toBe(0);
  });

  it('the success/fail/cancel callback routes always reconcile via the verified status API, never trusting their own path or query string', async () => {
    mockEpsFetch({
      status: { Status: 'success', EPSTransactionId: 'eps-txn-redirect', TotalAmount: '100.00' },
    });
    const { app } = buildApp();
    const campaignId = await createCampaign(app);

    const donation = await request(app)
      .post(`/api/v1/fundraising/campaigns/${campaignId}/donate`)
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'eps-callback-1')
      .send({
        amount: '10000',
        currencyCode: 'BDT',
        returnUrl: 'https://app.example/return',
        cancelUrl: 'https://app.example/cancel',
        consentAccepted: true,
      });
    const referenceId = donation.body.data.donationIntent.referenceId as string;

    // Hit the FAIL callback path even though EPS's real (mocked) status is
    // "success" — the verified status must win, not the path/query string.
    const callback = await request(app).get(
      `/api/v1/fundraising/payments/eps/fail?merchantTransactionId=${referenceId}`,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain('status=SUCCEEDED');
    expect(callback.headers.location).toMatch(/^furtail:\/\/payment-return/);

    const status = await request(app)
      .get(`/api/v1/fundraising/payments/${referenceId}/status`)
      .set('Authorization', 'Bearer token-1');
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe('SUCCEEDED');
  });
});
