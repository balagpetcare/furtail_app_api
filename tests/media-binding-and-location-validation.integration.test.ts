import request from 'supertest';

import { AppError } from '../src/core/errors/app-error';
import { createAppWithDependencies } from '../src/app';
import { createFundraisingStore } from '../src/modules/fundraising/fundraising-store';
import { createSocialCoreStore } from '../src/modules/social/social-store';
import { createLocationStore } from '../src/modules/locations/location-store';
import { getTestPrisma } from './helpers/test-prisma';
import { disconnectPrisma } from '../src/infrastructure/db/prisma-client';
import type {
  AreaFilter,
  AreaRecord,
  CountryRecord,
  LocationDataSource,
  LocationRecord,
} from '../src/modules/locations/location-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';

function principal(sub: string): AuthenticatedPrincipal {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub,
    issuer: 'https://central-auth.test',
    audience: 'furtail-mobile',
    clientId: 'furtail-mobile',
    expiresAt: now + 600,
    issuedAt: now - 10,
    roles: ['member'],
    permissions: [],
    scopes: ['openid'],
    claims: {},
  };
}

function verifier(): TokenVerifier {
  return {
    async verifyAccessToken(token: string) {
      if (token === 'token-1') return principal('1');
      if (token === 'token-2') return principal('2');
      throw AppError.authenticationInvalid();
    },
  };
}

/** Division 1 -> District 10 (child of 1) -> Upazila 100 (child of 10). District 20 belongs to a different division. */
function buildFakeLocationDataSource(): LocationDataSource {
  const divisions: LocationRecord[] = [
    { id: 1, code: 'DIV-1', nameEn: 'Dhaka', nameBn: null, sortOrder: 0 },
  ];
  const districts: (LocationRecord & { divisionId: number })[] = [
    { id: 10, code: 'DIS-10', nameEn: 'Dhaka District', nameBn: null, sortOrder: 0, divisionId: 1 },
    { id: 20, code: 'DIS-20', nameEn: 'Other District', nameBn: null, sortOrder: 0, divisionId: 2 },
  ];
  const upazilas: (LocationRecord & { districtId: number })[] = [
    { id: 100, code: 'UPA-100', nameEn: 'Savar', nameBn: null, sortOrder: 0, districtId: 10 },
  ];

  return {
    async findCountryByIso2(): Promise<CountryRecord | null> {
      return null;
    },
    async listCountries() {
      return [];
    },
    async listDivisions() {
      return divisions;
    },
    async getDivision(id) {
      return divisions.find((d) => d.id === id) ?? null;
    },
    async listDistricts(divisionId) {
      return districts.filter((d) => d.divisionId === divisionId);
    },
    async getDistrict(id) {
      return districts.find((d) => d.id === id) ?? null;
    },
    async listUpazilas(districtId) {
      return upazilas.filter((u) => u.districtId === districtId);
    },
    async getUpazila(id) {
      return upazilas.find((u) => u.id === id) ?? null;
    },
    async listUnions() {
      return [];
    },
    async getUnion() {
      return null;
    },
    async listAreas(_filter: AreaFilter): Promise<AreaRecord[]> {
      return [];
    },
    async getArea() {
      return null;
    },
  };
}

function buildApp() {
  const socialStore = createSocialCoreStore(undefined, undefined, async (principal) => {
    const id = Number(principal.sub);
    return Number.isFinite(id) && id > 0 ? { id } : null;
  });
  const fundraisingStore = createFundraisingStore(socialStore, { prisma: getTestPrisma() });
  const locationStore = createLocationStore(buildFakeLocationDataSource());
  const app = createAppWithDependencies({
    authVerifier: verifier(),
    socialStore,
    fundraisingStore,
    locationStore,
  });
  return { app, socialStore };
}

async function cleanupFundraisingRows(): Promise<void> {
  const prisma = getTestPrisma();
  await prisma.fundraisingWebhookEvent.deleteMany({});
  await prisma.fundraisingReceipt.deleteMany({ where: { donationId: { gt: 1 } } });
  await prisma.fundraisingPaymentAttempt.deleteMany({ where: { donationId: { gt: 1 } } });
  await prisma.fundraisingDonation.deleteMany({ where: { id: { gt: 1 } } });
  await prisma.fundraisingCampaignMedia.deleteMany({ where: { campaignId: { gt: 1 } } });
  await prisma.fundraisingCampaignUpdate.deleteMany({ where: { campaignId: { gt: 1 } } });
  await prisma.fundraisingCampaign.deleteMany({ where: { id: { gt: 1 } } });
  await prisma.fundraisingCampaignDraft.deleteMany({ where: { id: { gt: 1 } } });
  await prisma.fundraisingVerificationDocument.deleteMany({ where: { accountId: { gt: 1 } } });
  await prisma.fundraisingVerificationAccount.deleteMany({ where: { ownerUserId: { gt: 1 } } });
}

