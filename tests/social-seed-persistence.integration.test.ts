import { createSocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';

/**
 * SEED REACTION FOREIGN-KEY REPAIR — regression coverage for the P2003
 * PostLike_userId_fkey failure on every server startup.
 *
 * Root cause (proven directly against local dev Postgres before this fix):
 * SocialCoreStore.seed() is an in-memory-only fixture — its demo user ids
 * (1, 2, 3) and post ids (assigned by the store's own nextPostId counter,
 * starting at 1) are NOT real Prisma rows. The real Postgres User table
 * has no id=1 at all, and its real Post id=2 belongs to a completely
 * unrelated user (authorId 21) — the in-memory demo id space and Prisma's
 * real auto-increment sequence are independent and can coincidentally
 * collide. seed() used to call the real likePost(1, post2.id), which —
 * whenever DATABASE_URL/Prisma was configured — attempted a genuine
 * PostLike upsert against those non-existent/unrelated rows and failed FK
 * validation on every single startup (caught so the process wouldn't
 * crash, but the invalid write attempt itself was the bug).
 *
 * The fix: seed reactions populate the same in-memory Map likePost()
 * would, directly, and never call the Prisma-writing code path at all.
 */
describe('SocialCoreStore seed reactions never attempt an invalid Prisma write', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  function freshPrismaBackedStore() {
    return createSocialCoreStore(
      new InMemoryMediaStorageAdapter(),
      undefined,
      async (p) => {
        const id = Number(p.sub);
        return Number.isFinite(id) && id > 0 ? { id } : null;
      },
      getTestPrisma(),
    );
  }

  it('constructing a Prisma-backed store never logs the "failed to persist seed reaction" failure', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const store = freshPrismaBackedStore();
      expect(store).toBeTruthy();

      const seedFailureLogs = errorSpy.mock.calls.filter((call) =>
        call.some(
          (arg) => typeof arg === 'string' && arg.includes('failed to persist seed reaction'),
        ),
      );
      expect(seedFailureLogs).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('constructing a Prisma-backed store does not write a PostLike row for the in-memory demo seed user (proven-nonexistent User id 1)', async () => {
    freshPrismaBackedStore();

    // Give any stray fire-and-forget async write a tick to land, in case a
    // future regression reintroduces one — the assertion below must catch
    // it either way.
    await new Promise((resolve) => setImmediate(resolve));

    const staleRows = await getTestPrisma().postLike.findMany({ where: { userId: 1 } });
    expect(staleRows).toHaveLength(0);
  });

  it('repeated construction (simulating restart) never accumulates an invalid PostLike row', async () => {
    freshPrismaBackedStore();
    freshPrismaBackedStore();
    freshPrismaBackedStore();
    await new Promise((resolve) => setImmediate(resolve));

    const staleRows = await getTestPrisma().postLike.findMany({ where: { userId: 1 } });
    expect(staleRows).toHaveLength(0);
  });

  it('the demo seed reaction is still reflected in-memory even in Prisma mode — retained as a fixture, just never persisted (§5, §G)', async () => {
    const store = freshPrismaBackedStore();
    // Seed's demo post id 2 ("Training session", authored by seed user 2)
    // is an in-memory-only PostRecord — mustGetPersistedPost checks the
    // in-memory cache before ever falling back to Prisma, so this reads
    // the demo fixture, not Postgres's own unrelated real Post id 2.
    const post = await store.getPostById(1, 2);
    expect(post.viewerReaction).toBe('LIKE');
    expect(post.isLikedByMe).toBe(true);
    expect(post.likeCount).toBe(1);
  });

  it('in-memory-only mode (no Prisma configured) still seeds the demo reaction, unchanged — the existing fixture-mode contract is preserved (§12)', async () => {
    const store = createSocialCoreStore();
    const post = await store.getPostById(1, 2);
    expect(post.viewerReaction).toBe('LIKE');
    expect(post.isLikedByMe).toBe(true);
    expect(post.likeCount).toBe(1);
  });
});
