import { Router } from 'express';

import { sendSuccess } from '../core/http/api-response';
import { AppError } from '../core/errors/app-error';
import { requiredAuth } from '../security/auth-middleware';
import type { TokenVerifier } from '../security/principal';
import { asyncHandler } from '../shared/async-handler';
import type { SocialCoreStore } from '../modules/social/social-store';

export interface ReportsRoutesDeps {
  verifier: TokenVerifier;
  socialStore?: SocialCoreStore;
}

function readUserId(req: { principal?: { sub: string } }, store: SocialCoreStore): number {
  const id = req.principal ? store.resolveUserId(req.principal) : null;
  if (!id) {
    throw AppError.authenticationRequired();
  }
  return id;
}

function toPositiveInt(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.validation(`Invalid ${label}`);
  }
  return parsed;
}

export function reportsRoutes(deps: ReportsRoutesDeps): Router {
  const router = Router();
  const store = deps.socialStore;
  if (!store) {
    throw new Error('reportsRoutes requires a socialStore');
  }
  const required = requiredAuth({ verifier: deps.verifier });

  router.get(
    '/api/v1/reports/reasons',
    required,
    asyncHandler(async (req, res) => {
      readUserId(req, store);
      const type = String(req.query.type ?? '').trim();
      const reasons = store.listReportReasons(type);
      sendSuccess(
        res,
        { items: reasons },
        { requestId: req.requestId, correlationId: req.correlationId },
      );
    }),
  );

  router.post(
    '/api/v1/reports',
    required,
    asyncHandler(async (req, res) => {
      const reporterId = readUserId(req, store);
      const type = String(req.body?.type ?? '').trim();
      const targetId = toPositiveInt(req.body?.targetId, 'targetId');
      const reasonCode = String(req.body?.reasonCode ?? '').trim();
      const details = req.body?.details ? String(req.body.details).trim() : null;
      if (!type) throw AppError.validation('type is required');
      if (!reasonCode) throw AppError.validation('reasonCode is required');

      const report = store.createReport(reporterId, {
        type,
        targetId,
        reasonCode,
        details,
      });

      sendSuccess(
        res,
        {
          id: report.id,
          type: report.type,
          targetId: report.targetId,
          reasonCode: report.reasonCode,
          details: report.details,
          createdAt: report.createdAt.toISOString(),
          status: report.status,
        },
        { requestId: req.requestId, correlationId: req.correlationId, statusCode: 201 },
      );
    }),
  );

  return router;
}
