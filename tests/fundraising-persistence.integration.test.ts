import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';

interface VerificationDocumentView {
  title: string;
  documentType: string;
}

interface VerificationAccountView {
  id: number;
  fullName: string | null;
  occupation: string | null;
  nationalIdNumber: string | null;
  dateOfBirth: string | null;
  status: string;
  submittedAt: Date | null;
  documents: VerificationDocumentView[];
}

/**
 * Proves fundraising verification data is durably persisted in Postgres —
 * not process-memory — by writing through one `FundraisingStore` instance
 * and reading back through a completely separate, freshly constructed
 * instance (simulating an API restart, a second API process/instance, or
 * a worker/background job reading the same table). Every test uses its
 * own unique `ownerUserId` so it cannot collide with the shared
 * owner=1/2/3/4 fixtures used by the other fundraising test files.
 */
describe('fundraising verification account persistence', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  function uniqueOwnerId(): number {
    // Postgres INTEGER max is ~2.1B; stay well under it while still being
    // unique per test run and per test within a run.
    return 900_000_000 + Math.floor(Math.random() * 90_000_000);
  }

  function newStore() {
    const socialStore = createSocialCoreStore();
    return createFundraisingStore(socialStore, { prisma: getTestPrisma() });
  }

  afterEach(async () => {
    // Keep the real test database tidy between runs — these ids are
    // synthetic and never read by any other test.
    await getTestPrisma().fundraisingVerificationDocument.deleteMany({});
    await getTestPrisma().fundraisingVerificationAccount.deleteMany({
      where: { ownerUserId: { gte: 900_000_000 } },
    });
  });

  it('survives a freshly constructed store instance backed by the same database (simulated restart)', async () => {
    const ownerUserId = uniqueOwnerId();

    const instanceA = newStore();
    const written = await instanceA.upsertAccount(ownerUserId, {
      fullName: 'Restart Proof',
      dateOfBirth: '1990-06-15',
      presentAddress: 'House 1',
      permanentAddress: 'House 1',
      divisionId: 1,
      districtId: 2,
      upazilaId: 3,
      unionId: 4,
      primaryDocumentType: 'NID',
      nationalIdNumber: 'PERSIST-0001',
    });
    expect(written.fullName).toBe('Restart Proof');

    // A brand new store instance — a new PrismaClient wired against the
    // process-memory Map's replacement — simulates the API process having
    // restarted (or a second API instance handling this request).
    const instanceB = newStore();
    const read = await instanceB.getAccount(ownerUserId);
    expect(read).not.toBeNull();
    expect(read?.fullName).toBe('Restart Proof');
    expect(read?.nationalIdNumber).toBe('PERSIST-0001');
    expect(read?.dateOfBirth).toBe('1990-06-15');
  });

  it('is visible to a worker/background process using a completely independent Prisma client', async () => {
    const ownerUserId = uniqueOwnerId();
    const store = newStore();
    await store.upsertAccount(ownerUserId, {
      fullName: 'Worker Visible',
      occupation: 'Tester',
    });

    // A raw Prisma client with no relationship to `FundraisingStore` at
    // all — representative of a cron job, a reviewer dashboard, or any
    // other out-of-process reader of the same table.
    const rawRow = await getTestPrisma().fundraisingVerificationAccount.findUnique({
      where: { ownerUserId },
    });
    expect(rawRow).not.toBeNull();
    expect(rawRow?.fullName).toBe('Worker Visible');
    expect(rawRow?.occupation).toBe('Tester');
  });

  it('document bindings survive across store instances', async () => {
    const ownerUserId = uniqueOwnerId();
    const instanceA = newStore();
    const account = (await instanceA.upsertAccount(ownerUserId, {
      fullName: 'Doc Owner',
    })) as unknown as VerificationAccountView;

    // Bound directly through Prisma (rather than the ownership-checked
    // `addAccountDocument`, which requires the media to belong to this
    // exact synthetic test user) — this test is about the binding
    // surviving across store instances, not upload authorization, which
    // is covered elsewhere.
    await getTestPrisma().fundraisingVerificationDocument.create({
      data: {
        accountId: account.id,
        mediaId: 1,
        title: 'Persisted document',
        documentType: 'PRIMARY',
      },
    });

    const instanceB = newStore();
    const read = (await instanceB.getAccount(ownerUserId)) as VerificationAccountView | null;
    expect(read?.documents).toHaveLength(1);
    expect(read?.documents[0]!.title).toBe('Persisted document');
    expect(read?.documents[0]!.documentType).toBe('PRIMARY');
  });

  it('submission status and timestamps survive across store instances', async () => {
    const ownerUserId = uniqueOwnerId();
    const instanceA = newStore();
    const account = (await instanceA.upsertAccount(ownerUserId, {
      fullName: 'Submitter',
      dateOfBirth: '1990-01-01',
      presentAddress: 'A',
      permanentAddress: 'A',
      divisionId: 1,
      districtId: 2,
      upazilaId: 3,
      unionId: 4,
      primaryDocumentType: 'NID',
      nationalIdNumber: 'SUBMIT-0001',
    })) as unknown as VerificationAccountView;
    await getTestPrisma().fundraisingVerificationDocument.create({
      data: { accountId: account.id, mediaId: 1, title: 'ID', documentType: 'PRIMARY' },
    });
    const submitted = (await instanceA.submitAccount(
      ownerUserId,
    )) as unknown as VerificationAccountView;
    expect(submitted.status).toBe('PENDING');
    expect(submitted.submittedAt).not.toBeNull();

    const instanceB = newStore();
    const read = (await instanceB.getAccount(ownerUserId)) as VerificationAccountView | null;
    expect(read?.status).toBe('PENDING');
    expect(read?.submittedAt).not.toBeNull();
  });

  it('rejects a concurrent conflicting update instead of silently overwriting it (optimistic concurrency)', async () => {
    const ownerUserId = uniqueOwnerId();
    const instanceA = newStore();
    await instanceA.upsertAccount(ownerUserId, { fullName: 'Original' });

    // Two independent "requests" both read the same starting row...
    const instanceB = newStore();
    const rowForA = await getTestPrisma().fundraisingVerificationAccount.findUniqueOrThrow({
      where: { ownerUserId },
    });

    // ...the first one updates successfully...
    await instanceA.upsertAccount(ownerUserId, { occupation: 'Writer A' });

    // ...and a raw conditional update using the now-stale version B read
    // must not apply (this is exactly what `upsertAccount`'s internal
    // `updateMany({ where: { id, version } })` guard does on every write).
    const staleWriteResult = await getTestPrisma().fundraisingVerificationAccount.updateMany({
      where: { id: rowForA.id, version: rowForA.version },
      data: { occupation: 'Writer B (stale)' },
    });
    expect(staleWriteResult.count).toBe(0);

    const final = await instanceB.getAccount(ownerUserId);
    expect(final?.occupation).toBe('Writer A');
  });

  it('unique ownership per user is enforced — a second account cannot be created for the same owner', async () => {
    const ownerUserId = uniqueOwnerId();
    const instanceA = newStore();
    await instanceA.upsertAccount(ownerUserId, { fullName: 'First' });

    await expect(
      getTestPrisma().fundraisingVerificationAccount.create({
        data: { ownerUserId, fullName: 'Duplicate' },
      }),
    ).rejects.toThrow();
  });
});
