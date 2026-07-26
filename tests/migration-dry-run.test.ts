import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import manifest from '../scripts/migration/legacy-data.manifest.json';
import { FixtureStore, runLegacyMigration } from '../scripts/migration/legacy-migration';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readJsonLines(filePath: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('legacy migration dry-run tooling', () => {
  it('supports dry-run, checkpointing, reconciliation, and rejected-row redaction', async () => {
    const workDir = tempDir('furtail-migrate-');
    const checkpointPath = path.join(workDir, 'checkpoint.json');
    const rejectedPath = path.join(workDir, 'rejected.jsonl');

    const source = new FixtureStore({
      userNotificationPrefs: [
        { userId: 1, allowEmail: true, allowSms: false, updatedAt: '2026-07-01' },
      ],
      userDeviceToken: [
        {
          id: 11,
          userId: 1,
          token: 'device-token-1',
          platform: 'ios',
          provider: 'fcm',
          isActive: true,
          createdAt: '2026-07-01',
          updatedAt: '2026-07-01',
          lastSeenAt: '2026-07-01',
        },
      ],
      notification: [
        {
          id: 101,
          recipientId: 1,
          type: 'follow',
          title: 'New follower',
          body: 'Amina followed you',
          actorId: 2,
          actorName: 'Amina',
          actorAvatarUrl: 'memory://avatar',
          deepLink: '/profile/2',
          createdAt: '2026-07-01',
          readAt: null,
          deliveryStatus: 'SENT',
          deliveryAttempts: 1,
          lastDeliveryError: null,
          sourceKey: 'follow:2:1',
        },
      ],
      notificationRead: [{ notificationId: 101, userId: 1, readAt: '2026-07-01' }],
      report: [
        {
          id: 501,
          reporterId: 1,
          type: 'USER',
          targetId: 2,
          reasonCode: 'SPAM',
          details: 'spam report',
          createdAt: '2026-07-01',
          status: 'SUBMITTED',
          sourceKey: '1:USER:2:SPAM:spam report',
        },
        {
          id: 502,
          reporterId: 1,
          type: 'USER',
          targetId: 3,
          reasonCode: 'SPAM',
          accessToken: 'do-not-print-this',
          status: 'SUBMITTED',
          sourceKey: '1:USER:3:SPAM:',
        },
      ],
    });
    const destination = new FixtureStore();
    const notificationsJob = manifest.jobs.find(
      (job: { name: string }) => job.name === 'notifications',
    );
    if (!notificationsJob) throw new Error('notifications job missing from manifest');

    const summary = await runLegacyMigration({
      source,
      destination,
      manifest,
      checkpointFilePath: checkpointPath,
      rejectedFilePath: rejectedPath,
      dryRun: true,
      batchSize: 1,
      reconcile: true,
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.cancelled).toBe(false);
    expect(summary.sourceRows).toBeGreaterThan(0);
    expect(summary.migratedRows).toBeGreaterThan(0);
    expect(summary.rejectedRows).toBeGreaterThan(0);
    const reconciliations = summary.reconciliations as Array<{ match: boolean }>;
    expect(reconciliations.every((entry) => entry.match)).toBe(true);

    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as {
      jobs: Record<string, { complete: boolean }>;
    };
    expect(Object.values(checkpoint.jobs).every((job) => job.complete)).toBe(true);
    await expect(destination.snapshot(notificationsJob)).resolves.toBeDefined();

    const rejected = readJsonLines(rejectedPath);
    expect(rejected).toHaveLength(1);
    expect(JSON.stringify(rejected[0])).not.toContain('do-not-print-this');
  });

  it('resumes idempotently from an existing checkpoint', async () => {
    const workDir = tempDir('furtail-migrate-resume-');
    const checkpointPath = path.join(workDir, 'checkpoint.json');

    const source = new FixtureStore({
      notification: [
        { id: 1, recipientId: 1, type: 'follow', title: 'A', body: 'A', createdAt: '2026-07-01' },
        { id: 2, recipientId: 1, type: 'follow', title: 'B', body: 'B', createdAt: '2026-07-02' },
      ],
    });
    const destination = new FixtureStore();
    const notificationsJob = manifest.jobs.find(
      (job: { name: string }) => job.name === 'notifications',
    );
    if (!notificationsJob) throw new Error('notifications job missing from manifest');

    const first = await runLegacyMigration({
      source,
      destination,
      manifest: { version: 1, jobs: [notificationsJob] },
      checkpointFilePath: checkpointPath,
      dryRun: false,
      batchSize: 1,
    });

    const second = await runLegacyMigration({
      source,
      destination,
      manifest: { version: 1, jobs: [notificationsJob] },
      checkpointFilePath: checkpointPath,
      dryRun: false,
      batchSize: 1,
    });

    expect(first.migratedRows).toBe(2);
    expect(second.migratedRows).toBe(0);
    expect((await destination.snapshot(notificationsJob)).length).toBe(2);
  });

  it('honors cancellation before mutating destination data', async () => {
    const workDir = tempDir('furtail-migrate-cancel-');
    const cancelPath = path.join(workDir, 'cancel.flag');
    fs.writeFileSync(cancelPath, 'stop', 'utf8');

    const source = new FixtureStore({
      report: [
        {
          id: 1,
          reporterId: 1,
          type: 'USER',
          targetId: 2,
          reasonCode: 'SPAM',
          createdAt: '2026-07-01',
        },
      ],
    });
    const destination = new FixtureStore();
    const reportsJob = manifest.jobs.find((job: { name: string }) => job.name === 'reports');
    if (!reportsJob) throw new Error('reports job missing from manifest');

    const summary = await runLegacyMigration({
      source,
      destination,
      manifest: { version: 1, jobs: [reportsJob] },
      checkpointFilePath: path.join(workDir, 'checkpoint.json'),
      dryRun: false,
      batchSize: 1,
      cancelFilePath: cancelPath,
    });

    expect(summary.cancelled).toBe(true);
    expect((await destination.snapshot(reportsJob)).length).toBe(0);
  });
});
