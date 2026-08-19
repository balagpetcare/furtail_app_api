import request from 'supertest';
import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createSocialCoreStore, type SocialCoreStore } from '../src/modules/social/social-store';
import { InMemoryMediaStorageAdapter } from '../src/modules/media/media-storage';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

describe('Home Feed Hydration (Tagged Pets Profile Media)', () => {
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

  function freshStore(): SocialCoreStore {
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

  function buildApp(store: SocialCoreStore = freshStore()) {
    const prisma = getTestPrisma();
    const verifier: TokenVerifier = {
      async verifyAccessToken(token: string) {
        const match = /^user-(\d+)$/.exec(token);
        if (match) return principal(match[1]!);
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
    const app = createAppWithDependencies({ authVerifier: verifier, socialStore: store, prisma });
    return { app, store };
  }

  let counter = 0;
  async function createTestUser() {
    counter += 1;
    const prisma = getTestPrisma();
    const suffix = `${Date.now()}${counter}`;
    return prisma.user.create({
      data: { profile: { create: { username: `hyd_${suffix}`, displayName: `Hyd Test ${suffix}` } } },
      include: { profile: true },
    });
  }

  async function createTestMedia(ownerUserId: number) {
    const suffix = `${Date.now()}-${Math.random()}`;
    return getTestPrisma().media.create({
      data: {
        ownerUserId,
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        storageKey: `test-${suffix}.jpg`,
        size: 1024,
        url: `https://cdn.test/test-${suffix}.jpg`,
        status: 'READY',
      },
    });
  }

  async function createTestPet(ownerUserId: number, profilePicId?: number) {
    return getTestPrisma().pet.create({
      data: {
        ownerUserId,
        name: `Pet ${Date.now()}`,
        animalTypeId: 1, // Assuming animalTypeId 1 exists or defaults are fine
        profilePicId,
      },
    });
  }

  async function cleanupUser(userId: number) {
    await getTestPrisma().user.deleteMany({ where: { id: userId } });
  }

  it('hydrates feed successfully with a tagged pet possessing a profile image (cold start)', async () => {
    const author = await createTestUser();
    try {
      const media = await createTestMedia(author.id);
      const pet = await createTestPet(author.id, media.id);

      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'Tagged Pet with Media', type: 'TEXT', privacy: 'PUBLIC', taggedPetIds: [pet.id] });
      expect(created.status).toBe(201);

      // Fresh store ensures the media cache is empty when listFeed executes
      const feed = await request(buildApp(freshStore()).app)
        .get('/api/v1/posts/feed?limit=10')
        .set('Authorization', `Bearer user-${author.id}`);
      
      expect(feed.status).toBe(200);
      const found = feed.body.data.find((p: any) => p.id === created.body.data.id);
      expect(found).toBeDefined();
      expect(found.taggedPets.length).toBe(1);
      expect(found.taggedPets[0].id).toBe(pet.id);
      expect(found.taggedPets[0].name).toBe(pet.name);
      expect(found.taggedPets[0].photo).toContain(media.storageKey);
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('hydrates feed successfully with a tagged pet possessing no profile image (cold start)', async () => {
    const author = await createTestUser();
    try {
      const pet = await createTestPet(author.id);

      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'Tagged Pet without Media', type: 'TEXT', privacy: 'PUBLIC', taggedPetIds: [pet.id] });
      expect(created.status).toBe(201);

      const feed = await request(buildApp(freshStore()).app)
        .get('/api/v1/posts/feed?limit=10')
        .set('Authorization', `Bearer user-${author.id}`);
      
      expect(feed.status).toBe(200);
      const found = feed.body.data.find((p: any) => p.id === created.body.data.id);
      expect(found).toBeDefined();
      expect(found.taggedPets.length).toBe(1);
      expect(found.taggedPets[0].id).toBe(pet.id);
      expect(found.taggedPets[0].photo).toBeNull();
    } finally {
      await cleanupUser(author.id);
    }
  });

  it('hydrates feed successfully with multiple tagged pets mixed with and without media', async () => {
    const author = await createTestUser();
    try {
      const media1 = await createTestMedia(author.id);
      const petA = await createTestPet(author.id, media1.id);
      const petB = await createTestPet(author.id); // No media
      const media3 = await createTestMedia(author.id);
      const petC = await createTestPet(author.id, media3.id);

      const created = await request(buildApp().app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer user-${author.id}`)
        .send({ caption: 'Mixed Pets', type: 'TEXT', privacy: 'PUBLIC', taggedPetIds: [petA.id, petB.id, petC.id] });
      expect(created.status).toBe(201);

      const feed = await request(buildApp(freshStore()).app)
        .get('/api/v1/posts/feed?limit=10')
        .set('Authorization', `Bearer user-${author.id}`);
      
      expect(feed.status).toBe(200);
      const found = feed.body.data.find((p: any) => p.id === created.body.data.id);
      expect(found).toBeDefined();
      expect(found.taggedPets.length).toBe(3);
      expect(found.taggedPets.find((p: any) => p.id === petA.id).photo).toContain(media1.storageKey);
      expect(found.taggedPets.find((p: any) => p.id === petB.id).photo).toBeNull();
      expect(found.taggedPets.find((p: any) => p.id === petC.id).photo).toContain(media3.storageKey);
    } finally {
      await cleanupUser(author.id);
    }
  });
});