beforeEach(async () => {
  await cleanupFundraisingRows();
});

afterAll(async () => {
  await getTestPrisma().$disconnect();
  await disconnectPrisma();
});

describe('media upload: content binding, ownership, and idempotent retry', () => {
  it('binds an upload to its content type/id/purpose so it can later be verified as belonging to that draft', async () => {
    const { app, socialStore } = buildApp();

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-1')
      .field('contentType', 'FUNDRAISING_DRAFT')
      .field('contentId', 'draft_abc123')
      .field('purpose', 'generic')
      .attach('file', Buffer.from('bytes'), 'photo.jpg');

    expect(res.status).toBe(200);
    const mediaId = res.body.data.id as number;
    const mediaUrl = res.body.data.url as string;
    const bound = socialStore.listMediaByContent('FUNDRAISING_DRAFT', 'draft_abc123');
    expect(bound.map((m) => m.id)).toContain(mediaId);
    expect(socialStore.isMediaOwnedBy(1, mediaId)).toBe(true);

    const fetched = await request(app).get(mediaUrl);
    expect(fetched.status).toBe(200);
    expect(fetched.headers['content-type']).toContain('image/');
  });

  it('a retried upload with the same Idempotency-Key returns the same media, not a duplicate', async () => {
    const { app, socialStore } = buildApp();
    const fileBytes = Buffer.from('identical-bytes');

    const first = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'retry-key-1')
      .attach('file', fileBytes, 'a.jpg');

    const retried = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'retry-key-1')
      .attach('file', fileBytes, 'a.jpg');

    expect(first.status).toBe(200);
    expect(retried.status).toBe(200);
    expect(retried.body.data.id).toBe(first.body.data.id);
    expect(socialStore.listMediaByContent('generic', 'n/a').length).toBe(0); // sanity: helper works
  });

  it('a different Idempotency-Key (or none) creates a genuinely new upload — retry semantics only dedupe the SAME retried request', async () => {
    const { app } = buildApp();
    const fileBytes = Buffer.from('identical-bytes');

    const first = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'key-a')
      .attach('file', fileBytes, 'a.jpg');

    const second = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'key-b')
      .attach('file', fileBytes, 'a.jpg');

    expect(first.body.data.id).not.toBe(second.body.data.id);
  });

  it("the same Idempotency-Key from a different user does not collide with another user's upload", async () => {
    const { app } = buildApp();
    const fileBytes = Buffer.from('shared-bytes');

    const userOne = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-1')
      .set('Idempotency-Key', 'same-key')
      .attach('file', fileBytes, 'a.jpg');

    const userTwo = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', 'Bearer token-2')
      .set('Idempotency-Key', 'same-key')
      .attach('file', fileBytes, 'a.jpg');

    expect(userOne.body.data.id).not.toBe(userTwo.body.data.id);
  });
});

describe('fundraising draft/campaign writes: server-side location hierarchy validation', () => {
  it('accepts a consistent division -> district -> upazila selection', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'Consistent location', bdDivisionId: 1, bdDistrictId: 10, bdUpazilaId: 100 });
    expect(res.status).toBe(201);
  });

  it('rejects a district that does not belong to the given division with a field-level typed error', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'Inconsistent location', bdDivisionId: 1, bdDistrictId: 20 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOCATION_PARENT_INVALID');
  });

  it('rejects an unknown districtId outright', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'Unknown district', bdDistrictId: 999999 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOCATION_PARENT_INVALID');
  });

  it('also validates on draft update, not just creation', async () => {
    const { app } = buildApp();
    const created = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'Draft' });
    const draftId = created.body.data.id as string;

    const res = await request(app)
      .patch(`/api/v1/fundraising/campaigns/${draftId}/draft`)
      .set('Authorization', 'Bearer token-1')
      .send({ bdDivisionId: 1, bdDistrictId: 20 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOCATION_PARENT_INVALID');
  });

  it('does not run location validation when no location fields are present', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v1/fundraising/campaigns/drafts')
      .set('Authorization', 'Bearer token-1')
      .send({ title: 'No location yet' });
    expect(res.status).toBe(201);
  });
});
