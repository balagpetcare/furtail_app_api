# 06 - Auth and Infrastructure

## Workspace Helper

- Helper error: `windows sandbox: helper_unknown_error: setup refresh had errors`
- Native shell access: succeeded
- Target workspace: `D:\wpa\furtail\furtail_app_api`

## Diagnostics

- `Test-Path D:\wpa\furtail\furtail_app_api` -> `True`
- `Get-Item D:\wpa\furtail\furtail_app_api` -> folder exists and is a writable directory
- `Get-ChildItem D:\wpa\furtail\furtail_app_api -Force` -> readable contents present
- `Get-PSDrive -PSProvider FileSystem` -> sufficient free space on `C:`, `D:`, and `E:`
- `whoami` / `WindowsIdentity` / `GetAccessControl` -> current account has modify access
- `git -C D:\wpa\furtail\furtail_app_api status --short` -> workspace was not clean; the repo contents were untracked in this environment
- `node --version` -> `v24.18.0`
- `npm --version` -> `11.16.0`
- `npm pkg get name` -> `"furtail-app-api"`
- `Get-Content package.json | ConvertFrom-Json` -> package metadata parsed successfully

## Implementation Summary

- Added PostgreSQL/Prisma infrastructure scaffolding with Prisma 7 config and schema.
- Added Central Auth verification configuration for issuer, audience, client ID, JWKS URI, and required claims.
- Added authenticated principal typing and auth middleware for required and optional authentication.
- Added role, permission, and ownership helpers.
- Added configurable security headers, CORS, body-size limits, rate limiting, and request timeout handling.
- Added typed authorization and infrastructure errors.
- Added safe BigInt, Decimal, Date, nested-object, and circular-reference serialization without global prototype changes.
- Added database readiness reporting.
- Kept Redis, queues, storage, and push reported as `NOT_CONFIGURED`.
- Did not apply any migrations.

## Files Created Or Modified

- `.env.example`
- `jest.config.js`
- `package.json`
- `package-lock.json`
- `prisma.config.ts`
- `prisma/schema.prisma`
- `src/app.ts`
- `src/config/env.ts`
- `src/core/errors/app-error.ts`
- `src/core/errors/error-codes.ts`
- `src/middleware/error-handler.ts`
- `src/routes/auth.routes.ts`
- `src/routes/health.routes.ts`
- `src/routes/index.ts`
- `src/security/auth-middleware.ts`
- `src/security/authorization.ts`
- `src/security/database.ts`
- `src/security/jwt-verifier.ts`
- `src/security/principal.ts`
- `src/security/rate-limit.ts`
- `src/shared/logger.ts`
- `src/shared/safe-json.ts`
- `src/types/express.d.ts`
- `tests/app.test.ts`
- `tests/health.integration.test.ts`
- `tests/security.test.ts`
- `tests/setup-env.ts`

## Packages Added Or Changed

- Added `@prisma/adapter-pg@7.9.0`
- Added `pg@8.16.3`
- `@prisma/client@7.9.0` retained
- `prisma@7.9.0` retained

## Commands Executed

- `Test-Path D:\wpa\furtail\furtail_app_api`
- `Get-Item D:\wpa\furtail\furtail_app_api`
- `Get-ChildItem D:\wpa\furtail\furtail_app_api -Force`
- `Get-PSDrive -PSProvider FileSystem`
- `whoami`
- `[System.Security.Principal.WindowsIdentity]::GetCurrent().Name`
- `[System.IO.Directory]::GetAccessControl('D:\\wpa\\furtail\\furtail_app_api')`
- `git -C D:\wpa\furtail\furtail_app_api status --short`
- `node --version`
- `npm --version`
- `npm pkg get name`
- `npx prisma generate --schema prisma/schema.prisma`
- `npm run check`
- `Start-Process node dist/server.js -WindowStyle Hidden`
- `Invoke-RestMethod http://127.0.0.1:7300/health`
- `Invoke-RestMethod http://127.0.0.1:7300/ready`
- `Invoke-RestMethod http://127.0.0.1:7300/api/v1/version`
- Mocked identity request against `createAppWithDependencies(...)` using `supertest`
- `Stop-Process -Id 11460 -Force`
- `Get-NetTCPConnection -LocalPort 7300 -State Listen`

## Validation Results

- `npm run check` -> passed
- `GET /health` on compiled server -> 200, `status: alive`
- `GET /ready` on compiled server -> 200, `status: ready`, database `NOT_CONFIGURED`
- `GET /api/v1/version` on compiled server -> 200, correct service metadata returned
- Mocked authenticated identity request -> 200, principal returned as expected

## Port Cleanup

- Temporary server process stopped successfully
- Port `7300` confirmed free after shutdown

## Limitations

- No production migrations were applied.
- Central Auth network calls were not performed during tests.
- Database readiness only reports `NOT_CONFIGURED` when `DATABASE_URL` is absent in this workspace.
- The Prisma client is loaded lazily so the server can start without a configured database.

## Reference Repos

- `D:\wpa\furtail\furtail_api` -> git clean
- `D:\wpa\wpa_auth\wpa_auth_api` -> git clean
