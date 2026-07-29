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
  CENTRAL_AUTH_JWT_SECRET: z.string().trim().optional().default(''),
  CENTRAL_AUTH_REQUIRED_CLAIMS: z
    .string()
    .default('sub,iss,aud,exp,iat')
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
  CENTRAL_AUTH_JWT_SECRET: string;
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
  const parsed = result.data;

  if (parsed.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (
      !parsed.DATABASE_URL ||
      parsed.DATABASE_URL.includes('localhost') ||
      parsed.DATABASE_URL.includes('127.0.0.1')
    ) {
      missing.push('DATABASE_URL (must point to a production database host)');
    }
    if (!parsed.CENTRAL_AUTH_ISSUER || !parsed.CENTRAL_AUTH_ISSUER.startsWith('https://')) {
      missing.push('CENTRAL_AUTH_ISSUER (must be a secure HTTPS url)');
    }
    if (!parsed.CENTRAL_AUTH_JWKS_URI || !parsed.CENTRAL_AUTH_JWKS_URI.startsWith('https://')) {
      missing.push('CENTRAL_AUTH_JWKS_URI (must be a secure HTTPS url)');
    }
    if (!parsed.CENTRAL_AUTH_JWT_SECRET || parsed.CENTRAL_AUTH_JWT_SECRET.length < 16) {
      missing.push('CENTRAL_AUTH_JWT_SECRET (must be a strong secret of at least 16 characters)');
    }
    if (parsed.CORS_ALLOWED_ORIGINS.length === 0) {
      missing.push('CORS_ALLOWED_ORIGINS (must contain production domains)');
    }

    if (missing.length > 0) {
      console.error(
        `Production environment validation failed:\n${missing.map((m) => `  - ${m}`).join('\n')}`,
      );
      process.exit(1);
    }
  }

  return parsed;
}

export const env: Env = loadEnv();
