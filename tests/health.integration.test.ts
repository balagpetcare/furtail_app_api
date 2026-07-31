import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import { Pool } from 'pg';
import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import type { DatabaseReadinessService } from '../src/security/database';

type HealthTestHarness = {
  app: ReturnType<typeof createAppWithDependencies>;
  databaseName: string | null;
  close: () => Promise<void>;
};

function loadTestDatabaseUrl(): string {
  const parsed = loadDotenv({ path: '.env.test', quiet: true, processEnv: {} }).parsed;
  const databaseUrl = parsed?.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) {
    throw new Error(
      'tests/health.integration.test.ts: expected DATABASE_URL in .env.test for furtail_app_test',
    );
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (databaseName !== 'furtail_app_test') {
    throw new Error(
      `tests/health.integration.test.ts: expected furtail_app_test, found ${databaseName || '<missing>'}`,
    );
  }

  return databaseUrl;
}

function buildInvalidDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/furtail_app_test_unreachable';
  return url.toString();
}

function sanitizeDatabaseError(error: unknown, databaseUrl: string): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const parsed = new URL(databaseUrl);
  let sanitized = rawMessage.replaceAll(databaseUrl, '<redacted-database-url>');
  if (parsed.username) {
    sanitized = sanitized.replaceAll(parsed.username, '<redacted-username>');
  }
  if (parsed.password) {
    sanitized = sanitized.replaceAll(parsed.password, '<redacted-password>');
  }

  return sanitized.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, 'postgresql://<redacted>');
}

function createHealthTestHarness(databaseUrl?: string): HealthTestHarness {
  if (!databaseUrl) {
    const databaseReadiness: DatabaseReadinessService = {
      async check() {
        return { status: 'NOT_CONFIGURED' };
      },
    };

    return {
      app: createAppWithDependencies({ databaseReadiness }),
      databaseName: null,
      close: async () => undefined,
    };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');

  const databaseReadiness: DatabaseReadinessService = {
    async check() {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'READY' };
      } catch (error) {
        return {
          status: 'UNAVAILABLE',
          details: sanitizeDatabaseError(error, databaseUrl),
        };
      }
    },
  };

  return {
    app: createAppWithDependencies({ databaseReadiness }),
    databaseName,
    close: async () => {
      await prisma.$disconnect().catch(() => undefined);
      await pool.end().catch(() => undefined);
    },
  };
}

describe('GET /health', () => {
  it('returns 200 and an alive status without checking external services', async () => {
    const harness = createHealthTestHarness();
    try {
      const res = await request(harness.app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ status: 'alive' });
    } finally {
      await harness.close();
    }
  });

  it('sets an X-Request-Id response header', async () => {
    const harness = createHealthTestHarness();
    try {
      const res = await request(harness.app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
    } finally {
      await harness.close();
    }
  });
});

describe('GET /ready', () => {
  it('returns READY when the configured furtail_app_test database is reachable', async () => {
    const testDatabaseUrl = loadTestDatabaseUrl();
    const harness = createHealthTestHarness(testDatabaseUrl);
    try {
      expect(harness.databaseName).toBe('furtail_app_test');

      const res = await request(harness.app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        status: 'ready',
        dependencies: {
          database: {
            status: 'READY',
          },
          redis: 'NOT_CONFIGURED',
          queue: 'NOT_CONFIGURED',
          storage: 'NOT_CONFIGURED',
          push: 'NOT_CONFIGURED',
          auth: 'NOT_CONFIGURED',
        },
      });
    } finally {
      await harness.close();
    }
  });

  it('returns NOT_CONFIGURED when no database URL is supplied', async () => {
    const harness = createHealthTestHarness();
    try {
      const res = await request(harness.app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.dependencies.database.status).toBe('NOT_CONFIGURED');
    } finally {
      await harness.close();
    }
  });

  it('returns a non-ready status for a configured but unreachable database without leaking credentials', async () => {
    const testDatabaseUrl = loadTestDatabaseUrl();
    const unreachableUrl = buildInvalidDatabaseUrl(testDatabaseUrl);
    const harness = createHealthTestHarness(unreachableUrl);
    try {
      const res = await request(harness.app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('degraded');
      expect(res.body.data.dependencies.database.status).toBe('UNAVAILABLE');

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(unreachableUrl);
    } finally {
      await harness.close();
    }
  });
});

describe('GET /api/v1/version', () => {
  it('returns service metadata without leaking filesystem paths', async () => {
    const harness = createHealthTestHarness();
    try {
      const res = await request(harness.app).get('/api/v1/version');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        service: 'furtail-app-api',
        apiVersion: 'v1',
        applicationVersion: '0.1.0',
        environment: 'test',
      });
      expect(typeof res.body.data.uptimeSeconds).toBe('number');

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/[A-Z]:\\/); // no Windows filesystem path
      expect(serialized).not.toContain(process.cwd());
    } finally {
      await harness.close();
    }
  });
});

describe('unmatched routes', () => {
  it('returns a 404 error envelope for an unknown route', async () => {
    const harness = createHealthTestHarness();
    try {
      const res = await request(harness.app).get('/this-route-does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    } finally {
      await harness.close();
    }
  });
});
