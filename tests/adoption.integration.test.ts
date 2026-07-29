import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import type { AdoptionStore } from '../src/modules/adoption/adoption-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

function buildApp() {
  const principal: AuthenticatedPrincipal = {
    sub: '1',
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    issuedAt: Math.floor(Date.now() / 1000) - 10,
    roles: ['member'],
    permissions: [],
    scopes: ['openid'],
    claims: {},
  };

  const verifier: TokenVerifier = {
    async verifyAccessToken(token: string) {
      if (token === 'member') return principal;
      throw AppError.authenticationInvalid('Invalid or expired access token');
    },
  };

  const now = new Date().toISOString();
  const listing = (id = 42, extra: Record<string, unknown> = {}) => ({
    id,
    status: 'PUBLISHED',
    name: 'Luna',
    species: 'DOG',
    breed: 'Mixed',
    ageLabel: '1 year',
    gender: 'Female',
    location: 'Bangladesh',
    description: 'Friendly and playful',
    vaccinated: true,
    dewormed: true,
    neutered: false,
    microchipped: false,
    isShelter: false,
    ownerName: 'Member One',
    ownerUserId: 1,
    ownerAvatarUrl: '',
    ownerRoleLabel: 'Owner',
    ownerVerified: false,
    viewerIsOwner: false,
    ownerContactPhone: '0123456789',
    ownerWhatsappPhone: '',
    ownerCityAreaText: 'Dhaka',
    pickupLocationNotes: 'Pickup in Dhaka',
    galleryLabels: ['Media 1'],
    personalityTags: [],
    compatibilityTags: [],
    serviceAreas: ['Bangladesh'],
    adopterConditions: [],
    story: 'Friendly and playful',
    healthNotes: 'Healthy',
    coverImageUrl: null,
    galleryImageUrls: [],
    media: [],
    favoriteCount: 0,
    commentCount: 0,
    isFavoritedByMe: false,
    favorites: [],
    countryId: 1,
    bdDivisionId: null,
    bdDistrictId: null,
    bdUpazilaId: null,
    bdAreaId: null,
    latitude: null,
    longitude: null,
    serviceAreaType: 'LOCAL',
    applicationCount: 0,
    sizeText: 'Medium',
    colorText: 'Brown',
    ageYears: 1,
    ageMonths: 0,
    ageDays: 0,
    totalAgeDays: 365,
    approximateDateOfBirth: now,
    _count: { favorites: 0, comments: 0, applications: 0 },
    ...extra,
  });

  const application = (id = 99, extra: Record<string, unknown> = {}) => ({
    id,
    adoptionListingId: 42,
    applicantUserId: 1,
    ownerUserId: 1,
    status: 'SUBMITTED',
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
    applicantName: 'Member One',
    applicantUsername: 'memberone',
    applicantAvatarUrl: '',
    applicantPhone: '0123456789',
    applicantWhatsappPhone: '',
    applicantCityAreaText: 'Dhaka',
    applicantAddress: 'Dhaka',
    messageToOwner: 'Please consider me',
    answers: [],
    consentToHomeCheck: true,
    consentToFollowUp: true,
    applicantExperienceSummary: '',
    applicantHouseholdSummary: '',
    applicantOtherPetsSummary: '',
    applicantOccupation: '',
    ownerNotes: '',
    rejectedReason: '',
    applicant: {
      id: 1,
      profile: {
        displayName: 'Member One',
        username: 'memberone',
        avatarMedia: null,
      },
    },
    pet: listing(42),
    ...extra,
  });

  const adoptionStore = {
    async createDraft() {
      return listing(1, { status: 'DRAFT' });
    },
    async getListing(_userId: number, id: number) {
      return listing(id);
    },
    async updateListing(_userId: number, id: number) {
      return listing(id, { status: 'DRAFT' });
    },
    async publishListing(_userId: number, id: number) {
      return listing(id);
    },
    async setStatus(userId: number, id: number, status: string) {
      if (userId !== 1) {
        throw AppError.adoptionStatusChangeForbidden('You do not own this listing');
      }
      if (id === 999) {
        throw AppError.adoptionNotFound();
      }
      if (id === 101) {
        throw AppError.adoptionStatusTransitionInvalid('Invalid transition');
      }
      if (id === 102) {
        throw AppError.adoptionAlreadyClosed();
      }
      if (id === 103) {
        throw AppError.adoptionStatusTransitionInvalid('Cannot change status of archived/deleted');
      }
      return listing(id, { status });
    },
    async hardDeleteListing(userId: number, id: number) {
      if (userId !== 1) {
        throw AppError.adoptionStatusChangeForbidden('You do not own this listing');
      }
      return { deleted: true, id };
    },

    async favoriteListing(_userId: number, id: number) {
      return listing(id, { isFavoritedByMe: true, favorites: [{ userId: 1 }], favoriteCount: 1 });
    },
    async unfavoriteListing(_userId: number, id: number) {
      return listing(id);
    },
    async listPublic() {
      return [listing(42)];
    },
    async listOwned() {
      return [listing(42, { status: 'DRAFT', viewerIsOwner: true })];
    },
    async listComments() {
      return {
        items: [
          {
            id: 7,
            adoptionListingId: 42,
            authorUserId: 1,
            text: 'Interested',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            user: {
              id: 1,
              profile: { displayName: 'Member One', username: 'memberone', avatarMedia: null },
            },
            canDelete: true,
          },
        ],
        meta: { commentCount: 1 },
      };
    },
    async addComment(_userId: number, id: number, text: string) {
      return {
        comment: {
          id: 8,
          adoptionListingId: id,
          authorUserId: 1,
          text,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          user: {
            id: 1,
            profile: { displayName: 'Member One', username: 'memberone', avatarMedia: null },
          },
          canDelete: true,
        },
        commentCount: 2,
      };
    },
    async deleteComment() {
      return { deleted: true, id: 7, commentCount: 0 };
    },
    async reportListing() {
      return { id: 1, reasonCode: 'SPAM', details: null };
    },
    async createApplication(_userId: number, id: number) {
      return application(99, { adoptionListingId: id, pet: listing(id) });
    },
    async listApplicantApplications() {
      return [application(99)];
    },
    async listListingApplications() {
      return [application(99)];
    },
    async getApplication(_userId: number, id: number) {
      return application(id);
    },
    async updateApplicationStatus(_userId: number, id: number, status: string) {
      return application(id, { status });
    },
    async updateApplicationNotes(_userId: number, id: number, notes: string) {
      return application(id, { ownerNotes: notes });
    },
  } as unknown as AdoptionStore;

  const locationStore = {
    validateSelection: jest.fn().mockImplementation(async (input: any) => {
      if (input.divisionId === 999) {
        return { valid: false, reason: 'Unknown divisionId' };
      }
      if (input.divisionId !== undefined && input.districtId !== undefined && input.districtId !== input.divisionId * 10) {
        return { valid: false, reason: 'districtId does not belong to divisionId' };
      }
      return { valid: true };
    }),
  } as any;

  return createAppWithDependencies({ authVerifier: verifier, adoptionStore, locationStore });
}

