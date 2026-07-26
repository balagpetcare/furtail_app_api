import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import { AppError } from '../src/core/errors/app-error';
import { PetContractError } from '../src/modules/pets/pet-client';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

describe('pet contracts', () => {
  const now = Math.floor(Date.now() / 1000);

  function principal(sub: string): AuthenticatedPrincipal {
    return {
      sub,
      issuer: 'https://central-auth.test',
      audience: 'furtail-mobile',
      clientId: 'furtail-mobile',
      expiresAt: now + 300,
      issuedAt: now - 10,
      roles: ['member'],
      permissions: ['pet:read'],
      scopes: ['openid', 'profile'],
      claims: {},
    };
  }

  function verifierFor(sub: string): TokenVerifier {
    return {
      async verifyAccessToken(token: string) {
        if (token === `valid-token-${sub}`) {
          return principal(sub);
        }
        throw AppError.authenticationInvalid('Invalid or expired access token');
      },
    };
  }

  function buildApp(sub = '1', overrides: Record<string, unknown> = {}) {
    return createAppWithDependencies(Object.assign({ authVerifier: verifierFor(sub) }, overrides));
  }

  it('supports pet CRUD, profile images, and medical records', async () => {
    const app = buildApp('1');

    const upload = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token-1')
      .attach('file', Buffer.from('pet-media-bytes'), 'nova.jpg');
    expect(upload.status).toBe(200);
    const mediaId = upload.body.data.id as number;

    const created = await request(app)
      .post('/api/v1/user/pets/register')
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        name: 'Nova',
        animalTypeId: 1,
        breedId: 11,
        sex: 'FEMALE',
        weightKg: 11.2,
        profilePicId: mediaId,
        bio: 'Playful and calm',
        visibility: 'PUBLIC',
        isPublicProfileEnabled: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('Nova');
    expect(created.body.data.profilePicId).toBe(mediaId);

    const petId = created.body.data.id as number;

    const updated = await request(app)
      .patch(`/api/v1/user/pets/${petId}`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        notes: 'Updated notes',
        profilePicId: mediaId,
        bloodType: 'DEA 1.1+',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.notes).toBe('Updated notes');

    const profileUpdate = await request(app)
      .patch(`/api/v1/pets/${petId}/profile`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        bio: 'Updated public bio',
        coverMediaId: mediaId,
        visibility: 'PUBLIC',
        isPublicProfileEnabled: true,
      });
    expect(profileUpdate.status).toBe(200);
    expect(profileUpdate.body.data.coverMediaId).toBe(mediaId);

    const vaccination = await request(app)
      .post(`/api/v1/user/pets/${petId}/vaccinations`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        vaccineName: 'Rabies',
        administeredAt: '2026-01-01T00:00:00.000Z',
        nextDueDate: '2027-01-01T00:00:00.000Z',
      });
    expect(vaccination.status).toBe(201);

    const history = await request(app)
      .post(`/api/v1/user/pets/${petId}/medical-history/records`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        condition: 'Annual checkup',
        visitDate: '2026-01-02T00:00:00.000Z',
      });
    expect(history.status).toBe(201);

    const deworming = await request(app)
      .post(`/api/v1/user/pets/${petId}/deworming`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        medicationName: 'Ivermectin',
        administeredAt: '2026-01-03T00:00:00.000Z',
        nextDueDate: '2026-07-03T00:00:00.000Z',
      });
    expect(deworming.status).toBe(201);

    const weight = await request(app)
      .post(`/api/v1/user/pets/${petId}/weights`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        weightKg: 12.1,
        recordedAt: '2026-01-04T00:00:00.000Z',
      });
    expect(weight.status).toBe(201);

    const document = await request(app)
      .post(`/api/v1/user/pets/${petId}/documents`)
      .set('Authorization', 'Bearer valid-token-1')
      .send({
        mediaId,
        category: 'PROFILE_IMAGE',
        title: 'Nova profile image',
      });
    expect(document.status).toBe(201);

    const profile = await request(app)
      .get(`/api/v1/user/pets/${petId}/profile`)
      .set('Authorization', 'Bearer valid-token-1');
    expect(profile.status).toBe(200);
    expect(profile.body.data.name).toBe('Nova');
    expect(profile.body.data.weightKg).toBe(12.1);
    expect(profile.body.data.photoUrl).toContain('memory://media/');

    const medical = await request(app)
      .get(`/api/v1/user/pets/${petId}/medical-history`)
      .set('Authorization', 'Bearer valid-token-1');
    expect(medical.status).toBe(200);
    expect(medical.body.data.vaccinations).toHaveLength(1);
    expect(medical.body.data.medicalHistory).toHaveLength(1);
    expect(medical.body.data.dewormingHistory).toHaveLength(1);
    expect(medical.body.data.weightHistory).toHaveLength(2);
    expect(medical.body.data.documents).toHaveLength(1);

    const deleted = await request(app)
      .delete(`/api/v1/user/pets/${petId}`)
      .set('Authorization', 'Bearer valid-token-1');
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);
  });

  it('serves public pet contracts and prevents duplicate follow or like relationships', async () => {
    const app = buildApp('2');

    const pet = await request(app)
      .get('/api/v1/pets/1')
      .set('Authorization', 'Bearer valid-token-2');
    expect(pet.status).toBe(200);
    expect(pet.body.data.canViewFullProfile).toBe(true);

    const slug = await request(app)
      .get('/api/v1/pets/slug/luna')
      .set('Authorization', 'Bearer valid-token-2');
    expect(slug.status).toBe(200);
    expect(slug.body.data.slug).toBe('luna');

    const follow1 = await request(app)
      .post('/api/v1/pets/1/follow')
      .set('Authorization', 'Bearer valid-token-2');
    const follow2 = await request(app)
      .post('/api/v1/pets/1/follow')
      .set('Authorization', 'Bearer valid-token-2');
    expect(follow1.status).toBe(200);
    expect(follow2.status).toBe(409);

    const like1 = await request(app)
      .post('/api/v1/pets/1/like')
      .set('Authorization', 'Bearer valid-token-2');
    const like2 = await request(app)
      .post('/api/v1/pets/1/like')
      .set('Authorization', 'Bearer valid-token-2');
    expect(like1.status).toBe(200);
    expect(like2.status).toBe(409);

    const status = await request(app)
      .get('/api/v1/pets/1/social-status')
      .set('Authorization', 'Bearer valid-token-2');
    expect(status.status).toBe(200);
    expect(status.body.data.isFollowing).toBe(true);
    expect(status.body.data.isLiked).toBe(true);

    const posts = await request(app)
      .get('/api/v1/pets/1/posts?limit=1')
      .set('Authorization', 'Bearer valid-token-2');
    expect(posts.status).toBe(200);
    expect(Array.isArray(posts.body.data)).toBe(true);
    expect(posts.body.data[0].caption).toBeDefined();

    const unfollow = await request(app)
      .delete('/api/v1/pets/1/follow')
      .set('Authorization', 'Bearer valid-token-2');
    const unlike = await request(app)
      .delete('/api/v1/pets/1/like')
      .set('Authorization', 'Bearer valid-token-2');
    expect(unfollow.status).toBe(200);
    expect(unlike.status).toBe(200);
  });

  it('rejects missing auth, forbidden access, and ownership violations', async () => {
    const app = buildApp('2');

    const missing = await request(app).get('/api/v1/user/pets/all');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('AUTHENTICATION_REQUIRED');

    const forbidden = await request(app)
      .patch('/api/v1/user/pets/1')
      .set('Authorization', 'Bearer valid-token-2')
      .send({ notes: 'should not work' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('AUTHORIZATION_DENIED');

    const ownership = await request(app)
      .post('/api/v1/user/pets/1/documents')
      .set('Authorization', 'Bearer valid-token-2')
      .send({
        mediaId: 1,
        category: 'PROFILE_IMAGE',
        title: 'Wrong owner document',
      });
    expect(ownership.status).toBe(403);
    expect(ownership.body.error.code).toBe('AUTHORIZATION_DENIED');
  });

  it('maps downstream client failures to stable statuses and codes', async () => {
    const client = {
      listMyPets: async () => ({ pets: [] }),
      getOwnedPet: async () => {
        throw new PetContractError('MALFORMED_RESPONSE', 'Malformed downstream response');
      },
      getPetById: async () => {
        throw new PetContractError('NOT_FOUND', 'Pet not found');
      },
      getPetBySlug: async () => {
        throw new PetContractError('NOT_FOUND', 'Pet not found');
      },
      createPet: async () => {
        throw new PetContractError('CONFLICT', 'Duplicate pet');
      },
      updatePet: async () => {
        throw new PetContractError('VALIDATION', 'Invalid pet payload');
      },
      deletePet: async () => ({ id: 1, deleted: true }),
      updatePetProfile: async () => ({ id: 1, name: 'stub' }),
      followPet: async () => ({ followed: true }),
      unfollowPet: async () => ({ followed: false }),
      likePet: async () => ({ liked: true }),
      unlikePet: async () => ({ liked: false }),
      getPetSocialStatus: async () => ({
        isFollowing: false,
        isLiked: false,
        isOwner: false,
        canManage: false,
        followersCount: 0,
        likesCount: 0,
      }),
      getPetPosts: async () => {
        throw new PetContractError('DOWNSTREAM_UNAVAILABLE', 'Service unavailable');
      },
      createPetPost: async () => ({ id: 1 }),
      getPetProfile: async () => {
        throw new PetContractError('DOWNSTREAM_TIMEOUT', 'Timed out');
      },
      listVaccinations: async () => ({ petId: 1, vaccinations: [] }),
      getVaccination: async () => ({ id: 1 }),
      createVaccination: async () => ({ id: 1 }),
      updateVaccination: async () => ({ id: 1 }),
      deleteVaccination: async () => ({ id: 1, deleted: true }),
      listMedicalHistory: async () => ({ petId: 1, medicalHistory: [] }),
      getMedicalHistoryRecord: async () => ({ id: 1 }),
      createMedicalHistoryRecord: async () => ({ id: 1 }),
      updateMedicalHistoryRecord: async () => ({ id: 1 }),
      deleteMedicalHistoryRecord: async () => ({ id: 1, deleted: true }),
      listDewormingRecords: async () => ({ petId: 1, dewormingHistory: [] }),
      getDewormingRecord: async () => ({ id: 1 }),
      createDewormingRecord: async () => ({ id: 1 }),
      updateDewormingRecord: async () => ({ id: 1 }),
      deleteDewormingRecord: async () => ({ id: 1, deleted: true }),
      listWeightRecords: async () => ({ petId: 1, weightHistory: [] }),
      getWeightRecord: async () => ({ id: 1 }),
      createWeightRecord: async () => ({ id: 1 }),
      updateWeightRecord: async () => ({ id: 1 }),
      deleteWeightRecord: async () => ({ id: 1, deleted: true }),
      listDocuments: async () => ({ petId: 1, documents: [] }),
      getDocument: async () => ({ id: 1 }),
      createDocument: async () => {
        throw new PetContractError('RATE_LIMITED', 'Too many requests');
      },
      updateDocument: async () => ({ id: 1 }),
      deleteDocument: async () => ({ id: 1, deleted: true }),
      getPetMedicalHistory: async () => ({
        pet: {},
        profile: {},
        vaccinations: [],
        medicalHistory: [],
        dewormingHistory: [],
        weightHistory: [],
        documents: [],
      }),
    };

    const app = createAppWithDependencies({
      authVerifier: verifierFor('1'),
      petClient: client as never,
    });

    const notFound = await request(app)
      .get('/api/v1/pets/1')
      .set('Authorization', 'Bearer valid-token-1');
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('NOT_FOUND');

    const conflict = await request(app)
      .post('/api/v1/user/pets/register')
      .set('Authorization', 'Bearer valid-token-1')
      .send({ name: 'Nova', animalTypeId: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CONFLICT');

    const validation = await request(app)
      .patch('/api/v1/user/pets/1')
      .set('Authorization', 'Bearer valid-token-1')
      .send({ name: 'Nova' });
    expect(validation.status).toBe(422);
    expect(validation.body.error.code).toBe('VALIDATION_ERROR');

    const timeout = await request(app)
      .get('/api/v1/user/pets/1/profile')
      .set('Authorization', 'Bearer valid-token-1');
    expect(timeout.status).toBe(504);
    expect(timeout.body.error.code).toBe('SERVICE_UNAVAILABLE');

    const unavailable = await request(app)
      .get('/api/v1/pets/1/posts')
      .set('Authorization', 'Bearer valid-token-1');
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe('SERVICE_UNAVAILABLE');

    const rateLimited = await request(app)
      .post('/api/v1/user/pets/1/documents')
      .set('Authorization', 'Bearer valid-token-1')
      .send({ mediaId: 1, category: 'PROFILE_IMAGE' });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body.error.code).toBe('RATE_LIMITED');

    const malformed = await request(app)
      .get('/api/v1/user/pets/1')
      .set('Authorization', 'Bearer valid-token-1');
    expect(malformed.status).toBe(503);
    expect(malformed.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns a clean failure when media upload fails', async () => {
    const socialStore = {
      uploadMedia: async () => {
        throw new Error('upload failed');
      },
      getMedia: () => null,
    };

    const app = createAppWithDependencies({
      authVerifier: verifierFor('1'),
      socialStore: socialStore as never,
      petClient: {
        listMyPets: async () => ({ pets: [] }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer valid-token-1')
      .attach('file', Buffer.from('upload-failure'), 'bad.jpg');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
