import type { PrismaClient } from '@prisma/client';

export interface CleanupCandidate {
  mediaId: number;
  ownerUserId: number;
  createdAt: Date;
  reason: string;
}

export interface CleanupReport {
  dryRun: boolean;
  retentionHours: number;
  scannedStaleCount: number;
  protectedCount: number;
  candidates: CleanupCandidate[];
}

/**
 * Safe draft-media cleanup: finds media older than the retention window
 * that isn't referenced by anything (an adoption listing's `mediaIds`, a
 * post, a comment attachment, or a profile avatar/cover) and is therefore
 * an abandoned-draft orphan. Never touches media that's referenced,
 * regardless of age — "referenced" always wins over "stale".
 *
 * `dryRun` (default true) only reports candidates. Passing `dryRun: false`
 * soft-deletes them (`status: 'PENDING_DELETION'`, `markedForDeletionAt`
 * set) — never a hard DELETE — so a mistaken candidate can still be
 * recovered before a separate, later purge step.
 */
export async function runCleanup(
  prisma: PrismaClient,
  dryRun = true,
  retentionHours = 48,
): Promise<CleanupReport> {
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

  const staleMedia = await prisma.media.findMany({
    where: {
      createdAt: { lt: cutoff },
      status: { notIn: ['PENDING_DELETION', 'DELETED'] },
    },
    include: {
      postMedia: { select: { id: true }, take: 1 },
      commentAttachments: { select: { id: true }, take: 1 },
      avatarProfiles: { select: { userId: true }, take: 1 },
      coverProfiles: { select: { userId: true }, take: 1 },
    },
  });

  const adoptionListings = await prisma.adoptionListing.findMany({
    select: { mediaIds: true },
  });
  const referencedByAdoption = new Set<number>();
  for (const listing of adoptionListings) {
    for (const id of listing.mediaIds) referencedByAdoption.add(id);
  }

  const candidates: CleanupCandidate[] = [];
  let protectedCount = 0;

  for (const media of staleMedia) {
    const isReferenced =
      referencedByAdoption.has(media.id) ||
      media.postMedia.length > 0 ||
      media.commentAttachments.length > 0 ||
      media.avatarProfiles.length > 0 ||
      media.coverProfiles.length > 0;

    if (isReferenced) {
      protectedCount += 1;
      continue;
    }

    candidates.push({
      mediaId: media.id,
      ownerUserId: media.ownerUserId,
      createdAt: media.createdAt,
      reason: `unreferenced and older than ${retentionHours}h`,
    });
  }

  if (!dryRun) {
    for (const candidate of candidates) {
      await prisma.media.update({
        where: { id: candidate.mediaId },
        data: { status: 'PENDING_DELETION', markedForDeletionAt: new Date() },
      });
    }
  }

  return {
    dryRun,
    retentionHours,
    scannedStaleCount: staleMedia.length,
    protectedCount,
    candidates,
  };
}
