import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

/**
 * Server-side enforcement tests for Profile Settings > Privacy and visibility
 * / Social interactions / Safety (mute, restrict) / Notifications — proving
 * these settings are enforced on the real Prisma-backed list/detail/action
 * endpoints, not only hidden in Flutter. Every test creates its own real
 * User + UserProfile rows (unique per test run) and cleans them up.
 */
describe('privacy and social-interaction enforcement (Prisma-backed)', () => {
  afterAll(async () => {
    await getTestPrisma().$disconnect();
    await disconnectPrisma();
  });

  const issuer = 'https://central-auth.test';
  const audience = 'furtail-mobile';
  const clientId = 'furtail-mobile';
  const nowSeconds = Math.floor(Date.now() / 1000);

  function principal(sub: string): AuthenticatedPrincipal {
    return {
      sub,
      issuer,
      audience,
      clientId,
      expiresAt: nowSeconds + 600,
      issuedAt: nowSeconds - 10,
      roles: ['member'],
      permissions: [],
      scopes: ['openid', 'profile'],
      claims: {},
    };
  }

  function buildApp() {
    const prisma = getTestPrisma();
    const socialStore = createSocialCoreStore(undefined, undefined, async (p) => {
      const id = Number(p.sub);
      return Number.isFinite(id) && id > 0 ? { id } : null;
    }, prisma);
    const verifier: TokenVerifier = {
      async verifyAccessToken(token: string) {
        const match = /^user-(\d+)$/.exec(token);
        if (match) return principal(match[1]!);
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore, prisma });
    return { app, socialStore };
  }

  let counter = 0;
  async function createTestUser(overrides: Record<string, unknown> = {}) {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    const user = await prisma.user.create({
      data: {
        profile: {
          create: {
            username: `priv_test_${suffix}`,
            displayName: `Privacy Test ${suffix}`,
            ...overrides,
          },
        },
      },
      include: { profile: true },
    });
    return user;
  }

  async function cleanupUser(userId: number) {
    const prisma = getTestPrisma();
    await prisma.userFollow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
    await prisma.userMute.deleteMany({ where: { OR: [{ muterId: userId }, { mutedUserId: userId }] } });
    await prisma.userRestrict.deleteMany({
      where: { OR: [{ restricterId: userId }, { restrictedUserId: userId }] },
    });
    await prisma.postComment.deleteMany({ where: { authorId: userId } });
    await prisma.post.deleteMany({ where: { authorId: userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  it('whoCanFollow=NOBODY rejects a follow attempt with a typed 403', async () => {
    const { app } = buildApp();
    const owner = await createTestUser({ whoCanFollow: 'NOBODY' });
    const follower = await createTestUser();
    try {
      const res = await request(app)
        .post(`/api/v1/social/follow/${owner.id}`)
        .set('Authorization', `Bearer user-${follower.id}`);
      expect(res.status).toBe(403);
    } finally {
      await cleanupUser(owner.id);
      await cleanupUser(follower.id);
    }
  });

  it('whoCanFollow=EVERYONE (default) allows a follow', async () => {
    const { app } = buildApp();
    const owner = await createTestUser();
    const follower = await createTestUser();
    try {
      const res = await request(app)
        .post(`/api/v1/social/follow/${owner.id}`)
        .set('Authorization', `Bearer user-${follower.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.followed).toBe(true);
    } finally {
      await cleanupUser(owner.id);
      await cleanupUser(follower.id);
    }
  });

  it('discoverableBySearch=false hides the profile from username lookup for non-owners (typed 404)', async () => {
    const { app } = buildApp();
    const hidden = await createTestUser({ discoverableBySearch: false });
    const viewer = await createTestUser();
    try {
      const asStranger = await request(app)
        .get(`/api/v1/user/by-username/${hidden.profile!.username}`)
        .set('Authorization', `Bearer user-${viewer.id}`);
      expect(asStranger.status).toBe(404);

      const asOwner = await request(app)
        .get(`/api/v1/user/by-username/${hidden.profile!.username}`)
        .set('Authorization', `Bearer user-${hidden.id}`);
      expect(asOwner.status).toBe(200);
    } finally {
      await cleanupUser(hidden.id);
      await cleanupUser(viewer.id);
    }
  });

  it('mute hides the muted user\'s posts from the muter\'s own feed only', async () => {
    const { app } = buildApp();
    const author = await createTestUser();
    const muter = await createTestUser();
    const stranger = await createTestUser();
    try {
      const post = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'muted-author-post', type: 'TEXT', privacy: 'PUBLIC' });
      expect(post.status).toBe(201);
      const postId = post.body.data.id;

      const muteRes = await request(app)
        .post(`/api/v1/social/mute/${author.id}`)
        .set('Authorization', `Bearer user-${muter.id}`);
      expect(muteRes.status).toBe(200);

      const feedAsMuter = await request(app)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${muter.id}`);
      expect(feedAsMuter.status).toBe(200);
      const idsForMuter = (feedAsMuter.body.data as Array<{ id: number }>).map((p) => p.id);
      expect(idsForMuter).not.toContain(postId);

      const feedAsStranger = await request(app)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer user-${stranger.id}`);
      const idsForStranger = (feedAsStranger.body.data as Array<{ id: number }>).map((p) => p.id);
      expect(idsForStranger).toContain(postId);

      // The post is still directly reachable by id for the muter (mute is
      // not a hard block).
      const direct = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer user-${muter.id}`);
      expect(direct.status).toBe(200);
    } finally {
      await cleanupUser(author.id);
      await cleanupUser(muter.id);
      await cleanupUser(stranger.id);
    }
  });

  it('restrict hides the restricted user\'s comments from other viewers, but not from the comment author or the restricter', async () => {
    const { app } = buildApp();
    const postOwner = await createTestUser();
    const restricted = await createTestUser();
    const otherViewer = await createTestUser();
    try {
      const post = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${postOwner.id}`)
        .send({ caption: 'restrict-test-post', type: 'TEXT', privacy: 'PUBLIC' });
      const postId = post.body.data.id;

      const restrictRes = await request(app)
        .post(`/api/v1/social/restrict/${restricted.id}`)
        .set('Authorization', `Bearer user-${postOwner.id}`);
      expect(restrictRes.status).toBe(200);

      const comment = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer user-${restricted.id}`)
        .send({ text: 'restricted comment' });
      expect(comment.status).toBe(201);

      const commentsAsOtherViewer = await request(app)
        .get(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer user-${otherViewer.id}`);
      const textsForOther = (commentsAsOtherViewer.body.data as Array<{ text: string }>).map(
        (c) => c.text,
      );
      expect(textsForOther).not.toContain('restricted comment');

      const commentsAsRestricter = await request(app)
        .get(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer user-${postOwner.id}`);
      const textsForRestricter = (commentsAsRestricter.body.data as Array<{ text: string }>).map(
        (c) => c.text,
      );
      expect(textsForRestricter).toContain('restricted comment');

      const commentsAsAuthor = await request(app)
        .get(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer user-${restricted.id}`);
      const textsForAuthor = (commentsAsAuthor.body.data as Array<{ text: string }>).map(
        (c) => c.text,
      );
      expect(textsForAuthor).toContain('restricted comment');
    } finally {
      await cleanupUser(postOwner.id);
      await cleanupUser(restricted.id);
      await cleanupUser(otherViewer.id);
    }
  });

  it('whoCanComment=NOBODY rejects a comment attempt with a typed 403', async () => {
    const { app } = buildApp();
    const owner = await createTestUser({ whoCanComment: 'NOBODY' });
    const commenter = await createTestUser();
    try {
      const post = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${owner.id}`)
        .send({ caption: 'no-comments-post', type: 'TEXT', privacy: 'PUBLIC' });
      const postId = post.body.data.id;

      const res = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer user-${commenter.id}`)
        .send({ text: 'should be blocked' });
      expect(res.status).toBe(403);
    } finally {
      await cleanupUser(owner.id);
      await cleanupUser(commenter.id);
    }
  });

  it('list/create/remove mute and restrict relationships round-trip through the real endpoints', async () => {
    const { app } = buildApp();
    const actor = await createTestUser();
    const targetA = await createTestUser();
    const targetB = await createTestUser();
    try {
      await request(app).post(`/api/v1/social/mute/${targetA.id}`).set('Authorization', `Bearer user-${actor.id}`).expect(200);
      await request(app).post(`/api/v1/social/restrict/${targetB.id}`).set('Authorization', `Bearer user-${actor.id}`).expect(200);

      const mutedList = await request(app)
        .get('/api/v1/social/muted')
        .set('Authorization', `Bearer user-${actor.id}`);
      expect(mutedList.status).toBe(200);
      expect((mutedList.body.data.items as Array<{ userId: number }>).some((i) => i.userId === targetA.id)).toBe(true);

      const restrictedList = await request(app)
        .get('/api/v1/social/restricted')
        .set('Authorization', `Bearer user-${actor.id}`);
      expect(restrictedList.status).toBe(200);
      expect(
        (restrictedList.body.data.items as Array<{ userId: number }>).some((i) => i.userId === targetB.id),
      ).toBe(true);

      await request(app).delete(`/api/v1/social/mute/${targetA.id}`).set('Authorization', `Bearer user-${actor.id}`).expect(200);
      const mutedAfter = await request(app)
        .get('/api/v1/social/muted')
        .set('Authorization', `Bearer user-${actor.id}`);
      expect(
        (mutedAfter.body.data.items as Array<{ userId: number }>).some((i) => i.userId === targetA.id),
      ).toBe(false);
    } finally {
      await cleanupUser(actor.id);
      await cleanupUser(targetA.id);
      await cleanupUser(targetB.id);
    }
  });

  it('cannot mute or restrict yourself (typed 400)', async () => {
    const { app } = buildApp();
    const user = await createTestUser();
    try {
      const muteRes = await request(app)
        .post(`/api/v1/social/mute/${user.id}`)
        .set('Authorization', `Bearer user-${user.id}`);
      expect(muteRes.status).toBe(400);

      const restrictRes = await request(app)
        .post(`/api/v1/social/restrict/${user.id}`)
        .set('Authorization', `Bearer user-${user.id}`);
      expect(restrictRes.status).toBe(400);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('notification preferences persist through GET/PATCH and default sensibly when unset', async () => {
    const { app } = buildApp();
    const user = await createTestUser();
    try {
      const initial = await request(app)
        .get('/api/v1/user/me/notification-preferences')
        .set('Authorization', `Bearer user-${user.id}`);
      expect(initial.status).toBe(200);
      expect(initial.body.data.likes).toBe(true);
      expect(initial.body.data.emailAnnouncements).toBe(false);

      const patched = await request(app)
        .patch('/api/v1/user/me/notification-preferences')
        .set('Authorization', `Bearer user-${user.id}`)
        .send({ likes: false, emailAnnouncements: true });
      expect(patched.status).toBe(200);
      expect(patched.body.data.likes).toBe(false);
      expect(patched.body.data.emailAnnouncements).toBe(true);
      // Untouched keys keep their previous/default value.
      expect(patched.body.data.comments).toBe(true);

      const reread = await request(app)
        .get('/api/v1/user/me/notification-preferences')
        .set('Authorization', `Bearer user-${user.id}`);
      expect(reread.body.data.likes).toBe(false);
      expect(reread.body.data.emailAnnouncements).toBe(true);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('PATCH /api/v1/user/me persists privacy and interaction settings (Profile Settings > Privacy/Social screens)', async () => {
    const { app } = buildApp();
    const user = await createTestUser();
    try {
      const patched = await request(app)
        .patch('/api/v1/user/me')
        .set('Authorization', `Bearer user-${user.id}`)
        .send({
          visibility: 'FOLLOWERS_ONLY',
          followersVisibility: 'PRIVATE',
          discoverableBySearch: false,
          discoverableByEmail: true,
          whoCanFollow: 'FOLLOWERS',
          whoCanComment: 'NOBODY',
          requiresTagReview: true,
          showActivityStatus: true,
        });
      expect(patched.status).toBe(200);
      expect(patched.body.data.profile.visibility).toBe('FOLLOWERS_ONLY');
      expect(patched.body.data.profile.followersVisibility).toBe('PRIVATE');
      expect(patched.body.data.profile.discoverableBySearch).toBe(false);
      expect(patched.body.data.profile.discoverableByEmail).toBe(true);
      expect(patched.body.data.profile.whoCanFollow).toBe('FOLLOWERS');
      expect(patched.body.data.profile.whoCanComment).toBe('NOBODY');
      expect(patched.body.data.profile.requiresTagReview).toBe(true);
      expect(patched.body.data.profile.showActivityStatus).toBe(true);

      const reread = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer user-${user.id}`);
      expect(reread.body.data.profile.visibility).toBe('FOLLOWERS_ONLY');
      expect(reread.body.data.profile.whoCanComment).toBe('NOBODY');
    } finally {
      await cleanupUser(user.id);
    }
  });
});
