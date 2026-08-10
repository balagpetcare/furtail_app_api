import { Client } from 'pg';
import { getPrisma } from '../src/infrastructure/db/prisma-client';

// Migrates legacy Furtail UserProfile.birthdate values to Central Auth's
// canonical User.dateOfBirth column, matched ONLY by the immutable
// UserCentralAuthLink.subject (== Central Auth's User.id / JWT `sub`
// claim) — never by email, never by name, never by heuristic. Central
// Auth's dateOfBirth is authoritative: a non-null Central Auth value is
// NEVER overwritten by this tool, regardless of what Furtail has on file.
//
// Furtail's UserProfile.birthdate column is left in place (not dropped) so
// this migration is reversible/inspectable, but no client should read or
// write it anymore — see the deprecation comment on the schema field.

export interface RowResult {
  furtailUserId: number;
  subject: string | null;
  furtailBirthdate: string | null; // ISO date, or null
  centralAuthUserId: string | null;
  centralAuthDob: string | null; // ISO date, or null
  category: 'migratable' | 'already-matching' | 'conflicting' | 'missing-link';
}

export function isoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Pure classification of a single row given what's already known: never
 * touches a database, never derives anything from an email, and never
 * recommends overwriting a non-null Central Auth DOB. Matching is by
 * `subject` alone (the immutable UserCentralAuthLink.subject == Central
 * Auth User.id / JWT `sub`) — the caller is responsible for having already
 * resolved that link before calling this.
 */
export function classifyDobRow(input: {
  hasSubjectLink: boolean;
  centralAuthUserExists: boolean;
  furtailBirthdate: string | null;
  centralAuthDob: string | null;
}): RowResult['category'] {
  if (!input.hasSubjectLink || !input.centralAuthUserExists) return 'missing-link';
  if (input.centralAuthDob === null) return 'migratable';
  if (input.centralAuthDob === input.furtailBirthdate) return 'already-matching';
  return 'conflicting';
}

function resolveCentralAuthDatabaseUrl(): string {
  // Always required explicitly — this tool must never guess or hardcode
  // Central Auth's database credentials. Set it to the same value as
  // wpa_auth_api's own DATABASE_URL when running locally, e.g.:
  //   CENTRAL_AUTH_DATABASE_URL="postgresql://...@127.0.0.1:5433/wpa_auth_db?schema=public"
  const explicit = process.env.CENTRAL_AUTH_DATABASE_URL;
  if (!explicit) {
    throw new Error(
      'CENTRAL_AUTH_DATABASE_URL environment variable is required (no default/guessed credentials).',
    );
  }
  return explicit;
}

