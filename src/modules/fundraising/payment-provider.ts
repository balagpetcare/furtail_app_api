import { env } from '../../config/env';
import { epsInitPayment, isEpsConfigured, EpsProviderError } from './eps-client';

/**
 * Resolves the redirect URL (if any) a donation checkout must hand back to
 * the client, for whichever payment provider is active (`env.PAYMENT_PROVIDER`).
 *
 * `wpa` is the internal/manual-settlement default — donations under it are
 * never redirect-based, so `redirectUrl` is legitimately `null` and that is
 * a genuine success, not a missing field. Every other provider name is a
 * real external gateway that requires a redirect; if it isn't configured
 * (or, as today, its API integration isn't built yet), checkout must fail
 * loudly with a typed error instead of fabricating a URL — the caller
 * ('/donate') maps [PaymentProviderUnavailableError] to a safe 502/503-style
 * response rather than a false-success 200.
 */

export type ResolvedPaymentRedirect =
  | { requiresRedirect: false; provider: string; redirectUrl: null; providerPaymentId: null }
  | {
      requiresRedirect: true;
      provider: string;
      redirectUrl: string;
      providerPaymentId: string | null;
    };

export interface PaymentRedirectContext {
  merchantTransactionId: string;
  customerOrderId: string;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  ipAddress: string;
}

export class PaymentProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderUnavailableError';
  }
}

const REDIRECT_PROVIDERS = new Set(['sslcommerz', 'amarpay', 'bkash', 'nagad', 'eps']);

function isProviderConfigured(provider: string): boolean {
  switch (provider) {
    case 'sslcommerz':
      return Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);
    case 'bkash':
      return Boolean(
        env.BKASH_APP_KEY && env.BKASH_APP_SECRET && env.BKASH_USERNAME && env.BKASH_PASSWORD,
      );
    case 'nagad':
      return Boolean(env.NAGAD_MERCHANT_ID && env.NAGAD_MERCHANT_NUMBER && env.NAGAD_PRIVATE_KEY);
    case 'amarpay':
      return Boolean(env.AMARPAY_STORE_ID && env.AMARPAY_SIGNATURE_KEY);
    case 'eps':
      return isEpsConfigured();
    default:
      return false;
  }
}

function epsCallbackUrl(configured: string, fallbackPath: string, referenceId: string): string {
  const base = (configured || `${env.API_PUBLIC_BASE_URL}${fallbackPath}`).replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}merchantTransactionId=${encodeURIComponent(referenceId)}`;
}

export async function resolvePaymentRedirect(
  context: PaymentRedirectContext,
): Promise<ResolvedPaymentRedirect> {
  const provider = (env.PAYMENT_PROVIDER || 'wpa').trim().toLowerCase();

  if (!REDIRECT_PROVIDERS.has(provider)) {
    // 'wpa' (or any other manual/offline provider name) never redirects.
    return { requiresRedirect: false, provider, redirectUrl: null, providerPaymentId: null };
  }

  if (!isProviderConfigured(provider)) {
    throw new PaymentProviderUnavailableError(`Payment provider "${provider}" is not configured`);
  }

  if (provider !== 'eps') {
    // Credentials are present, but no gateway API client is implemented
    // yet for this provider — inventing a redirect URL would be worse
    // than failing.
    throw new PaymentProviderUnavailableError(
      `Payment provider "${provider}" redirect checkout is not yet implemented`,
    );
  }

  try {
    const result = await epsInitPayment({
      merchantTransactionId: context.merchantTransactionId,
      customerOrderId: context.customerOrderId,
      totalAmount: context.totalAmount,
      successUrl: epsCallbackUrl(
        env.EPS_SUCCESS_URL,
        '/api/v1/fundraising/payments/eps/success',
        context.merchantTransactionId,
      ),
      failUrl: epsCallbackUrl(
        env.EPS_FAIL_URL,
        '/api/v1/fundraising/payments/eps/fail',
        context.merchantTransactionId,
      ),
      cancelUrl: epsCallbackUrl(
        env.EPS_CANCEL_URL,
        '/api/v1/fundraising/payments/eps/cancel',
        context.merchantTransactionId,
      ),
      customerName: context.customerName,
      customerEmail: context.customerEmail,
      customerAddress: context.customerAddress,
      customerCity: context.customerCity,
      customerState: context.customerCity,
      customerPostcode: '1000',
      customerCountry: 'BD',
      customerPhone: context.customerPhone,
      productName: 'Fundraising donation',
      ipAddress: context.ipAddress,
    });
    return {
      requiresRedirect: true,
      provider,
      redirectUrl: result.redirectUrl,
      providerPaymentId: result.transactionId || null,
    };
  } catch (error) {
    if (error instanceof EpsProviderError) {
      throw new PaymentProviderUnavailableError(error.message);
    }
    throw error;
  }
}
