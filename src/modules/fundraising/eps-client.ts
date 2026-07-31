import { createHmac } from 'node:crypto';
import { env } from '../../config/env';

/**
 * EPS (Easy Payment System, eps.com.bd) payment-gateway client.
 *
 * Contract (confirmed against EPS's own published integration surface —
 * base URLs, endpoint paths, request/response field names, and the x-hash
 * HMAC-SHA512 signing scheme):
 *   - POST {base}/v1/Auth/GetToken            body {userName, password}
 *       header x-hash = base64(HMAC-SHA512(userName, HASH_KEY))
 *       -> { token }
 *   - POST {base}/v1/EPSEngine/InitializeEPS   body PaymentPayload
 *       headers x-hash = base64(HMAC-SHA512(merchantTransactionId, HASH_KEY)),
 *               Authorization: Bearer <token>
 *       -> { TransactionId, RedirectURL, ErrorMessage?, ErrorCode? }
 *   - GET  {base}/v1/EPSEngine/CheckMerchantTransactionStatus?merchantTransactionId=...
 *       same headers (x-hash over merchantTransactionId)
 *       -> { MerchantTransactionId, EPSTransactionId, Status, TotalAmount,
 *            StoreAmount, FinancialEntity, ... }
 *
 * `base` is `https://sandboxpgapi.eps.com.bd` or `https://pgapi.eps.com.bd`.
 *
 * EPS has no separate signed server-to-server webhook push in this
 * contract — it redirects the payer's browser to merchant-configured
 * success/fail/cancel URLs carrying no trustworthy payload. The merchant is
 * expected to treat that redirect only as a trigger to call
 * `checkTransactionStatus` (itself x-hash/bearer-authenticated) for the
 * authoritative outcome — see `reconcileEpsPayment` in fundraising-store.ts.
 * That status call *is* this integration's cryptographic verification step.
 */

export class EpsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpsProviderError';
  }
}

export type EpsTransactionType = 1 | 2 | 3; // WEB | ANDROID | IOS

export interface EpsInitPaymentInput {
  merchantTransactionId: string;
  customerOrderId: string;
  totalAmount: number;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPostcode: string;
  customerCountry: string;
  customerPhone: string;
  productName: string;
  ipAddress: string;
  transactionTypeId?: EpsTransactionType;
}

export interface EpsInitPaymentResult {
  transactionId: string;
  redirectUrl: string;
}

export type EpsTransactionOutcome = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'UNKNOWN';

export interface EpsTransactionStatusResult {
  outcome: EpsTransactionOutcome;
  merchantTransactionId: string;
  epsTransactionId: string | null;
  totalAmount: string | null;
  financialEntity: string | null;
  raw: Record<string, unknown>;
}

interface EpsCredentials {
  merchantId: string;
  storeId: string;
  username: string;
  password: string;
  hashKey: string;
  baseUrl: string;
}

export function isEpsConfigured(): boolean {
  return Boolean(
    env.EPS_MERCHANT_ID &&
    env.EPS_STORE_ID &&
    env.EPS_USERNAME &&
    env.EPS_PASSWORD &&
    env.EPS_MERCHANT_SECRET,
  );
}

function readCredentials(): EpsCredentials {
  if (!isEpsConfigured()) {
    throw new EpsProviderError('EPS credentials are not fully configured');
  }
  return {
    merchantId: env.EPS_MERCHANT_ID,
    storeId: env.EPS_STORE_ID,
    username: env.EPS_USERNAME,
    password: env.EPS_PASSWORD,
    // EPS_MERCHANT_SECRET is this integration's name for EPS's own
    // "Hash Key" — the HMAC secret used for every x-hash signature.
    hashKey: env.EPS_MERCHANT_SECRET,
    baseUrl: env.EPS_SANDBOX ? 'https://sandboxpgapi.eps.com.bd' : 'https://pgapi.eps.com.bd',
  };
}

function xHash(data: string, hashKey: string): string {
  return createHmac('sha512', hashKey).update(data, 'utf8').digest('base64');
}

/** Never logs headers/body — only safe, non-secret metadata. */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EpsProviderError('Failed to reach the EPS payment gateway');
  }
  const parsed = await safeParseJson(response);
  if (!response.ok) {
    throw new EpsProviderError(`EPS request failed with status ${response.status}`);
  }
  return parsed;
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers });
  } catch {
    throw new EpsProviderError('Failed to reach the EPS payment gateway');
  }
  const parsed = await safeParseJson(response);
  if (!response.ok) {
    throw new EpsProviderError(`EPS request failed with status ${response.status}`);
  }
  return parsed;
}