function assertHostIsLocal(url: string, label: string): void {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // fall through to the failure below
  }
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Refusing to --apply: ${label} host "${host || '(unparseable)'}" is not localhost/127.0.0.1. ` +
        'This tool only auto-applies against local development databases.',
    );
  }
}

async function scan(): Promise<{ rows: RowResult[]; centralAuthClient: Client }> {
  const prisma = getPrisma();
  const centralAuthUrl = resolveCentralAuthDatabaseUrl();
  const centralAuthClient = new Client({ connectionString: centralAuthUrl });
  await centralAuthClient.connect();

  const furtailRows = await prisma.userProfile.findMany({
    where: { birthdate: { not: null } },
    select: {
      userId: true,
      birthdate: true,
      user: { select: { centralAuthLink: { select: { subject: true } } } },
    },
    orderBy: { userId: 'asc' },
  });

  const results: RowResult[] = [];
  for (const row of furtailRows) {
    const subject = row.user?.centralAuthLink?.subject ?? null;
    const furtailBirthdate = isoDate(row.birthdate);
    if (!subject) {
      results.push({
        furtailUserId: row.userId,
        subject: null,
        furtailBirthdate,
        centralAuthUserId: null,
        centralAuthDob: null,
        category: 'missing-link',
      });
      continue;
    }

    const caResult = await centralAuthClient.query(
      'SELECT id, date_of_birth FROM users WHERE id = $1',
      [subject],
    );
    if (caResult.rowCount === 0) {
      results.push({
        furtailUserId: row.userId,
        subject,
        furtailBirthdate,
        centralAuthUserId: null,
        centralAuthDob: null,
        category: 'missing-link',
      });
      continue;
    }

    const caRow = caResult.rows[0] as { id: string; date_of_birth: Date | string | null };
    const centralAuthDob = isoDate(caRow.date_of_birth);

    const category = classifyDobRow({
      hasSubjectLink: true,
      centralAuthUserExists: true,
      furtailBirthdate,
      centralAuthDob,
    });

    results.push({
      furtailUserId: row.userId,
      subject,
      furtailBirthdate,
      centralAuthUserId: caRow.id,
      centralAuthDob,
      category,
    });
  }

  return { rows: results, centralAuthClient };
}

export function summarize(rows: RowResult[]) {
  return {
    scanned: rows.length,
    migratable: rows.filter((r) => r.category === 'migratable').length,
    alreadyMatching: rows.filter((r) => r.category === 'already-matching').length,
    conflicting: rows.filter((r) => r.category === 'conflicting').length,
    missingLink: rows.filter((r) => r.category === 'missing-link').length,
  };
}

async function apply(rows: RowResult[], centralAuthClient: Client): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    if (row.category !== 'migratable') continue;
    // Re-check immediately before writing: never overwrite a value that
    // became non-null since the scan (race safety), and never touch a row
    // without a verified subject link.
    if (!row.subject || !row.centralAuthUserId) continue;
    const guardResult = await centralAuthClient.query(
      'UPDATE users SET date_of_birth = $1 WHERE id = $2 AND date_of_birth IS NULL',
      [row.furtailBirthdate, row.centralAuthUserId],
    );
    if ((guardResult.rowCount ?? 0) > 0) applied += 1;
  }
  return applied;
}

async function main() {
  const doApply = process.argv.includes('--apply');
  const { rows, centralAuthClient } = await scan();
  const before = summarize(rows);

  if (!doApply) {
    process.stdout.write(
      JSON.stringify({ mode: 'dry-run', ...before }, null, 2) + '\n',
    );
    await centralAuthClient.end();
    return;
  }

  // Safety gate for --apply: local dev only, and refuse if any row is
  // 'conflicting' (ambiguous — must be resolved manually first, never
  // auto-resolved by this tool).
  if (before.conflicting > 0) {
    process.stderr.write(
      JSON.stringify({
        error:
          'Refusing to --apply: conflicting rows present (Central Auth already has a different non-null DOB). Resolve manually first.',
        conflicting: before.conflicting,
      }) + '\n',
    );
    await centralAuthClient.end();
    process.exitCode = 1;
    return;
  }
  const furtailUrl = process.env.DATABASE_URL ?? '';
  const centralAuthUrl = resolveCentralAuthDatabaseUrl();
  try {
    assertHostIsLocal(furtailUrl, 'Furtail DATABASE_URL');
    assertHostIsLocal(centralAuthUrl, 'Central Auth database');
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n',
    );
    await centralAuthClient.end();
    process.exitCode = 1;
    return;
  }
  if (process.env.NODE_ENV !== 'development') {
    process.stderr.write(
      JSON.stringify({ error: 'Refusing to --apply: NODE_ENV is not "development".' }) + '\n',
    );
    await centralAuthClient.end();
    process.exitCode = 1;
    return;
  }

  const appliedCount = await apply(rows, centralAuthClient);

  // Second scan proves idempotency: re-running immediately after apply must
  // show zero remaining migratable rows.
  await centralAuthClient.end();
  const second = await scan();
  const after = summarize(second.rows);
  await second.centralAuthClient.end();

  process.stdout.write(
    JSON.stringify(
      {
        mode: 'apply',
        before,
        applied: appliedCount,
        secondDryRun: after,
        idempotent: after.migratable === 0,
      },
      null,
      2,
    ) + '\n',
  );
}

// Only auto-run when executed directly (`npx tsx scripts/migrate-dob-to-central-auth.ts`),
// never when imported by a test file for its pure classifyDobRow/summarize
// exports — importing this module must never open a database connection.
const isDirectlyExecuted =
  typeof process.argv[1] === 'string' &&
  process.argv[1].replace(/\\/g, '/').endsWith('migrate-dob-to-central-auth.ts');

if (isDirectlyExecuted) {
  void main()
    .catch((error) => {
      process.stderr.write(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n',
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await getPrisma().$disconnect();
      } catch {
        // ignore shutdown errors
      }
    });
}
