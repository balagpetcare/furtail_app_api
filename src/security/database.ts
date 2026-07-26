import { env } from '../config/env';
import { AppError } from '../core/errors/app-error';

export type DatabaseReadinessStatus = 'READY' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

export interface DatabaseReadinessResult {
  status: DatabaseReadinessStatus;
  details?: string;
}

export interface DatabaseReadinessService {
  check(): Promise<DatabaseReadinessResult>;
}

type DatabaseClient = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
};

export class PrismaReadinessService implements DatabaseReadinessService {
  private client?: DatabaseClient;

  async check(): Promise<DatabaseReadinessResult> {
    if (!env.DATABASE_URL) {
      return { status: 'NOT_CONFIGURED' };
    }
    try {
      const client = await this.getClient();
      await client.$queryRaw`SELECT 1`;
      return { status: 'READY' };
    } catch (error) {
      return {
        status: 'UNAVAILABLE',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getClient(): Promise<DatabaseClient> {
    if (!env.DATABASE_URL) {
      throw AppError.databaseUnavailable('DATABASE_URL is not configured');
    }

    if (!this.client) {
      const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
        import('../../node_modules/.prisma/client/client'),
        import('@prisma/adapter-pg'),
      ]);
      this.client = new PrismaClient({
        adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
      }) as DatabaseClient;
    }

    return this.client;
  }
}

export function createDatabaseReadinessService(): DatabaseReadinessService {
  return new PrismaReadinessService();
}
