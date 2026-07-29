import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import {
  createAnimalTaxonomyStore,
  AnimalTaxonomyContractError,
} from '../src/modules/animals/animal-taxonomy-store';
import type {
  AnimalTaxonomyDataSource,
  AnimalTypeRecord,
  BreedRecord,
} from '../src/modules/animals/animal-taxonomy-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';
import { AppError } from '../src/core/errors/app-error';

/** Small hierarchy covering every scenario the policy requires. */
function buildFakeDataSource(): AnimalTaxonomyDataSource {
  const types: (AnimalTypeRecord & { isActive: boolean })[] = [
    {
      id: 1,
      code: 'DOG',
      name: 'Dog',
      nameBn: 'কুকুর',
      icon: '🐕',
      scientificName: null,
      categoryId: 1,
      displayOrder: 2,
      isActive: true,
    },
    {
      id: 2,
      code: 'CAT',
      name: 'Cat',
      nameBn: 'বিড়াল',
      icon: '🐈',
      scientificName: null,
      categoryId: 1,
      displayOrder: 1,
      isActive: true,
    },
    {
      id: 3,
      code: 'OLD_TYPE',
      name: 'Deprecated Type',
      nameBn: null,
      icon: null,
      scientificName: null,
      categoryId: null,
      displayOrder: 99,
      isActive: false,
    },
  ];

  const breeds: (BreedRecord & { isActive: boolean })[] = [
    {
      id: 1,
      code: 'LABRADOR',
      name: 'Labrador',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: ['Lab', 'Labrador Retriever'],
      originCountry: 'Canada',
      defaultSizeId: null,
      isMixed: false,
      isOther: false,
      isLocal: false,
      isUnknown: false,
      displayOrder: 2,
      isActive: true,
    },
    {
      id: 2,
      code: 'GERMAN_SHEPHERD',
      name: 'German Shepherd',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: ['GSD', 'Alsatian'],
      originCountry: 'Germany',
      defaultSizeId: null,
      isMixed: false,
      isOther: false,
      isLocal: false,
      isUnknown: false,
      displayOrder: 1,
      isActive: true,
    },
    {
      id: 3,
      code: 'DOG_LOCAL',
      name: 'Bangladeshi Street Dog',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: ['Desi Dog'],
      originCountry: 'Bangladesh',
      defaultSizeId: null,
      isMixed: false,
      isOther: false,
      isLocal: true,
      isUnknown: false,
      displayOrder: 90,
      isActive: true,
    },
    {
      id: 4,
      code: 'DOG_MIXED',
      name: 'Mixed Breed',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: [],
      originCountry: null,
      defaultSizeId: null,
      isMixed: true,
      isOther: false,
      isLocal: false,
      isUnknown: false,
      displayOrder: 91,
      isActive: true,
    },
    {
      id: 5,
      code: 'DOG_UNKNOWN',
      name: 'Unknown',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: ['Not sure'],
      originCountry: null,
      defaultSizeId: null,
      isMixed: false,
      isOther: false,
      isLocal: false,
      isUnknown: true,
      displayOrder: 92,
      isActive: true,
    },
    {
      id: 6,
      code: 'DOG_OTHER',
      name: 'Other',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: [],
      originCountry: null,
      defaultSizeId: null,
      isMixed: false,
      isOther: true,
      isLocal: false,
      isUnknown: false,
      displayOrder: 93,
      isActive: true,
    },
    {
      id: 7,
      code: 'DOG_RETIRED',
      name: 'Retired Breed',
      nameBn: null,
      animalTypeId: 1,
      aliasNames: [],
      originCountry: null,
      defaultSizeId: null,
      isMixed: false,
      isOther: false,
      isLocal: false,
      isUnknown: false,
      displayOrder: 50,
      isActive: false,
    },
    {
      id: 8,
      code: 'PERSIAN',
      name: 'Persian',
      nameBn: null,
      animalTypeId: 2,
      aliasNames: ['Persian Cat'],
      originCountry: 'Iran',
      defaultSizeId: null,
      isMixed: false,
      isOther: false,
      isLocal: false,
      isUnknown: false,
      displayOrder: 1,
      isActive: true,
    },
  ];

  const active = <T extends { isActive: boolean }>(rows: T[]) => rows.filter((r) => r.isActive);
  const bySort = <T extends { displayOrder: number }>(rows: T[]) =>
    [...rows].sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    async listTypes() {
      return bySort(active(types));
    },
    async getType(id) {
      return active(types).find((t) => t.id === id) ?? null;
    },
    async listBreedsByType(animalTypeId) {
      return bySort(active(breeds).filter((b) => b.animalTypeId === animalTypeId));
    },
    async getBreed(id) {
      return active(breeds).find((b) => b.id === id) ?? null;
    },
  };
}

function buildApp() {
  const animalTaxonomyStore = createAnimalTaxonomyStore(buildFakeDataSource());
  const verifier: TokenVerifier = {
    async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
      if (token === 'mobile-user') {
        return {
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
      }
      throw AppError.authenticationInvalid();
    },
  };
  return createAppWithDependencies({ authVerifier: verifier, animalTaxonomyStore });
}

