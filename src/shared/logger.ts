import pino from 'pino';

import { env } from '../config/env';

/**
 * Shared structured JSON logger. Redaction paths cover the header/field
 * names most likely to carry secrets if they're ever accidentally logged
 * (e.g. via a spread of `req.headers`) — this is a safety net, not a
 * substitute for not logging secrets in the first place.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: env.SERVICE_NAME,
    version: env.SERVICE_VERSION,
    env: env.NODE_ENV,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.body.password',
      'req.body.passcode',
      'req.body.token',
      'req.body.accessToken',
      'req.body.refreshToken',
      'req.body.authorizationCode',
      'req.body.code',
      'req.body.secret',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.authorizationCode',
      '*.code',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});
