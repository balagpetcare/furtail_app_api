/**
 * `env` (src/config/env.ts) is loaded once per module registry, so each
 * scenario here resets Jest's module cache and re-sets `process.env` BEFORE
 * re-importing the module under test — the only reliable way to exercise a
 * different `PAYMENT_PROVIDER`/credential combination per test. `fetch` is
 * mocked in every EPS scenario — these tests must never call production EPS.
 */

const BASE_ENV = { ...process.env };

function freshImport(envOverrides: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...BASE_ENV, ...envOverrides };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/modules/fundraising/payment-provider') as typeof import('../src/modules/fundraising/payment-provider');
}

const EPS_CONFIGURED_ENV = {
  PAYMENT_PROVIDER: 'eps',
  EPS_MERCHANT_ID: 'merchant-123',
  EPS_MERCHANT_SECRET: 'hash-key-abc',
  EPS_STORE_ID: 'store-123',
  EPS_USERNAME: 'eps-user',
  EPS_PASSWORD: 'eps-pass',
  EPS_SANDBOX: 'true',
};

const context = {
  merchantTransactionId: 'ref_1_test',
  customerOrderId: 'ref_1_test',
  totalAmount: 10.0,
  customerName: 'Test Donor',
  customerEmail: 'donor@example.com',
  customerPhone: '01700000000',
  customerAddress: 'Dhaka',
  customerCity: 'Dhaka',
  ipAddress: '127.0.0.1',
};