describe('adoption route aliases', () => {
  it('serves the same public list/detail contract from singular and plural paths', async () => {
    const app = buildApp();

    const singularFeed = await request(app).get('/api/v1/adoption/feed');
    const pluralFeed = await request(app).get('/api/v1/adoptions/feed');
    expect(singularFeed.status).toBe(200);
    expect(pluralFeed.status).toBe(200);
    expect(singularFeed.body.data.items).toEqual(pluralFeed.body.data.items);

    const singularDetail = await request(app).get('/api/v1/adoption/42');
    const pluralDetail = await request(app).get('/api/v1/adoptions/42');
    expect(singularDetail.status).toBe(200);
    expect(pluralDetail.status).toBe(200);
    expect(singularDetail.body.data.id).toBe(42);
    expect(pluralDetail.body.data.id).toBe(42);
  });

  it('serves adoption engagement routes on the canonical paths and the apply alias', async () => {
    const app = buildApp();

    const favorite = await request(app)
      .post('/api/v1/adoptions/42/favorite')
      .set('Authorization', 'Bearer member');
    expect(favorite.status).toBe(200);
    expect(favorite.body.data.id).toBe(42);
    expect(favorite.body.data.isFavoritedByMe).toBe(true);

    const comments = await request(app).get('/api/v1/adoptions/42/comments');
    expect(comments.status).toBe(200);
    expect(comments.body.data).toHaveLength(1);
    expect(comments.body.meta.commentCount).toBe(1);

    const comment = await request(app)
      .post('/api/v1/adoptions/42/comments')
      .set('Authorization', 'Bearer member')
      .send({ text: 'Please keep me posted' });
    expect(comment.status).toBe(201);
    expect(comment.body.data.comment.text).toBe('Please keep me posted');

    const report = await request(app)
      .post('/api/v1/adoptions/42/report')
      .set('Authorization', 'Bearer member')
      .send({ reasonCode: 'SPAM' });
    expect(report.status).toBe(200);
    expect(report.body.data.reasonCode).toBe('SPAM');

    const application = await request(app)
      .post('/api/v1/adoptions/42/applications')
      .set('Authorization', 'Bearer member')
      .send({ applicantName: 'Member One', applicantPhone: '0123456789' });
    expect(application.status).toBe(201);
    expect(application.body.data.pet.id).toBe(42);
    expect(application.body.data.applicant.id).toBe(1);

    const applyAlias = await request(app)
      .post('/api/v1/adoptions/42/apply')
      .set('Authorization', 'Bearer member')
      .send({ applicantName: 'Member One', applicantPhone: '0123456789' });
    expect(applyAlias.status).toBe(201);
    expect(applyAlias.body.data.id).toBe(99);
  });

  it('returns a typed media-bound error when a draft tries to reuse another listing media', async () => {
    const principal: AuthenticatedPrincipal = {
      sub: '1',
      issuer: 'https://central-auth.test',
      audience: 'furtail-mobile',
      clientId: 'furtail-mobile',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      issuedAt: Math.floor(Date.now() / 1000) - 10,
      roles: ['member'],
      permissions: [],
      scopes: ['openid'],
      claims: {},
    };
    const customApp = createAppWithDependencies({
      authVerifier: {
        async verifyAccessToken(token: string) {
          if (token === 'member') return principal;
          throw AppError.authenticationInvalid('Invalid or expired access token');
        },
      },
      adoptionStore: {
        async createDraft() {
          throw AppError.adoptionMediaAlreadyBound();
        },
      } as unknown as AdoptionStore,
      locationStore: {
        validateSelection: jest.fn().mockResolvedValue({ valid: true }),
      } as any,
    });

    const res = await request(customApp)
      .post('/api/v1/adoptions/drafts')
      .set('Authorization', 'Bearer member')
      .send({ petName: 'Luna', mediaIds: [11] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ADOPTION_MEDIA_ALREADY_BOUND');
  });

  describe('adoption status lifecycle and authorization', () => {
    it('allows owner to mark published listing adopted/closed via PATCH and POST', async () => {
      const app = buildApp();

      const resPatch = await request(app)
        .patch('/api/v1/adoptions/42/status')
        .set('Authorization', 'Bearer member')
        .send({ status: 'ADOPTED' });
      expect(resPatch.status).toBe(200);
      expect(resPatch.body.data.status).toBe('ADOPTED');

      const resPost = await request(app)
        .post('/api/v1/adoptions/42/status')
        .set('Authorization', 'Bearer member')
        .send({ status: 'ADOPTED' });
      expect(resPost.status).toBe(200);
      expect(resPost.body.data.status).toBe('ADOPTED');
    });

    it('enforces singular/plural path compatibility for status updates', async () => {
      const app = buildApp();

      const resSingular = await request(app)
        .patch('/api/v1/adoption/42/status')
        .set('Authorization', 'Bearer member')
        .send({ status: 'ADOPTED' });
      expect(resSingular.status).toBe(200);
      expect(resSingular.body.data.status).toBe('ADOPTED');
    });

    it('denies status change for non-owner and returns a typed 403 error without clearing sessions', async () => {
      const app = buildApp();

      // Change Authorization token to a dummy non-owner token
      const verifier: TokenVerifier = {
        async verifyAccessToken() {
          return {
            sub: '2', // different user
            issuer: 'https://central-auth.test',
            audience: 'furtail-mobile',
            clientId: 'furtail-mobile',
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            issuedAt: Math.floor(Date.now() / 1000) - 10,
            roles: ['member'],
            permissions: [],
            scopes: ['openid'],
            claims: {},
          };
        },
      };
      const customApp = createAppWithDependencies({
        authVerifier: verifier,
        adoptionStore: {
          async setStatus() {
            throw AppError.adoptionStatusChangeForbidden('You do not own this listing');
          },
        } as any,
      });

      const res = await request(customApp)
        .patch('/api/v1/adoptions/42/status')
        .set('Authorization', 'Bearer nonowner')
        .send({ status: 'ADOPTED' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADOPTION_STATUS_CHANGE_FORBIDDEN');
    });

    it('rejects invalid transitions with a typed 400/409 error', async () => {
      const app = buildApp();

      const res = await request(app)
        .patch('/api/v1/adoptions/101/status')
        .set('Authorization', 'Bearer member')
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ADOPTION_STATUS_TRANSITION_INVALID');
    });

    it('handles already-closed idempotent transition properly', async () => {
      const app = buildApp();

      const res = await request(app)
        .patch('/api/v1/adoptions/102/status')
        .set('Authorization', 'Bearer member')
        .send({ status: 'ADOPTED' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ADOPTION_ALREADY_CLOSED');
    });

    it('restricts status changes on archived/deleted listings', async () => {
      const app = buildApp();

      const res = await request(app)
        .patch('/api/v1/adoptions/103/status')
        .set('Authorization', 'Bearer member')
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ADOPTION_STATUS_TRANSITION_INVALID');
    });

    describe('date and location validation', () => {
      it('accepts a valid UTC ISO-8601 string ending in Z for DOB', async () => {
        const app = buildApp();
        const res = await request(app)
          .post('/api/v1/adoptions/drafts')
          .set('Authorization', 'Bearer member')
          .send({ petName: 'Luna', approximateDateOfBirth: '2025-03-18T16:18:57.773Z' });
        expect(res.status).toBe(201);
      });

      it('accepts and normalizes legacy timezone-less format for DOB', async () => {
        const app = buildApp();
        const res = await request(app)
          .post('/api/v1/adoptions/drafts')
          .set('Authorization', 'Bearer member')
          .send({ petName: 'Luna', approximateDateOfBirth: '2025-03-18T16:18:57.773898' });
        expect(res.status).toBe(201);
      });

      it('accepts null DOB', async () => {
        const app = buildApp();
        const res = await request(app)
          .post('/api/v1/adoptions/drafts')
          .set('Authorization', 'Bearer member')
          .send({ petName: 'Luna', approximateDateOfBirth: null });
        expect(res.status).toBe(201);
      });

      it('rejects invalid formatted date with ADOPTION_DATE_INVALID', async () => {
        const app = buildApp();
        const res = await request(app)
          .post('/api/v1/adoptions/drafts')
          .set('Authorization', 'Bearer member')
          .send({ petName: 'Luna', approximateDateOfBirth: '18-03-2025' });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('ADOPTION_DATE_INVALID');
      });

      it('validates location hierarchy and rejects invalid parents with LOCATION_PARENT_INVALID', async () => {
        const app = buildApp();
        const res = await request(app)
          .post('/api/v1/adoptions/drafts')
          .set('Authorization', 'Bearer member')
          .send({ petName: 'Luna', countryId: 1, bdDivisionId: 999 });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('LOCATION_PARENT_INVALID');
      });

      it('requires division and district on publish when countryId is 1', async () => {
        const app = buildApp();
        const res = await request(app)
          .post('/api/v1/adoptions/42/publish')
          .set('Authorization', 'Bearer member');
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('ADOPTION_LOCATION_REQUIRED');
      });
    });
  });
});
