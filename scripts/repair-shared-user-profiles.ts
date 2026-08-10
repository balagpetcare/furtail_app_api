import { getPrisma } from '../src/infrastructure/db/prisma-client';
import { repairEmailDerivedProfiles } from '../src/modules/profile/shared-user-profile';

// Safety gate: this tool mutates displayName/username/bio in bulk. `--apply`
// is refused unless the configured DATABASE_URL clearly points at a local
// dev database (host is localhost/127.0.0.1, or NODE_ENV=development and
// the URL doesn't look like a managed/production hostname). `--dry-run`
// always runs regardless of environment since it never writes.
function assertSafeToApply(): void {
  const url = process.env.DATABASE_URL ?? '';
  const nodeEnv = process.env.NODE_ENV ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // Unparseable URL — fail closed below.
  }
  const looksLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  const looksDev = nodeEnv === 'development';
  if (!looksLocal || !looksDev) {
    console.error(
      JSON.stringify({
        error:
          'Refusing to --apply: DATABASE_URL host is not localhost/127.0.0.1 or NODE_ENV is not "development". ' +
          'This command only auto-applies against a local development database. Run --dry-run to preview, ' +
          'or apply intentionally via a reviewed migration/admin action for any other environment.',
        host: host || '(unparseable)',
        nodeEnv,
      }),
    );
    process.exit(1);
  }
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  if (!dryRun) {
    assertSafeToApply();
  }

  const prisma = getPrisma();
  const result = await repairEmailDerivedProfiles(prisma, { dryRun });

  process.stdout.write(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'apply',
        scanned: result.scanned,
        changed: result.changed,
        repairable: result.repairable,
        skipped: result.skipped,
        conflicting: result.conflicting,
        conflictingUserIds: result.items
          .filter((item) => item.outcome === 'conflicting')
          .map((item) => item.userId),
      },
      null,
      2,
    ) + '\n',
  );
}

void main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
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