describe('fundraising payment provider resolution', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...BASE_ENV };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('the default (unset) provider never requires a redirect and never fabricates a URL', async () => {
    const { resolvePaymentRedirect } = freshImport({ PAYMENT_PROVIDER: undefined });
    const resolved = await resolvePaymentRedirect(context);
    expect(resolved.requiresRedirect).toBe(false);
    expect(resolved.provider).toBe('wpa');
    expect(resolved.redirectUrl).toBeNull();
  });

  it('an explicit manual/offline provider name behaves the same as the default', async () => {
    const { resolvePaymentRedirect } = freshImport({ PAYMENT_PROVIDER: 'wpa' });
    const resolved = await resolvePaymentRedirect(context);
    expect(resolved.requiresRedirect).toBe(false);
    expect(resolved.redirectUrl).toBeNull();
  });

  it('a redirect-based provider with no credentials configured throws a typed "not configured" error, never a fabricated URL', async () => {
    const { resolvePaymentRedirect, PaymentProviderUnavailableError } = freshImport({
      PAYMENT_PROVIDER: 'sslcommerz',
      SSLCOMMERZ_STORE_ID: '',
      SSLCOMMERZ_STORE_PASSWORD: '',
    });
    await expect(resolvePaymentRedirect(context)).rejects.toThrow(PaymentProviderUnavailableError);
    await expect(resolvePaymentRedirect(context)).rejects.toThrow(/not configured/);
  });

  it.each(['bkash', 'nagad', 'amarpay'])(
    'the %s provider with no credentials configured throws a typed error',
    async (provider) => {
      const { resolvePaymentRedirect, PaymentProviderUnavailableError } = freshImport({
        PAYMENT_PROVIDER: provider,
      });
      await expect(resolvePaymentRedirect(context)).rejects.toThrow(
        PaymentProviderUnavailableError,
      );
    },
  );

  it('a redirect-based provider (other than EPS) WITH credentials configured still fails safely (no gateway integration built) instead of inventing a URL', async () => {
    const { resolvePaymentRedirect, PaymentProviderUnavailableError } = freshImport({
      PAYMENT_PROVIDER: 'sslcommerz',
      SSLCOMMERZ_STORE_ID: 'store-123',
      SSLCOMMERZ_STORE_PASSWORD: 'secret-abc',
    });
    await expect(resolvePaymentRedirect(context)).rejects.toThrow(PaymentProviderUnavailableError);
    await expect(resolvePaymentRedirect(context)).rejects.toThrow(/not yet implemented/);
  });

  it('an unrecognized provider name is treated as a manual/offline provider, not an error', async () => {
    const { resolvePaymentRedirect } = freshImport({ PAYMENT_PROVIDER: 'totally-unknown' });
    const resolved = await resolvePaymentRedirect(context);
    expect(resolved.requiresRedirect).toBe(false);
    expect(resolved.redirectUrl).toBeNull();
  });

  describe('eps', () => {
    it('EPS without full credentials returns PAYMENT_PROVIDER_UNAVAILABLE (typed), never a fabricated URL', async () => {
      const { resolvePaymentRedirect, PaymentProviderUnavailableError } = freshImport({
        PAYMENT_PROVIDER: 'eps',
        EPS_MERCHANT_ID: '',
        EPS_MERCHANT_SECRET: '',
      });
      await expect(resolvePaymentRedirect(context)).rejects.toThrow(
        PaymentProviderUnavailableError,
      );
      await expect(resolvePaymentRedirect(context)).rejects.toThrow(/not configured/);
    });

    it('a fully configured EPS returns a real absolute https redirect URL from the (mocked) init-payment call', async () => {
      const { resolvePaymentRedirect } = freshImport(EPS_CONFIGURED_ENV);
      global.fetch = jest.fn(async (url: string | URL) => {
        const href = url.toString();
        if (href.includes('/Auth/GetToken')) {
          return jsonResponse({ token: 'test-bearer-token' });
        }
        if (href.includes('/InitializeEPS')) {
          return jsonResponse({
            TransactionId: 'eps-txn-1',
            RedirectURL: 'https://sandboxpg.eps.com.bd/checkout/eps-txn-1',
          });
        }
        throw new Error(`Unexpected fetch: ${href}`);
      }) as unknown as typeof fetch;

      const resolved = await resolvePaymentRedirect(context);
      expect(resolved.requiresRedirect).toBe(true);
      expect(resolved.provider).toBe('eps');
      expect(resolved.redirectUrl).toMatch(/^https:\/\//);
      expect(resolved.providerPaymentId).toBe('eps-txn-1');
    });

    it('EPS returning an empty/invalid redirect URL is treated as unavailable, never surfaced as success', async () => {
      const { resolvePaymentRedirect, PaymentProviderUnavailableError } =
        freshImport(EPS_CONFIGURED_ENV);
      global.fetch = jest.fn(async (url: string | URL) => {
        const href = url.toString();
        if (href.includes('/Auth/GetToken')) return jsonResponse({ token: 'tok' });
        if (href.includes('/InitializeEPS'))
          return jsonResponse({ TransactionId: '', RedirectURL: '' });
        throw new Error(`Unexpected fetch: ${href}`);
      }) as unknown as typeof fetch;

      await expect(resolvePaymentRedirect(context)).rejects.toThrow(
        PaymentProviderUnavailableError,
      );
    });

    it('an EPS ErrorMessage response is surfaced as PAYMENT_PROVIDER_UNAVAILABLE', async () => {
      const { resolvePaymentRedirect, PaymentProviderUnavailableError } =
        freshImport(EPS_CONFIGURED_ENV);
      global.fetch = jest.fn(async (url: string | URL) => {
        const href = url.toString();
        if (href.includes('/Auth/GetToken')) return jsonResponse({ token: 'tok' });
        if (href.includes('/InitializeEPS')) {
          return jsonResponse({ ErrorMessage: 'Invalid merchant configuration' });
        }
        throw new Error(`Unexpected fetch: ${href}`);
      }) as unknown as typeof fetch;

      await expect(resolvePaymentRedirect(context)).rejects.toThrow(
        PaymentProviderUnavailableError,
      );
    });

    it('a gateway network failure surfaces as PAYMENT_PROVIDER_UNAVAILABLE, not an unhandled crash', async () => {
      const { resolvePaymentRedirect, PaymentProviderUnavailableError } =
        freshImport(EPS_CONFIGURED_ENV);
      global.fetch = jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;

      await expect(resolvePaymentRedirect(context)).rejects.toThrow(
        PaymentProviderUnavailableError,
      );
    });
  });
});

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
