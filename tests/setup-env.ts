// Ensures a deterministic, valid environment for every test run, independent
// of whatever is (or isn't) set in the shell. Runs before any test file
// imports app/env modules, per jest.config.js's `setupFiles`.
//
// DATABASE_URL is deliberately forced empty (not read from `.env`): with it
// empty, `defaultIdentityResolver` (social-store.ts) falls back to parsing
// a test principal's `sub` directly as the numeric user id instead of
// JIT-provisioning a real row through Prisma — the entire existing test
// suite relies on that determinism (e.g. "token-1" always means user id 1).
// Tests that genuinely need a real database (fundraising verification/
// campaign/donation persistence) construct their own Prisma client pointed
// at the dedicated *test* database (`.env.test` — a separate logical
// database from the one `npm run dev` uses, even though both currently
// live on the same shared local Postgres server) and inject it explicitly
// — see tests/helpers/test-prisma.ts — rather than flipping this global
// switch.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.SERVICE_NAME = process.env.SERVICE_NAME ?? 'furtail-app-api';
process.env.SERVICE_VERSION = process.env.SERVICE_VERSION ?? '0.1.0';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? '';
process.env.CENTRAL_AUTH_ISSUER = process.env.CENTRAL_AUTH_ISSUER ?? 'https://central-auth.test';
process.env.CENTRAL_AUTH_AUDIENCE = process.env.CENTRAL_AUTH_AUDIENCE ?? 'furtail-mobile';
process.env.CENTRAL_AUTH_CLIENT_ID = process.env.CENTRAL_AUTH_CLIENT_ID ?? 'furtail-mobile';
process.env.CENTRAL_AUTH_JWKS_URI =
  process.env.CENTRAL_AUTH_JWKS_URI ?? 'https://central-auth.test/.well-known/jwks.json';
// Fixed test-only KYC encryption key (AES-256-GCM) — see
// src/modules/fundraising/kyc-encryption.ts. Never used outside the test
// process; real dev/prod keys live only in .env/.env.local/.env.test and a
// real secret manager, never in source control as an active key.
process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS =
  process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS ??
  '{"1":"s0DsbtZoVyvMTuFQ2XfJhkoem1UzfEQXfDJ/BWE4To8="}';
process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION =
  process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION ?? '1';
