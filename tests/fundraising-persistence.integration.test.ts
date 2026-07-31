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

  it('does not collide on primary key when two fresh store instances (simulated restarts) each create a brand-new account', async () => {
    // Each `FundraisingStore` instance seeds its in-memory id allocator at 1
    // and never resyncs it against the database's actual max id — so if
    // account creation ever pins an explicit `id` in the Prisma `create`
    // payload instead of letting Postgres autoincrement assign it, the
    // very first account created by a second (restarted) process collides
    // with a low id already persisted by the first. This reproduces that
    // restart sequence directly against a real Postgres unique constraint.
    const ownerUserIdA = uniqueOwnerId();
    const ownerUserIdB = uniqueOwnerId();

    const instanceA = newStore();
    const accountA = (await instanceA.upsertAccount(ownerUserIdA, {
      fullName: 'First Process Account',
    })) as unknown as VerificationAccountView;

    // A second, independently constructed store instance — its id
    // allocator starts fresh at 1 again, exactly like a real API restart.
    const instanceB = newStore();
    const accountB = (await instanceB.upsertAccount(ownerUserIdB, {
      fullName: 'Second Process Account',
    })) as unknown as VerificationAccountView;

    expect(accountA.id).not.toBe(accountB.id);
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

interface DraftView {
  id: number;
  status: string;
}

interface CampaignPayloadView {
  id: number;
  publicId: string;
  status: string;
}

/**
 * Reproduces the exact restart-collision this fix addresses: the database
 * already holds fundraising_campaign_drafts/fundraising_campaigns rows at
 * nontrivial ids (simulating a long-lived dev database), and a *fresh*
 * `FundraisingStore` instance — whose in-memory nextDraftId/nextCampaignId
 * counters always restart at 1, exactly like a real API process restart —
 * must still create a new draft and submit a campaign without a Prisma
 * P2002 unique-constraint collision on `id`.
 */
describe('fundraising campaign/draft id allocation survives a restart with existing high ids', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  function newStore() {
    const socialStore = createSocialCoreStore();
    return {
      store: createFundraisingStore(socialStore, { prisma: getTestPrisma() }),
      socialStore,
    };
  }

  function uniqueOwnerId(): number {
    return 910_000_000 + Math.floor(Math.random() * 9_000_000);
  }

  /**
   * `tests/setup-env.ts` forces `env.DATABASE_URL` empty, so
   * `defaultIdentityResolver` takes its local-fixture fallback branch
   * (`sub` treated directly as an already-numeric local user id) rather
   * than JIT-provisioning through the real auth flow. This call is still
   * required on *every* fresh store instance before any fundraising call
   * that renders `userPayload` (every draft/campaign response nests the
   * owner's profile) — it populates that instance's in-memory user shadow
   * `mustGetUser` reads from.
   */
  async function resolveOwner(
    socialStore: ReturnType<typeof createSocialCoreStore>,
    ownerUserId: number,
  ): Promise<number> {
    const id = await socialStore.resolveUserId({ sub: String(ownerUserId) });
    if (id === null) throw new Error('Failed to resolve test owner user id');
    return id;
  }

  function draftInput(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Help Rex recover',
      caption: 'Rex needs urgent surgery',
      category: 'MEDICAL',
      fundingMode: 'ONE_TIME',
      currencyCode: 'BDT',
      targetAmountMinor: 500000,
      deadline: '2026-09-15T00:00:00.000Z',
      beneficiaryType: 'PET',
      beneficiaryName: 'Rex',
      ...overrides,
    };
  }

  /** Seeds a campaign/draft pair at a deliberately high id so a store whose
   * in-memory counter naively restarts at 1 would collide with it. */
  async function seedHighIdCampaign(ownerUserId: number): Promise<number> {
    const draft = await getTestPrisma().fundraisingCampaignDraft.create({
      data: {
        id: 500_000 + Math.floor(Math.random() * 50_000),
        publicId: `draft_seed_${ownerUserId}`,
        ownerUserId,
        status: 'PENDING_REVIEW',
        title: 'Seed campaign',
        caption: 'Seed',
        category: 'MEDICAL',
        targetAmountMinor: 100000,
        beneficiaryType: 'PET',
        beneficiaryName: 'Seed Pet',
      },
    });
    await getTestPrisma().fundraisingCampaign.create({
      data: {
        id: draft.id,
        publicId: `campaign_seed_${ownerUserId}`,
        ownerUserId,
        draftId: draft.id,
        title: 'Seed campaign',
        status: 'PENDING_REVIEW',
      },
    });
    return draft.id;
  }

  // Seeded/created rows in this suite are identified by their distinctive
  // titles (real JIT-provisioned owner ids are ordinary small integers, so
  // they can't be used as a cleanup filter the way the other describe
  // blocks in this file use `ownerUserId >= 900_000_000`).
  afterEach(async () => {
    await getTestPrisma().fundraisingCampaign.deleteMany({
      where: { title: { in: ['Help Rex recover', 'Seed campaign'] } },
    });
    await getTestPrisma().fundraisingCampaignDraft.deleteMany({
      where: { title: { in: ['Help Rex recover', 'Seed campaign'] } },
    });
    await getTestPrisma().fundraisingVerificationAccount.deleteMany({
      where: { fullName: { in: ['Rex Owner', 'Owner A', 'Owner B'] } },
    });
  });

  it('a fresh store instance creates a new draft without colliding with an existing high id', async () => {
    const { store, socialStore } = newStore();
    const ownerUserId = await resolveOwner(socialStore, uniqueOwnerId());
    await seedHighIdCampaign(ownerUserId);

    // Deliberately fresh instance: nextDraftId starts at 1 in memory, same
    // as a real process restart, while the database already has ids far
    // above 1.
    const draft = (await store.createDraft(
      ownerUserId,
      draftInput(),
    )) as unknown as DraftView;

    expect(draft.id).toBeGreaterThan(0);
    const row = await getTestPrisma().fundraisingCampaignDraft.findUnique({
      where: { id: draft.id },
    });
    expect(row).not.toBeNull();
    expect(row?.ownerUserId).toBe(ownerUserId);
  });

  it('submitting a draft from a fresh store instance does not throw P2002 and assigns a real database id', async () => {
    const { store, socialStore } = newStore();
    const ownerUserId = await resolveOwner(socialStore, uniqueOwnerId());
    await seedHighIdCampaign(ownerUserId);

    await store.upsertAccount(ownerUserId, { fullName: 'Rex Owner' });
    const draft = (await store.createDraft(
      ownerUserId,
      draftInput(),
    )) as unknown as DraftView;

    const submitted = (await store.submitDraft(
      ownerUserId,
      String(draft.id),
      `submit-${ownerUserId}`,
    )) as unknown as { status: string; post: unknown };
    expect(submitted.status).toBe('PENDING_REVIEW');

    const campaignRow = await getTestPrisma().fundraisingCampaign.findUnique({
      where: { draftId: draft.id },
    });
    expect(campaignRow).not.toBeNull();
    expect(campaignRow?.status).toBe('PENDING_REVIEW');
  });

  it('a second, independently fresh store instance also submits successfully after the first', async () => {
    const { store: storeA, socialStore: socialA } = newStore();
    const ownerUserIdA = await resolveOwner(socialA, uniqueOwnerId());
    await seedHighIdCampaign(ownerUserIdA);

    await storeA.upsertAccount(ownerUserIdA, { fullName: 'Owner A' });
    const draftA = (await storeA.createDraft(
      ownerUserIdA,
      draftInput(),
    )) as unknown as DraftView;
    const submittedA = (await storeA.submitDraft(
      ownerUserIdA,
      String(draftA.id),
      `submit-a-${ownerUserIdA}`,
    )) as unknown as { status: string };
    expect(submittedA.status).toBe('PENDING_REVIEW');

    // A second, completely independent store instance — its counters also
    // start fresh at 1 — must not collide with the campaign/draft ids the
    // first instance (or the seeded rows) just created.
    const { store: storeB, socialStore: socialB } = newStore();
    const ownerUserIdB = await resolveOwner(socialB, uniqueOwnerId());
    await seedHighIdCampaign(ownerUserIdB);

    await storeB.upsertAccount(ownerUserIdB, { fullName: 'Owner B' });
    const draftB = (await storeB.createDraft(
      ownerUserIdB,
      draftInput(),
    )) as unknown as DraftView;
    const submittedB = (await storeB.submitDraft(
      ownerUserIdB,
      String(draftB.id),
      `submit-b-${ownerUserIdB}`,
    )) as unknown as { status: string };
    expect(submittedB.status).toBe('PENDING_REVIEW');

    expect(draftA.id).not.toBe(draftB.id);
  });

  it('idempotent resubmission with the same key returns the original campaign and creates no duplicate', async () => {
    const { store, socialStore } = newStore();
    const ownerUserId = await resolveOwner(socialStore, uniqueOwnerId());
    await seedHighIdCampaign(ownerUserId);

    await store.upsertAccount(ownerUserId, { fullName: 'Rex Owner' });
    const draft = (await store.createDraft(
      ownerUserId,
      draftInput(),
    )) as unknown as DraftView;

    const idempotencyKey = `retry-${ownerUserId}`;
    await store.submitDraft(ownerUserId, String(draft.id), idempotencyKey);
    const campaignAfterFirst = await getTestPrisma().fundraisingCampaign.findUniqueOrThrow({
      where: { draftId: draft.id },
    });

    await store.submitDraft(ownerUserId, String(draft.id), idempotencyKey);
    const campaignAfterSecond = await getTestPrisma().fundraisingCampaign.findUniqueOrThrow({
      where: { draftId: draft.id },
    });

    expect(campaignAfterSecond.id).toBe(campaignAfterFirst.id);
    expect(campaignAfterSecond.publicId).toBe(campaignAfterFirst.publicId);

    const campaignCount = await getTestPrisma().fundraisingCampaign.count({
      where: { draftId: draft.id },
    });
    expect(campaignCount).toBe(1);
  });
});
