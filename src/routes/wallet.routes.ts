import { randomUUID } from 'node:crypto';

import { Router, type Request, type Response } from 'express';

import { AppError } from '../core/errors/app-error';
import { sendSuccess } from '../core/http/api-response';
import type {
  FundraisingStore,
  FundraisingContractError,
} from '../modules/fundraising/fundraising-store';
import { createSocialCoreStore, type SocialCoreStore } from '../modules/social/social-store';
import { asyncHandler } from '../shared/async-handler';
import { requiredAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';

export interface WalletRoutesDeps {
  verifier: TokenVerifier;
  fundraisingStore: FundraisingStore;
  socialStore?: SocialCoreStore;
}

export function walletRoutes(deps: WalletRoutesDeps): Router {
  const router = Router();
  const authenticate = requiredAuth({ verifier: deps.verifier });
  const socialStore = deps.socialStore ?? createSocialCoreStore();
  const route = (fn: (req: Request, res: Response) => Promise<void>) =>
    asyncHandler(async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        throw mapWalletError(error);
      }
    });

  router.get(
    '/api/v1/wallet/me',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const summary = await deps.fundraisingStore.getWalletSummary(userId);
      sendSuccess(res, summary, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/wallet/transactions',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const result = await deps.fundraisingStore.listWalletTransactions(
        userId,
        readLimit(req.query.limit, 20),
        toText(req.query.cursor) ?? undefined,
      );
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.get(
    '/api/v1/wallet/withdraw/requests',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const result = await deps.fundraisingStore.listWalletWithdrawRequests(
        userId,
        readLimit(req.query.limit, 20),
        toText(req.query.cursor) ?? undefined,
        toText(req.query.status) ?? undefined,
      );
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  router.post(
    '/api/v1/wallet/withdraw/requests',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const idempotencyKey =
        req.header('Idempotency-Key')?.trim() ||
        req.header('idempotency-key')?.trim() ||
        toText(body.idempotencyKey) ||
        `wallet-withdraw:${userId}:${randomUUID()}`;
      const result = await deps.fundraisingStore.createWalletWithdrawRequest(userId, {
        amountMinor: body.amount as string | number | bigint,
        method: readText(body.method, 'method'),
        payoutDetails: ensureObject(body.payoutDetails, 'payoutDetails'),
        note: toText(body.note),
        idempotencyKey,
      });
      sendSuccess(res, result, {
        requestId: req.requestId,
        correlationId: req.correlationId,
        statusCode: 201,
      });
    }),
  );

  router.patch(
    '/api/v1/wallet/withdraw/requests/:id/cancel',
    authenticate,
    route(async (req, res) => {
      const userId = await currentUserId(req, socialStore);
      const result = await deps.fundraisingStore.cancelWalletWithdrawRequest(
        userId,
        readInt(req.params.id, 'id'),
      );
      sendSuccess(res, result, { requestId: req.requestId, correlationId: req.correlationId });
    }),
  );

  return router;
}

async function currentUserId(req: Request, store: SocialCoreStore): Promise<number> {
  const principal = req.principal;
  if (!principal) throw AppError.authenticationRequired();
  const userId = await store.resolveUserId(principal);
  if (!userId) throw AppError.authenticationRequired();
  return userId;
}

function readInt(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw AppError.validation(`${field} must be an integer`);
  return parsed;
}

function readText(value: unknown, field: string): string {
  const text = toText(value);
  if (!text) throw AppError.validation(`${field} is required`);
  return text;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readLimit(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 100));
}

function ensureObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw AppError.validation(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function mapWalletError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'FundraisingContractError'
  ) {
    const fundraisingError = error as FundraisingContractError;
    switch (fundraisingError.code) {
      case 'NOT_FOUND':
        return AppError.notFound(fundraisingError.message);
      case 'FORBIDDEN':
      case 'ACCESS_DENIED':
        return AppError.authorizationDenied(fundraisingError.message);
      case 'ACCOUNT_NOT_VERIFIED':
        return AppError.fundraisingAccountNotVerified(fundraisingError.message);
      case 'CONFLICT':
      case 'INVALID_TRANSITION':
        return AppError.conflict(fundraisingError.message);
      case 'VALIDATION':
        return AppError.validation(fundraisingError.message);
      default:
        return AppError.internal('Wallet operation failed');
    }
  }
  return AppError.internal('Wallet operation failed');
}
