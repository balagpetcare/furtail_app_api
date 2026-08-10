import request from 'supertest';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

import { createAppWithDependencies } from '../src/app';
import { AppError } from '../src/core/errors/app-error';
import { createPrismaPetClient } from '../src/modules/pets/prisma-pet-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';
import { disconnectTestPrisma, getTestPrisma } from './helpers/test-prisma';

describe('persistent pet registry contract', () => {
  const prefix = `pet-registry-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  let prisma: PrismaClient;
  let dogTypeId: number;
  let dogBreedId: number;
  let catTypeId: number;
  let catBreedId: number;

  beforeAll(async () => {
    prisma = getTestPrisma();
    const dog = await prisma.animalType.upsert({
      where: { name: `${prefix}-Dog` },
      update: { isActive: true },
      create: { name: `${prefix}-Dog`, code: `${prefix}-DOG`, isActive: true },
    });
    const cat = await prisma.animalType.upsert({
      where: { name: `${prefix}-Cat` },
      update: { isActive: true },
      create: { name: `${prefix}-Cat`, code: `${prefix}-CAT`, isActive: true },
    });
    const dogBreed = await prisma.breed.create({
      data: { name: `${prefix}-Retriever`, animalTypeId: dog.id, isActive: true },
    });
    const catBreed = await prisma.breed.create({
      data: { name: `${prefix}-Shorthair`, animalTypeId: cat.id, isActive: true },
    });
    dogTypeId = dog.id;
    catTypeId = cat.id;
    dogBreedId = dogBreed.id;
    catBreedId = catBreed.id;
  });

  afterAll(async () => {
    const links = await prisma.userCentralAuthLink.findMany({
      where: { subject: { startsWith: prefix } },
      select: { userId: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: links.map((link) => link.userId) } } });
    await prisma.breed.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.animalType.deleteMany({ where: { name: { startsWith: prefix } } });
    await disconnectTestPrisma();
  });

  function principal(
    sub: string,
    audience = 'furtail-mobile',
    clientId = audience,
  ): AuthenticatedPrincipal {
    return {
      sub,
      issuer: 'https://central-auth.test',
      audience,
      clientId,
      expiresAt: now + 300,
      issuedAt: now - 10,
      roles: ['member'],
      permissions: ['pet:read', 'pet:write'],
      scopes: ['openid', 'profile'],
      claims: {},
    };
  }

  const verifier: TokenVerifier = {
    async verifyAccessToken(token: string) {
      if (token.startsWith('token-bpa:')) {
        return principal(token.slice('token-bpa:'.length), 'bpa-mobile', 'bpa-mobile');
      }
      if (token.startsWith('token-furtail:')) {
        return principal(token.slice('token-furtail:'.length), 'furtail-mobile', 'furtail-mobile');
      }
      if (!token.startsWith('token-')) {
        throw AppError.authenticationInvalid('Invalid or expired access token');
      }
      return principal(token.slice('token-'.length));
    },
  };

  async function resolveSubjectOnly(authPrincipal: AuthenticatedPrincipal): Promise<number> {
    const existing = await prisma.userCentralAuthLink.findUnique({
      where: { subject: authPrincipal.sub },
    });
    if (existing) return existing.userId;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: {} });
      await tx.userCentralAuthLink.create({
        data: {
          userId: user.id,
          subject: authPrincipal.sub,
          linkMethod: 'test_subject_only',
        },
      });
      await tx.userProfile.create({
        data: {
          userId: user.id,
          username: `pet${createHash('sha256').update(authPrincipal.sub).digest('hex').slice(0, 24)}`,
          displayName: authPrincipal.sub,
        },
      });
      return user;
    });
    return result.id;
  }

  function app() {
    return createAppWithDependencies({
      authVerifier: verifier,
      petClient: createPrismaPetClient(prisma),
      petIdentityResolver: resolveSubjectOnly,
    });
  }

  it('persists pets across app instances and exposes identical /user and /me records', async () => {
    const appOne = app();
    const token = `token-${prefix}-owner-a`;

    const created = await request(appOne)
      .post('/api/v1/user/pets')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `${prefix}-create-main`)
      .send({
        name: 'Central Nova',
        animalTypeId: dogTypeId,
        breedId: dogBreedId,
        sex: 'female',
        weightKg: 10.5,
      });

    expect(created.status).toBe(201);
    expect(created.body.data.item.name).toBe('Central Nova');
    expect(created.body.data.name).toBe('Central Nova');
    const petId = created.body.data.item.id as number;

    const retry = await request(appOne)
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `${prefix}-create-main`)
      .send({
        name: 'Central Nova',
        animalTypeId: dogTypeId,
        breedId: dogBreedId,
      });
    expect(retry.status).toBe(201);
    expect(retry.body.data.item.id).toBe(petId);

    const appTwo = app();
    const userList = await request(appTwo)
      .get('/api/v1/user/pets')
      .set('Authorization', `Bearer ${token}`);
    const meList = await request(appTwo)
      .get('/api/v1/me/pets')
      .set('Authorization', `Bearer ${token}`);

    expect(userList.status).toBe(200);
    expect(meList.status).toBe(200);
    expect(userList.body.data.items.map((item: { id: number }) => item.id)).toContain(petId);
    expect(meList.body.data.items.map((item: { id: number }) => item.id)).toContain(petId);
    expect(userList.body.data.pets.map((item: { id: number }) => item.id)).toContain(petId);

    const profileAfterFreshApp = await request(appTwo)
      .get(`/api/v1/me/pets/${petId}/profile`)
      .set('Authorization', `Bearer ${token}`);
    expect(profileAfterFreshApp.status).toBe(200);
    expect(profileAfterFreshApp.body.data.weightKg).toBe(10.5);

    const [linkCount, pet] = await Promise.all([
      prisma.userCentralAuthLink.count({ where: { subject: `${prefix}-owner-a` } }),
      prisma.pet.findUnique({ where: { id: petId } }),
    ]);
    expect(linkCount).toBe(1);
    expect(pet?.ownerUserId).toBeGreaterThan(0);

    const emptyVaccinations = await request(appTwo)
      .get(`/api/v1/me/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${token}`);
    expect(emptyVaccinations.status).toBe(200);
    expect(emptyVaccinations.body.data.items).toEqual([]);
    expect(emptyVaccinations.body.data.vaccinations).toEqual([]);
  });

  it('validates canonical animal type and breed ownership', async () => {
    const token = `token-${prefix}-owner-b`;
    const invalidAnimalType = await request(app())
      .post('/api/v1/user/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Invalid type', animalTypeId: 999999 });
    expect(invalidAnimalType.status).toBe(422);
    expect(invalidAnimalType.body.error.code).toBe('ANIMAL_TYPE_NOT_FOUND');

    const mismatch = await request(app())
      .post('/api/v1/user/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mismatch', animalTypeId: dogTypeId, breedId: catBreedId });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('ANIMAL_BREED_SPECIES_MISMATCH');

    const legacy = await request(app())
      .post('/api/v1/user/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Legacy', petType: `${prefix}-missing-type` });
    expect(legacy.status).toBe(422);
    expect(legacy.body.error.code).toBe('PET_UNSUPPORTED_LEGACY_VALUE');
  });

  it('does not disclose cross-owner pets and enforces media ownership for documents', async () => {
    const ownerToken = `token-${prefix}-owner-c`;
    const otherToken = `token-${prefix}-owner-d`;
    const created = await request(app())
      .post('/api/v1/user/pets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Scoped Pet', animalTypeId: dogTypeId, breedId: dogBreedId });
    const petId = created.body.data.item.id as number;

    const crossOwner = await request(app())
      .get(`/api/v1/user/pets/${petId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(crossOwner.status).toBe(404);

    const otherOwnerId = await resolveSubjectOnly(principal(`${prefix}-owner-d`));
    const otherMedia = await prisma.media.create({
      data: {
        id: 1_900_000_000 + Math.floor(Math.random() * 10_000),
        ownerUserId: otherOwnerId,
        filename: `${prefix}-other.pdf`,
        mimetype: 'application/pdf',
        size: 12,
        storageKey: `${prefix}/other.pdf`,
        url: `/api/v1/media/${prefix}/other.pdf`,
        status: 'READY',
      },
    });

    const document = await request(app())
      .post(`/api/v1/user/pets/${petId}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mediaId: otherMedia.id, title: 'Wrong owner', category: 'LAB_REPORT' });
    expect(document.status).toBe(403);
    expect(document.body.error.code).toBe('PET_INVALID_MEDIA_OWNERSHIP');
  });

  it('resolves BPA and Furtail mobile tokens with the same subject to the same owner', async () => {
    const subject = `${prefix}-shared-subject`;
    const furtailToken = `token-furtail:${subject}`;
    const bpaToken = `token-bpa:${subject}`;

    const created = await request(app())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${furtailToken}`)
      .send({ name: 'Shared Owner Pet', animalTypeId: dogTypeId, breedId: dogBreedId });
    expect(created.status).toBe(201);
    const petId = created.body.data.item.id as number;

    const fetchedViaBpaAudience = await request(app())
      .get(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${bpaToken}`);
    expect(fetchedViaBpaAudience.status).toBe(200);
    expect(fetchedViaBpaAudience.body.data.item.id).toBe(petId);

    const linkCount = await prisma.userCentralAuthLink.count({ where: { subject } });
    expect(linkCount).toBe(1);
  });

  it('ignores owner ids in request data and always uses the authenticated subject owner', async () => {
    const ownerSubject = `${prefix}-owner-id-ignored`;
    const otherOwnerId = await resolveSubjectOnly(principal(`${prefix}-owner-id-other`));

    const created = await request(app())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer token-${ownerSubject}`)
      .send({
        name: 'Owner Scoped',
        animalTypeId: dogTypeId,
        breedId: dogBreedId,
        ownerUserId: otherOwnerId,
        userId: otherOwnerId,
      });
    expect(created.status).toBe(201);

    const ownerLink = await prisma.userCentralAuthLink.findUnique({
      where: { subject: ownerSubject },
    });
    const pet = await prisma.pet.findUnique({ where: { id: created.body.data.item.id as number } });
    expect(pet?.ownerUserId).toBe(ownerLink?.userId);
    expect(pet?.ownerUserId).not.toBe(otherOwnerId);
  });

  it('persists profile image retain, replace, explicit clear, and ownership rejection', async () => {
    const token = `token-${prefix}-owner-profile`;
    const ownerId = await resolveSubjectOnly(principal(`${prefix}-owner-profile`));
    const otherOwnerId = await resolveSubjectOnly(principal(`${prefix}-owner-profile-other`));
    const mediaOne = await prisma.media.create({
      data: {
        ownerUserId: ownerId,
        filename: `${prefix}-profile-one.jpg`,
        mimetype: 'image/jpeg',
        size: 12,
        storageKey: `${prefix}/profile-one.jpg`,
        url: `/api/v1/media/${prefix}/profile-one.jpg`,
        status: 'READY',
      },
    });
    const mediaTwo = await prisma.media.create({
      data: {
        ownerUserId: ownerId,
        filename: `${prefix}-profile-two.jpg`,
        mimetype: 'image/jpeg',
        size: 12,
        storageKey: `${prefix}/profile-two.jpg`,
        url: `/api/v1/media/${prefix}/profile-two.jpg`,
        status: 'READY',
      },
    });
    const otherMedia = await prisma.media.create({
      data: {
        ownerUserId: otherOwnerId,
        filename: `${prefix}-profile-other.jpg`,
        mimetype: 'image/jpeg',
        size: 12,
        storageKey: `${prefix}/profile-other.jpg`,
        url: `/api/v1/media/${prefix}/profile-other.jpg`,
        status: 'READY',
      },
    });

    const created = await request(app())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Profile Image Pet',
        animalTypeId: dogTypeId,
        breedId: dogBreedId,
        profileImageId: mediaOne.id,
      });
    expect(created.status).toBe(201);
    const petId = created.body.data.item.id as number;
    expect(created.body.data.item.profilePicId).toBe(mediaOne.id);

    const omitted = await request(app())
      .patch(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'No profile image field' });
    expect(omitted.status).toBe(200);
    expect(omitted.body.data.item.profilePicId).toBe(mediaOne.id);

    const replaced = await request(app())
      .patch(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profileImageId: mediaTwo.id });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.item.profilePicId).toBe(mediaTwo.id);

    const crossOwner = await request(app())
      .patch(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profileImageId: otherMedia.id });
    expect(crossOwner.status).toBe(403);
    expect(crossOwner.body.error.code).toBe('PET_INVALID_MEDIA_OWNERSHIP');

    const cleared = await request(app())
      .patch(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profileImageId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.item.profilePicId).toBeNull();
    const persisted = await prisma.pet.findUnique({ where: { id: petId } });
    expect(persisted?.profilePicId).toBeNull();

    const afterFreshApp = await request(app())
      .get(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(afterFreshApp.status).toBe(200);
    expect(afterFreshApp.body.data.item.profilePicId).toBeNull();
  });

  it('handles optimistic version conflicts and archive filtering', async () => {
    const token = `token-${prefix}-owner-e`;
    const created = await request(app())
      .post('/api/v1/me/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Versioned Pet', animalTypeId: catTypeId, breedId: catBreedId });
    expect(created.status).toBe(201);
    const petId = created.body.data.item.id as number;
    const version = created.body.data.item.version as number;

    const updated = await request(app())
      .patch(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version, notes: 'First update' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.item.version).toBe(version + 1);

    const stale = await request(app())
      .patch(`/api/v1/user/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version, notes: 'Stale update' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('PET_VERSION_CONFLICT');

    const archived = await request(app())
      .delete(`/api/v1/me/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archived.status).toBe(200);

    const list = await request(app())
      .get('/api/v1/me/pets')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.items.map((item: { id: number }) => item.id)).not.toContain(petId);
  });
});
