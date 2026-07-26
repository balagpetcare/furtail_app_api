import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Loads variables from a local .env file into process.env if present. In
// containerized/production deployments, real environment variables already
// set by the platform take precedence (dotenv never overwrites an existing
// process.env key by default). `quiet: true` suppresses dotenv's own
// stdout banner, which would otherwise print on every process start
// regardless of log level or whether a .env file exists at all.
loadDotenv({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(7300),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().trim().optional().default(''),
  CENTRAL_AUTH_ISSUER: z.string().trim().optional().default(''),
  CENTRAL_AUTH_AUDIENCE: z.string().trim().default('furtail-mobile'),
  CENTRAL_AUTH_CLIENT_ID: z.string().trim().default('furtail-mobile'),
  CENTRAL_AUTH_JWKS_URI: z.string().trim().optional().default(''),
  CENTRAL_AUTH_REQUIRED_CLAIMS: z
    .string()
    .default('sub,iss,aud,exp,iat,client_id')
    .transform((value) =>
      value
        .split(',')
        .map((claim) => claim.trim())
        .filter((claim) => claim.length > 0),
    ),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((val) =>
      val
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  CORS_ALLOW_CREDENTIALS: z.coerce.boolean().default(true),
  JSON_BODY_LIMIT: z.string().default('2mb'),
  URLENCODED_BODY_LIMIT: z.string().default('2mb'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  SERVICE_NAME: z.string().min(1).default('furtail-app-api'),
  SERVICE_VERSION: z.string().min(1).default('0.1.0'),
});

export type Env = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  DATABASE_URL: string;
  CENTRAL_AUTH_ISSUER: string;
  CENTRAL_AUTH_AUDIENCE: string;
  CENTRAL_AUTH_CLIENT_ID: string;
  CENTRAL_AUTH_JWKS_URI: string;
  CENTRAL_AUTH_REQUIRED_CLAIMS: string[];
  CORS_ALLOWED_ORIGINS: string[];
  CORS_ALLOW_CREDENTIALS: boolean;
  JSON_BODY_LIMIT: string;
  URLENCODED_BODY_LIMIT: string;
  REQUEST_TIMEOUT_MS: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
};

/**
 * Parses and validates process.env once at module load. Throws a clear,
 * aggregated error (never a stack-trace dump of raw env values, which could
 * contain secrets) and exits the process on failure — the API must not
 * start with an invalid configuration.
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Intentionally logs only field names/validation messages, never values,
    // so a misconfigured secret is never printed to stdout/stderr.
    console.error(`Environment validation failed:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}

export const env: Env = loadEnv();