describe('canonical animal taxonomy endpoints', () => {
  it('lists active species, deterministically ordered by displayOrder, excluding inactive ones', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/animal-types');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ code: string }>;
    expect(items.map((t) => t.code)).toEqual(['CAT', 'DOG']); // displayOrder 1, 2
    expect(items.every((t) => t.code !== 'OLD_TYPE')).toBe(true);
    for (const t of items) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('code');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('nameBn');
      expect(t).toHaveProperty('displayOrder');
    }
  });

  it('lists breeds scoped to the given species, ordered, excluding inactive breeds', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/breeds/1');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ code: string; animalTypeId: number }>;
    expect(items.map((b) => b.code)).toEqual([
      'GERMAN_SHEPHERD',
      'LABRADOR',
      'DOG_LOCAL',
      'DOG_MIXED',
      'DOG_UNKNOWN',
      'DOG_OTHER',
    ]);
    expect(items.every((b) => b.code !== 'DOG_RETIRED')).toBe(true);
    expect(items.every((b) => b.animalTypeId === 1)).toBe(true);
  });

  it('includes Local/Indigenous, Mixed breed, Unknown, and Other as safe non-specific choices', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/breeds/1');
    const items = res.body.data.items as Array<{
      isLocal: boolean;
      isMixed: boolean;
      isUnknown: boolean;
      isOther: boolean;
    }>;
    expect(items.some((b) => b.isLocal)).toBe(true);
    expect(items.some((b) => b.isMixed)).toBe(true);
    expect(items.some((b) => b.isUnknown)).toBe(true);
    expect(items.some((b) => b.isOther)).toBe(true);
  });

  it('searches breeds by alias, case-insensitively, within a species', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/breeds/1?q=gsd');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ code: string }>;
    expect(items.map((b) => b.code)).toEqual(['GERMAN_SHEPHERD']);

    const upper = await request(app).get('/api/v1/common/breeds/1?q=LAB');
    expect((upper.body.data.items as Array<{ code: string }>).map((b) => b.code)).toEqual([
      'LABRADOR',
    ]);
  });

  it('fetches a single breed by id', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/breed/8');
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('PERSIAN');
  });

  it('fetches a single species by id', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/animal-types/2');
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('CAT');
  });

  it('returns 404 ANIMAL_TYPE_NOT_FOUND for an unknown or inactive species', async () => {
    const app = buildApp();
    const unknown = await request(app).get('/api/v1/common/breeds/999999');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('ANIMAL_TYPE_NOT_FOUND');

    const inactive = await request(app).get('/api/v1/common/animal-types/3');
    expect(inactive.status).toBe(404);
    expect(inactive.body.error.code).toBe('ANIMAL_TYPE_NOT_FOUND');
  });

  it('returns 404 ANIMAL_BREED_NOT_FOUND for an unknown or inactive breed', async () => {
    const app = buildApp();
    const unknown = await request(app).get('/api/v1/common/breed/999999');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('ANIMAL_BREED_NOT_FOUND');

    const inactive = await request(app).get('/api/v1/common/breed/7'); // DOG_RETIRED
    expect(inactive.status).toBe(404);
  });

  it('allows a normal authenticated mobile user (no admin role) to read species/breed selectors', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/common/animal-types')
      .set('Authorization', 'Bearer mobile-user');
    expect(res.status).toBe(200);
  });

  it('allows a guest (no token) to read species/breed selectors — reference data is public', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/breeds/1');
    expect(res.status).toBe(200);
  });

  it('sets a public cache-control header on reference-data reads', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/animal-types');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('bounds and paginates results deterministically', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/animal-types?page=1&pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(2);
  });
});

describe('cross-species breed validation (adoption/fundraising write-path guard)', () => {
  it('rejects a breed that belongs to a different species', async () => {
    const store = createAnimalTaxonomyStore(buildFakeDataSource());
    await expect(
      store.assertBreedBelongsToType(1 /* Labrador */, 2 /* Cat */),
    ).rejects.toMatchObject({
      code: 'SPECIES_MISMATCH',
    });
  });

  it('accepts a breed that belongs to the given species', async () => {
    const store = createAnimalTaxonomyStore(buildFakeDataSource());
    const breed = await store.assertBreedBelongsToType(1 /* Labrador */, 1 /* Dog */);
    expect(breed.code).toBe('LABRADOR');
  });

  it('rejects an unknown breed id', async () => {
    const store = createAnimalTaxonomyStore(buildFakeDataSource());
    await expect(store.assertBreedBelongsToType(999999, 1)).rejects.toMatchObject({
      code: 'BREED_NOT_FOUND',
    });
  });
});

describe('AnimalTaxonomyContractError', () => {
  it('carries the expected status codes', () => {
    expect(new AnimalTaxonomyContractError('TYPE_NOT_FOUND', 'x', 404).statusCode).toBe(404);
    expect(new AnimalTaxonomyContractError('SPECIES_MISMATCH', 'x', 422).statusCode).toBe(422);
  });
});