async function safeParseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = await response.json();
    return (data ?? {}) as Record<string, unknown>;
  } catch {
    throw new EpsProviderError('EPS returned a non-JSON response');
  }
}

async function getToken(credentials: EpsCredentials): Promise<string> {
  const tokenUrl = env.EPS_TOKEN_URL || `${credentials.baseUrl}/v1/Auth/GetToken`;
  const result = await postJson(
    tokenUrl,
    { 'x-hash': xHash(credentials.username, credentials.hashKey) },
    { userName: credentials.username, password: credentials.password },
  );
  const token = typeof result.token === 'string' ? result.token : null;
  if (!token) {
    throw new EpsProviderError('EPS did not return an authentication token');
  }
  return token;
}

export async function epsInitPayment(input: EpsInitPaymentInput): Promise<EpsInitPaymentResult> {
  const credentials = readCredentials();
  const token = await getToken(credentials);
  const initUrl = env.EPS_INIT_PAYMENT_URL || `${credentials.baseUrl}/v1/EPSEngine/InitializeEPS`;

  const body = {
    merchantId: credentials.merchantId,
    storeId: credentials.storeId,
    CustomerOrderId: input.customerOrderId,
    merchantTransactionId: input.merchantTransactionId,
    transactionTypeId: input.transactionTypeId ?? 1,
    totalAmount: input.totalAmount,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    cancelUrl: input.cancelUrl,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerAddress: input.customerAddress,
    customerCity: input.customerCity,
    customerState: input.customerState,
    customerPostcode: input.customerPostcode,
    customerCountry: input.customerCountry,
    customerPhone: input.customerPhone,
    productName: input.productName,
    productProfile: 'general',
    productCategory: 'general',
    ipAddress: input.ipAddress,
    version: '1',
    description: `Donation checkout ${input.merchantTransactionId}`,
    ProductList: [
      {
        ProductName: input.productName,
        NoOfItem: '1',
        ProductProfile: 'general',
        ProductCategory: 'general',
        ProductPrice: input.totalAmount.toFixed(2),
      },
    ],
  };

  const result = await postJson(
    initUrl,
    {
      'x-hash': xHash(input.merchantTransactionId, credentials.hashKey),
      Authorization: `Bearer ${token}`,
    },
    body,
  );

  const errorMessage = typeof result.ErrorMessage === 'string' ? result.ErrorMessage : null;
  const redirectUrl = typeof result.RedirectURL === 'string' ? result.RedirectURL : '';
  const transactionId = typeof result.TransactionId === 'string' ? result.TransactionId : '';
  if (errorMessage || !redirectUrl || !/^https?:\/\//i.test(redirectUrl)) {
    // Never fabricate a redirect URL — surface a safe, typed failure instead.
    throw new EpsProviderError(errorMessage || 'EPS did not return a usable redirect URL');
  }

  return { transactionId, redirectUrl };
}

export async function epsCheckTransactionStatus(
  merchantTransactionId: string,
): Promise<EpsTransactionStatusResult> {
  const credentials = readCredentials();
  const token = await getToken(credentials);
  const verifyUrl =
    env.EPS_VERIFY_URL || `${credentials.baseUrl}/v1/EPSEngine/CheckMerchantTransactionStatus`;
  const url = `${verifyUrl}?merchantTransactionId=${encodeURIComponent(merchantTransactionId)}`;

  const result = await getJson(url, {
    'x-hash': xHash(merchantTransactionId, credentials.hashKey),
    Authorization: `Bearer ${token}`,
  });

  const status = typeof result.Status === 'string' ? result.Status.trim().toLowerCase() : '';
  const outcome: EpsTransactionOutcome =
    status === 'success'
      ? 'SUCCESS'
      : status === 'failed'
        ? 'FAILED'
        : status === 'cancelled' || status === 'canceled'
          ? 'CANCELLED'
          : status === 'pending' || status === 'processing'
            ? 'PENDING'
            : 'UNKNOWN';

  return {
    outcome,
    merchantTransactionId,
    epsTransactionId: typeof result.EPSTransactionId === 'string' ? result.EPSTransactionId : null,
    totalAmount: typeof result.TotalAmount === 'string' ? result.TotalAmount : null,
    financialEntity: typeof result.FinancialEntity === 'string' ? result.FinancialEntity : null,
    raw: result,
  };
}
