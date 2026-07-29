import { runCleanup } from '../scripts/cleanup/draft-media-cleanup';

interface FakeMediaRow {
  id: number;
  ownerUserId: number;
  createdAt: Date;
  status: string;
  markedForDeletionAt: Date | null;
  postMediaIds: number[];
  commentAttachmentIds: number[];
  avatarOwnerIds: number[];
  coverOwnerIds: number[];
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Minimal fake Prisma client covering only what runCleanup touches. */
function createFakePrisma(media: FakeMediaRow[], adoptionMediaIds: number[][] = []) {
  return {
    media: {
      async findMany({
        where,
      }: {
        where: { createdAt: { lt: Date }; status: { notIn: string[] } };
      }) {
        return media
          .filter((m) => m.createdAt < where.createdAt.lt)
          .filter((m) => !where.status.notIn.includes(m.status))
          .map((m) => ({
            id: m.id,
            ownerUserId: m.ownerUserId,
            createdAt: m.createdAt,
            postMedia: m.postMediaIds.map((id) => ({ id })),
            commentAttachments: m.commentAttachmentIds.map((id) => ({ id })),
            avatarProfiles: m.avatarOwnerIds.map((userId) => ({ userId })),
            coverProfiles: m.coverOwnerIds.map((userId) => ({ userId })),
          }));
      },
      async update({
        where,
        data,
      }: {
        where: { id: number };
        data: { status: string; markedForDeletionAt: Date };
      }) {
        const row = media.find((m) => m.id === where.id);
        if (!row) throw new Error('not found');
        row.status = data.status;
        row.markedForDeletionAt = data.markedForDeletionAt;
        return row;
      },
    },
    adoptionListing: {
      async findMany() {
        return adoptionMediaIds.map((mediaIds) => ({ mediaIds }));
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('Cleanup Job (draft media)', () => {
  it('runs in dry-run mode without throwing and without mutating anything', async () => {
    const media: FakeMediaRow[] = [
      {
        id: 1,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
    ];
    const prisma = createFakePrisma(media);
    const report = await runCleanup(prisma, true);
    expect(report.dryRun).toBe(true);
    expect(report.candidates.map((c) => c.mediaId)).toEqual([1]);
    expect(media[0]!.status).toBe('READY'); // unchanged — dry run never mutates
  });

  it('skips media still within the retention/grace period, regardless of reference state', async () => {
    const media: FakeMediaRow[] = [
      {
        id: 1,
        ownerUserId: 1,
        createdAt: hoursAgo(2),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
    ];
    const prisma = createFakePrisma(media);
    const report = await runCleanup(prisma, true, 48);
    expect(report.candidates).toHaveLength(0);
    expect(report.scannedStaleCount).toBe(0);
  });

  it('never selects media still marked PROCESSING for deletion just because it is old (excluded via status filter is not enough alone — must remain referenced-agnostic safe)', async () => {
    // PROCESSING media is intentionally NOT in the exclusion list (only
    // PENDING_DELETION/DELETED are) because a stuck PROCESSING row IS a
    // legitimate abandoned-draft cleanup target — but it must still respect
    // the reference check like any other candidate.
    const media: FakeMediaRow[] = [
      {
        id: 1,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'PROCESSING',
        markedForDeletionAt: null,
        postMediaIds: [1],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
    ];
    const prisma = createFakePrisma(media);
    const report = await runCleanup(prisma, true);
    expect(report.candidates).toHaveLength(0);
    expect(report.protectedCount).toBe(1);
  });

  it('never selects media referenced by an adoption listing, a post, a comment, or a profile avatar/cover — even when stale', async () => {
    const media: FakeMediaRow[] = [
      {
        id: 1,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      }, // referenced by adoption listing
      {
        id: 2,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [10],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
      {
        id: 3,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [20],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
      {
        id: 4,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [1],
        coverOwnerIds: [],
      },
      {
        id: 5,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [1],
      },
      {
        id: 6,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      }, // truly orphaned
    ];
    const prisma = createFakePrisma(media, [[1]]);
    const report = await runCleanup(prisma, true);
    expect(report.candidates.map((c) => c.mediaId)).toEqual([6]);
    expect(report.protectedCount).toBe(5);
  });

  it('excludes media already PENDING_DELETION or DELETED from being scanned again', async () => {
    const media: FakeMediaRow[] = [
      {
        id: 1,
        ownerUserId: 1,
        createdAt: hoursAgo(200),
        status: 'PENDING_DELETION',
        markedForDeletionAt: hoursAgo(1),
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
      {
        id: 2,
        ownerUserId: 1,
        createdAt: hoursAgo(200),
        status: 'DELETED',
        markedForDeletionAt: hoursAgo(50),
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
    ];
    const prisma = createFakePrisma(media);
    const report = await runCleanup(prisma, true);
    expect(report.scannedStaleCount).toBe(0);
    expect(report.candidates).toHaveLength(0);
  });

  it('when dryRun is false, soft-deletes candidates (status + markedForDeletionAt) — never a hard delete', async () => {
    const media: FakeMediaRow[] = [
      {
        id: 6,
        ownerUserId: 1,
        createdAt: hoursAgo(100),
        status: 'READY',
        markedForDeletionAt: null,
        postMediaIds: [],
        commentAttachmentIds: [],
        avatarOwnerIds: [],
        coverOwnerIds: [],
      },
    ];
    const prisma = createFakePrisma(media);
    const report = await runCleanup(prisma, false);
    expect(report.dryRun).toBe(false);
    expect(media[0]!.status).toBe('PENDING_DELETION');
    expect(media[0]!.markedForDeletionAt).not.toBeNull();
  });
});
