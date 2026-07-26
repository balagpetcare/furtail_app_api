import 'express';
import type { AuthenticatedPrincipal } from '../security/principal';

declare global {
  namespace Express {
    interface Request {
      /** Unique ID for this specific inbound HTTP request. */
      requestId: string;
      /**
       * ID that threads a logical operation across multiple requests/services.
       * Taken from an inbound `X-Correlation-Id` header when present,
       * otherwise defaults to the request's own `requestId`.
       */
      correlationId: string;
      /** Authenticated principal attached by auth middleware, if present. */
      principal?: AuthenticatedPrincipal;
    }
  }
}

export {};
