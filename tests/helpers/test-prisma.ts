import { config as loadDotenv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';

let cached: PrismaClient | null = null;

/**
 * A real Prisma client pointed at the dedicated **test** database
 * (`furtail_app_test` — see `.env.test`), for suites that deliberately
 * need genuine persistence (fundraising verification/campaign/donation
 * durability). This helper must never point at the developer database;
 * integration tests can freely wipe/reseed rows only in the dedicated
 * test database.
 *
 * Independent of `env.DATABASE_URL`, which `tests/setup-env.ts` forces
 * empty for every test run so identity resolution stays deterministic.
 * Reads `.env.test` via `dotenv`'s `parsed` result, which reflects the
 * file's contents regardless of what's already been written into
 * `process.env`.
 */
export function getTestPrisma(): PrismaClient {
  if (cached) return cached;
  const fromTestFile = loadDotenv({ path: '.env.test', quiet: true, processEnv: {} }).parsed;
  const url = fromTestFile?.DATABASE_URL || '';
  if (!url) {
    throw new Error(
      'tests/helpers/test-prisma.ts: no DATABASE_URL found in .env.test — a real ' +
        'local Postgres test database is required for fundraising persistence tests.',
    );
  }
  const pool = new Pool({ connectionString: url });
  cached = new PrismaClient({ adapter: new PrismaPg(pool) });
  return cached;
}

/** Closes the cached test client's connection pool — call from `afterAll`. */
export async function disconnectTestPrisma(): Promise<void> {
  if (cached) {
    await cached.$disconnect();
    cached = null;
  }
}
