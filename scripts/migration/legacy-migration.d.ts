export type LegacyMigrationRow = Record<string, unknown>;

export interface LegacyMigrationJob {
  name: string;
  table: string;
  cursorColumn: string;
  keyColumns: string[];
  columns: string[];
  requiredColumns?: string[];
  aliases?: Record<string, string[]>;
  description?: string;
}

export interface LegacyMigrationManifest {
  version: number;
  jobs: LegacyMigrationJob[];
}

export interface LegacyMigrationStore {
  fetchBatch(
    job: LegacyMigrationJob,
    cursor: unknown,
    limit: number,
  ): Promise<LegacyMigrationRow[]>;
  upsertBatch(job: LegacyMigrationJob, rows: LegacyMigrationRow[]): Promise<void>;
  snapshot(job: LegacyMigrationJob): Promise<LegacyMigrationRow[]>;
  close?(): Promise<void>;
}

export interface RunLegacyMigrationOptions {
  source: LegacyMigrationStore;
  destination: LegacyMigrationStore;
  manifest: LegacyMigrationManifest;
  checkpointFilePath?: string;
  rejectedFilePath?: string;
  dryRun?: boolean;
  batchSize?: number;
  reconcile?: boolean;
  signal?: AbortSignal;
  cancelFilePath?: string;
  onProgress?: (event: {
    job: string;
    cursor: unknown;
    sourceRows: number;
    migratedRows: number;
    rejectedRows: number;
  }) => void;
}

export interface LegacyMigrationSummary {
  dryRun: boolean;
  cancelled: boolean;
  batchSize: number;
  sourceRows: number;
  migratedRows: number;
  rejectedRows: number;
  checksum: string;
  jobs: Array<Record<string, unknown>>;
  reconciliations: Array<Record<string, unknown>>;
}

export class FixtureStore implements LegacyMigrationStore {
  constructor(seed?: Record<string, LegacyMigrationRow[]>);
  fetchBatch(
    job: LegacyMigrationJob,
    cursor: unknown,
    limit: number,
  ): Promise<LegacyMigrationRow[]>;
  upsertBatch(job: LegacyMigrationJob, rows: LegacyMigrationRow[]): Promise<void>;
  snapshot(job: LegacyMigrationJob): Promise<LegacyMigrationRow[]>;
  clone(): FixtureStore;
  close?(): Promise<void>;
}

export function checksumRows(rows: LegacyMigrationRow[]): string;
export function createPgStore(connectionString: string, role: string): LegacyMigrationStore;
export function loadManifest(manifestPath?: string): LegacyMigrationManifest;
export function parseArgs(argv: string[]): Record<string, string | boolean>;
export function redactUrl(value: string): string;
export function runCli(argv: string[]): Promise<void>;
export function runLegacyMigration(
  options: RunLegacyMigrationOptions,
): Promise<LegacyMigrationSummary>;
export function writeJsonAtomic(filePath: string | undefined, data: unknown): void;
export function readJson<T>(filePath: string | undefined, fallback: T): T;
