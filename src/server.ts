import { createApp } from './app';
import { env } from './config/env';
import { logger } from './shared/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      service: env.SERVICE_NAME,
      dotenvPath: `${process.cwd()}\\.env`,
      authVerifier: {
        issuer: env.CENTRAL_AUTH_ISSUER,
        jwksUri: env.CENTRAL_AUTH_JWKS_URI,
        allowedAudiences: env.CENTRAL_AUTH_ALLOWED_AUDIENCES,
        allowedClientIds: env.CENTRAL_AUTH_ALLOWED_CLIENT_IDS,
        hasAllowedAudiencesEnv: Boolean(process.env.CENTRAL_AUTH_ALLOWED_AUDIENCES),
        hasAllowedClientIdsEnv: Boolean(process.env.CENTRAL_AUTH_ALLOWED_CLIENT_IDS),
      },
    },
    'server started',
  );
});

// Defense in depth alongside the per-request timeout middleware in app.ts:
// caps how long the underlying socket will wait for a slow/stalled client.
server.requestTimeout = env.REQUEST_TIMEOUT_MS;

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'shutdown signal received, closing server');

  const forceExitTimer = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close((err) => {
    clearTimeout(forceExitTimer);
    if (err) {
      logger.error({ err }, 'error while closing server');
      process.exit(1);
    }
    logger.info('server closed cleanly');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
  // An uncaught exception leaves the process in a potentially inconsistent
  // state; log it, then exit non-zero so the process manager restarts a
  // clean instance rather than continuing to serve traffic from a
  // possibly-corrupted state.
  process.exit(1);
});

export { server };
