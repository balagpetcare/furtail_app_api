import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import { AppError } from '../src/core/errors/app-error';
import {
  createSocialCoreStore,
  type NotificationDeliveryProvider,
} from '../src/modules/social/social-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

describe('notification and moderation contracts', () => {
  const principal: AuthenticatedPrincipal = {
    sub: '1',
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    issuedAt: Math.floor(Date.now() / 1000) - 10,
    roles: ['member'],
    permissions: ['profile:read'],
    scopes: ['openid', 'profile'],
    claims: {},
  };

  const verifier: TokenVerifier = {
    async verifyAccessToken(token: string) {
      if (token === 'valid-token') return principal;
      throw AppError.authenticationInvalid('Invalid or expired access token');
    },
  };

  function buildApp(provider?: NotificationDeliveryProvider) {
    const socialStore = createSocialCoreStore(undefined, provider);
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore });
    return { app, socialStore };
  }

  it('registers, replaces, and deduplicates device tokens', async () => {
    const { app } = buildApp();

    const first = await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', 'Bearer valid-token')
      .send({ token: 'token-a', platform: 'ios', provider: 'fcm' });

    const second = await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', 'Bearer valid-token')
      .send({ token: 'token-b', platform: 'ios', provider: 'fcm' });

    const third = await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', 'Bearer valid-token')
      .send({ token: 'token-b', platform: 'ios', provider: 'fcm' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.replaced).toBe(true);
    expect(third.body.data.id).toBe(first.body.data.id);
    expect(third.body.data.replaced).toBe(false);
  });

  it('tracks unread counts, mark-read behavior, and deduplicated notifications', async () => {
    const { app, socialStore } = buildApp();

    const baselineItems = socialStore.listNotifications(1, 50).items.length;
    const baselineUnread = socialStore.listNotifications(1, 50).unreadCount;
    socialStore.followUser(2, 1);
    socialStore.followUser(2, 1);
    socialStore.likeUserProfile(2, 1);

    const unread = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', 'Bearer valid-token');
    expect(unread.status).toBe(200);
    expect(unread.body.data.count).toBe(baselineUnread + 2);

    const listed = await request(app)
      .get('/api/v1/notifications?limit=10')
      .set('Authorization', 'Bearer valid-token');
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(baselineItems + 2);
    expect(listed.body.data.items[0].deliveryStatus).toBe('SENT');

    const firstId = listed.body.data.items[0].id as number;
    const markRead = await request(app)
      .patch(`/api/v1/notifications/${firstId}/read`)
      .set('Authorization', 'Bearer valid-token');
    expect(markRead.status).toBe(200);

    const unreadAfterOne = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', 'Bearer valid-token');
    expect(unreadAfterOne.body.data.count).toBe(baselineUnread + 1);

    const readAll = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', 'Bearer valid-token');
    expect(readAll.status).toBe(200);

    const unreadAfterAll = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', 'Bearer valid-token');
    expect(unreadAfterAll.body.data.count).toBe(0);
  });

  it('blocks follow and comment interactions after a user blocks another user', async () => {
    const { app } = buildApp();

    const blocked = await request(app)
      .post('/api/v1/social/block/2')
      .set('Authorization', 'Bearer valid-token');
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.userId).toBe(2);

    const status = await request(app)
      .get('/api/v1/social/status/2')
      .set('Authorization', 'Bearer valid-token');
    expect(status.body.data.isBlocked).toBe(true);
    expect(status.body.data.isBlockedByMe).toBe(true);

    const follow = await request(app)
      .post('/api/v1/social/follow/2')
      .set('Authorization', 'Bearer valid-token');
    expect(follow.status).toBe(403);

    const comment = await request(app)
      .post('/api/v1/posts/2/comments')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'Blocked comment attempt' });
    expect(comment.status).toBe(403);
  });

  it('rejects unauthenticated moderation requests', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/v1/notifications/unread-count');
    expect(response.status).toBe(401);
  });

  it('deduplicates abuse reports for the same reporter, target, reason, and details', async () => {
    const { app } = buildApp();

    const first = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({
        type: 'USER',
        targetId: 2,
        reasonCode: 'SPAM',
        details: 'same report',
      });

    const second = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({
        type: 'USER',
        targetId: 2,
        reasonCode: 'SPAM',
        details: 'same report',
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('keeps notification delivery failures isolated from the originating social action', async () => {
    const failingProvider: NotificationDeliveryProvider = {
      async deliver() {
        throw new Error('push failed');
      },
    };
    const { app, socialStore } = buildApp(failingProvider);
    socialStore.registerDeviceToken(2, {
      token: 'device-token-user-2',
      platform: 'ios',
      provider: 'fcm',
    });
    const baselineCount = socialStore.listNotifications(2, 50).items.length;

    const response = await request(app)
      .post('/api/v1/social/follow/2')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const notifications = socialStore.listNotifications(2, 10);
    expect(notifications.items).toHaveLength(baselineCount + 1);
    expect(
      notifications.items.find(
        (item) => item.type === 'user_followed' && item.deepLink === '/profile/1',
      )?.deliveryStatus,
    ).toBe('FAILED');
  });
});
