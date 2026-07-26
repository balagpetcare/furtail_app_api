// Ensures a deterministic, valid environment for every test run, independent
// of whatever is (or isn't) set in the shell. Runs before any test file
// imports app/env modules, per jest.config.js's `setupFiles`.
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
