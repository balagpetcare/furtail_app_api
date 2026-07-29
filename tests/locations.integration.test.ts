import request from 'supertest';

import { createAppWithDependencies } from '../src/app';
import { createLocationStore } from '../src/modules/locations/location-store';
import type {
  AreaFilter,
  AreaRecord,
  CountryRecord,
  LocationDataSource,
  LocationRecord,
} from '../src/modules/locations/location-store';
import type { AuthenticatedPrincipal, TokenVerifier } from '../src/security/principal';
import { AppError } from '../src/core/errors/app-error';

/**
 * Small, hand-built hierarchy exercising every branch the policy requires:
 * - a rural path (Division -> District -> Upazila -> Union -> Area)
 * - an urban path (District -> City Corporation -> Zone -> Ward -> Area)
 * - one inactive record at each of division/district/upazila level, to
 *   verify inactive rows are never returned
 * - deliberately out-of-alphabetical sortOrder, to verify ordering is by
 *   sortOrder, not insertion or name order
 */
function buildFakeDataSource(): LocationDataSource {
  const countries: (CountryRecord & { isActive: boolean })[] = [
    {
      id: 1,
      iso2: 'BD',
      iso3: 'BGD',
      name: 'Bangladesh',
      nameBn: 'বাংলাদেশ',
      sortOrder: 0,
      isActive: true,
    },
    { id: 2, iso2: 'IN', iso3: 'IND', name: 'India', nameBn: null, sortOrder: 1, isActive: true },
  ];

  const divisions: (LocationRecord & { isActive: boolean })[] = [
    { id: 1, code: 'DIV-DHK', nameEn: 'Dhaka', nameBn: 'ঢাকা', sortOrder: 2, isActive: true },
    {
      id: 2,
      code: 'DIV-CHT',
      nameEn: 'Chattogram',
      nameBn: 'চট্টগ্রাম',
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 3,
      code: 'DIV-OLD',
      nameEn: 'Deprecated Division',
      nameBn: null,
      sortOrder: 99,
      isActive: false,
    },
  ];

  const districts: (LocationRecord & { isActive: boolean; divisionId: number })[] = [
    {
      id: 1,
      code: 'DIS-DHK',
      nameEn: 'Dhaka',
      nameBn: 'ঢাকা',
      sortOrder: 1,
      isActive: true,
      divisionId: 1,
    },
    {
      id: 2,
      code: 'DIS-OLD',
      nameEn: 'Deprecated District',
      nameBn: null,
      sortOrder: 2,
      isActive: false,
      divisionId: 1,
    },
  ];

  const upazilas: (LocationRecord & { isActive: boolean; districtId: number })[] = [
    {
      id: 1,
      code: 'UPA-SAV',
      nameEn: 'Savar',
      nameBn: 'সাভার',
      sortOrder: 1,
      isActive: true,
      districtId: 1,
    },
    {
      id: 2,
      code: 'UPA-OLD',
      nameEn: 'Deprecated Upazila',
      nameBn: null,
      sortOrder: 2,
      isActive: false,
      districtId: 1,
    },
    {
      id: 3,
      code: 'UPA-NONE',
      nameEn: 'Empty Upazila',
      nameBn: null,
      sortOrder: 3,
      isActive: true,
      districtId: 1,
    },
  ];

  const unions: (LocationRecord & { isActive: boolean; upazilaId: number })[] = [
    {
      id: 1,
      code: 'UNI-AMI',
      nameEn: 'Aminbazar',
      nameBn: 'আমিনবাজার',
      sortOrder: 2,
      isActive: true,
      upazilaId: 1,
    },
    {
      id: 2,
      code: 'UNI-ASH',
      nameEn: 'Ashulia',
      nameBn: 'আশুলিয়া',
      sortOrder: 1,
      isActive: true,
      upazilaId: 1,
    },
  ];

  const areas: (AreaRecord & { isActive: boolean })[] = [
    // rural: area under a union
    {
      id: 1,
      code: 'AREA-AMI-01',
      nameEn: 'Aminbazar Bazar',
      nameBn: null,
      type: 'AREA',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: 1,
      upazilaId: null,
      districtId: null,
      parentId: null,
      sortOrder: 1,
      isActive: true,
    },
    // urban: city corporation anchored to the district, not a union/upazila
    {
      id: 2,
      code: 'CC-DNCC',
      nameEn: 'Dhaka North City Corporation',
      nameBn: null,
      type: 'CITY_CORPORATION',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: null,
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 3,
      code: 'ZONE-01',
      nameEn: 'Zone 1',
      nameBn: null,
      type: 'ZONE',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: 2,
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 4,
      code: 'WARD-01',
      nameEn: 'Ward 1',
      nameBn: null,
      type: 'WARD',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: 3,
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 5,
      code: 'AREA-WARD01-01',
      nameEn: 'Uttara Sector 1',
      nameBn: null,
      type: 'AREA',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: 4,
      sortOrder: 1,
      isActive: true,
    },
    // inactive area — must never be returned
    {
      id: 8,
      code: 'ZONE-DNCC-03',
      nameEn: 'DNCC Zone 3',
      nameBn: '???????? ??? ?',
      type: 'ZONE',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: 2,
      sortOrder: 3,
      isActive: true,
    },
    {
      id: 9,
      code: 'WARD-DNCC-18',
      nameEn: 'DNCC Ward 18',
      nameBn: '???????? ??????? ??',
      type: 'WARD',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: 8,
      sortOrder: 18,
      isActive: true,
    },
    {      id: 7,
      code: 'WARD-HIST-01',
      nameEn: 'Historic Ward',
      nameBn: null,
      type: 'WARD',
      reviewStatus: 'HISTORICAL_VERIFIED',
      currentValidity: 'HISTORICAL_VERIFIED',
      provenance: null,
      unionId: null,
      upazilaId: null,
      districtId: 1,
      parentId: 3,
      sortOrder: 2,
      isActive: true,
    },
    {
      id: 6,
      code: 'AREA-INACTIVE',
      nameEn: 'Retired Area',
      nameBn: null,
      type: 'AREA',
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: null,
      unionId: 1,
      upazilaId: null,
      districtId: null,
      parentId: null,
      sortOrder: 0,
      isActive: false,
    },
  ];

  const active = <T extends { isActive: boolean }>(rows: T[]) => rows.filter((r) => r.isActive);
  const bySort = <T extends { sortOrder: number; nameEn?: string; name?: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    async findCountryByIso2(iso2) {
      return active(countries).find((c) => c.iso2 === iso2) ?? null;
    },
    async listCountries() {
      return bySort(active(countries));
    },
    async listDivisions() {
      return bySort(active(divisions));
    },
    async getDivision(id) {
      return active(divisions).find((d) => d.id === id) ?? null;
    },
    async listDistricts(divisionId) {
      return bySort(active(districts).filter((d) => d.divisionId === divisionId));
    },
    async getDistrict(id) {
      return active(districts).find((d) => d.id === id) ?? null;
    },
    async listUpazilas(districtId) {
      return bySort(active(upazilas).filter((u) => u.districtId === districtId));
    },
    async getUpazila(id) {
      return active(upazilas).find((u) => u.id === id) ?? null;
    },
    async listUnions(upazilaId) {
      return bySort(active(unions).filter((u) => u.upazilaId === upazilaId));
    },
    async getUnion(id) {
      return active(unions).find((u) => u.id === id) ?? null;
    },
    async listAreas(filter: AreaFilter) {
      return bySort(
        active(areas).filter((a) => {
          if (filter.unionId !== undefined && a.unionId !== filter.unionId) return false;
          if (filter.upazilaId !== undefined && a.upazilaId !== filter.upazilaId) return false;
          if (filter.districtId !== undefined && a.districtId !== filter.districtId) return false;
          if (filter.parentId !== undefined && a.parentId !== filter.parentId) return false;
          if (filter.type !== undefined && a.type !== filter.type) return false;
          return true;
        }),
      );
    },
    async getArea(id) {
      return active(areas).find((a) => a.id === id) ?? null;
    },
  };
}

function buildApp() {
  const locationStore = createLocationStore(buildFakeDataSource());
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
  return createAppWithDependencies({ authVerifier: verifier, locationStore });
}

describe('canonical Bangladesh location endpoints', () => {
  it('resolves the country list and lets the client pick Bangladesh by ISO alpha-2, not display name', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/public/countries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const bd = (res.body.data as Array<{ iso2: string; name: string }>).find(
      (c) => c.iso2 === 'BD',
    );
    expect(bd).toBeDefined();
    expect(bd?.name).toBe('Bangladesh');
  });

  it('returns all active divisions, deterministically ordered by sortOrder, excluding inactive ones', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/divisions');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ code: string; id: number; parentId?: number }>;
    expect(items.map((d) => d.code)).toEqual(['DIV-CHT', 'DIV-DHK']); // sortOrder 1, 2 — not insertion/alpha order
    expect(items.every((d) => d.code !== 'DIV-OLD')).toBe(true);
    // required fields present
    for (const d of items) {
      expect(d).toHaveProperty('id');
      expect(d).toHaveProperty('code');
      expect(d).toHaveProperty('nameEn');
      expect(d).toHaveProperty('nameBn');
      expect(d).toHaveProperty('sortOrder');
    }
  });

  it('returns districts scoped to the given division', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/districts?divisionId=1');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ code: string }>;
    expect(items.map((d) => d.code)).toEqual(['DIS-DHK']);
  });

  it('returns upazilas/thanas scoped to the given district', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/upazilas?districtId=1');
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ code: string }>;
    expect(items.map((u) => u.code)).toEqual(['UPA-SAV', 'UPA-NONE']);
  });

  describe('GET /api/v1/common/bd/unions', () => {
    it('returns unions scoped to the given upazila, deterministically ordered by sortOrder, with no duplicates', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/common/bd/unions?upazilaId=1');
      expect(res.status).toBe(200);
      const items = res.body.data.items as Array<{ code: string; id: number }>;
      expect(items.map((u) => u.code)).toEqual(['UNI-ASH', 'UNI-AMI']); // sortOrder 1, 2
      // verify no duplicate IDs or codes
      const ids = items.map((u) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('returns a stable 200 empty collection for a valid upazila with no unions', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/common/bd/unions?upazilaId=3');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('returns a 404 error for an invalid upazilaId', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/common/bd/unions?upazilaId=999999');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('LOCATION_PARENT_INVALID');
    });
  });

  it('supports the rural union path: upazila -> union -> area', async () => {
    const app = buildApp();
    const unions = await request(app).get('/api/v1/location-master/unions?upazilaId=1');
    expect(unions.status).toBe(200);
    const unionItems = unions.body.data.items as Array<{ code: string; id: number }>;
    expect(unionItems.map((u) => u.code)).toEqual(['UNI-ASH', 'UNI-AMI']); // sortOrder 1, 2

    const areas = await request(app).get(`/api/v1/common/bd/areas?unionId=1`);
    expect(areas.status).toBe(200);
    const areaItems = areas.body.data.items as Array<{ code: string; unionId: number }>;
    expect(areaItems.map((a) => a.code)).toEqual(['AREA-AMI-01']);
    expect(areaItems[0]?.unionId).toBe(1);
  });

  it('allows a valid rural path even when no area records exist for the selected upazila', async () => {
    const app = buildApp();
    const validation = await request(app)
      .post('/api/v1/location-master/validate-selection')
      .send({ divisionId: 1, districtId: 1, upazilaId: 3 });
    expect(validation.status).toBe(200);
    expect(validation.body.data.valid).toBe(true);
  });

  it('supports the urban path: district -> city corporation -> zone -> ward -> area, never forced through a union', async () => {
    const app = buildApp();

    const cc = await request(app).get('/api/v1/common/bd/city-corporations?districtId=1');
    expect(cc.status).toBe(200);
    const ccItems = cc.body.data.items as Array<{
      code: string;
      id: number;
      unionId: number | null;
    }>;
    expect(ccItems.map((c) => c.code)).toEqual(['CC-DNCC']);
    expect(ccItems[0]?.unionId).toBeNull();

    const zones = await request(app).get(
      `/api/v1/common/bd/zones?cityCorporationId=${ccItems[0]!.id}`,
    );
    expect(zones.status).toBe(200);
    const zoneItems = zones.body.data.items as Array<{ code: string; id: number }>;
    expect(zoneItems.map((z) => z.code)).toEqual(['ZONE-01', 'ZONE-DNCC-03']);

    const wards = await request(app).get(`/api/v1/common/bd/cc-areas?zoneId=${zoneItems[0]!.id}`);
    expect(wards.status).toBe(200);
    const wardItems = wards.body.data.items as Array<{ code: string; id: number }>;
    expect(wardItems.map((w) => w.code)).toEqual(['WARD-01']);

    const leaf = await request(app).get(`/api/v1/common/bd/areas?parentId=${wardItems[0]!.id}`);
    expect(leaf.status).toBe(200);
    const leafItems = leaf.body.data.items as Array<{ code: string }>;
    expect(leafItems.map((a) => a.code)).toEqual(['AREA-WARD01-01']);
  });

  it('exposes the newly approved DNCC Zone 3 and Ward 18 through the current selector endpoints', async () => {
    const app = buildApp();

    const cc = await request(app).get('/api/v1/common/bd/city-corporations?districtId=1');
    expect(cc.status).toBe(200);
    const ccItem = (cc.body.data.items as Array<{ code: string; id: number }>).find(
      (item) => item.code === 'CC-DNCC',
    );
    expect(ccItem).toBeDefined();

    const zones = await request(app).get(
      `/api/v1/common/bd/zones?cityCorporationId=${ccItem!.id}`,
    );
    expect(zones.status).toBe(200);
    const zoneItems = zones.body.data.items as Array<{ code: string; id: number }>;
    expect(zoneItems.map((z) => z.code)).toEqual(['ZONE-01', 'ZONE-DNCC-03']);

    const zone3 = zoneItems.find((z) => z.code === 'ZONE-DNCC-03');
    expect(zone3).toBeDefined();

    const wards = await request(app).get(`/api/v1/common/bd/cc-areas?zoneId=${zone3!.id}`);
    expect(wards.status).toBe(200);
    const wardItems = wards.body.data.items as Array<{ code: string; id: number }>;
    expect(wardItems.map((w) => w.code)).toEqual(['WARD-DNCC-18']);

    const validation = await request(app)
      .post('/api/v1/location-master/validate-selection')
      .send({
        divisionId: 1,
        districtId: 1,
        cityCorporationId: ccItem!.id,
        zoneId: zone3!.id,
        wardId: wardItems[0]!.id,
      });
    expect(validation.status).toBe(200);
    expect(validation.body.data.valid).toBe(true);
  });

  it('hides historical descendants from new selection but still resolves them by id', async () => {
    const app = buildApp();

    const wards = await request(app).get('/api/v1/common/bd/cc-areas?zoneId=3');
    expect(wards.status).toBe(200);
    expect((wards.body.data.items as Array<{ code: string }>).map((w) => w.code)).toEqual([
      'WARD-01',
    ]);

    const legacy = await request(app).get('/api/v1/common/bd/areas/7');
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.code).toBe('WARD-HIST-01');
    expect(legacy.body.data.reviewStatus).toBe('HISTORICAL_VERIFIED');
    expect(legacy.body.data.currentValidity).toBe('HISTORICAL_VERIFIED');
  });

  it('rejects historical urban ids when validating a new location selection', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/location-master/validate-selection')
      .send({ cityCorporationId: 2, zoneId: 3, wardId: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(String(res.body.data.reason)).toContain('not selectable for new records');
  });

  it('returns 404 LOCATION_PARENT_INVALID for an unknown parent id', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/districts?divisionId=999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOCATION_PARENT_INVALID');
  });

  it('never returns inactive divisions/districts/upazilas/areas', async () => {
    const app = buildApp();

    const divisions = await request(app).get('/api/v1/common/bd/divisions');
    expect(
      (divisions.body.data.items as Array<{ code: string }>).some((d) => d.code === 'DIV-OLD'),
    ).toBe(false);

    // an inactive parent (division 3 / DIV-OLD) is itself treated as an unknown parent
    const districtsOfInactiveDivision = await request(app).get(
      '/api/v1/common/bd/districts?divisionId=3',
    );
    expect(districtsOfInactiveDivision.status).toBe(404);

    const inactiveDistrict = await request(app).get('/api/v1/common/bd/upazilas?districtId=2');
    expect(inactiveDistrict.status).toBe(404); // DIS-OLD (id=2) is inactive -> treated as unknown parent

    const areasUnderUnion = await request(app).get('/api/v1/common/bd/areas?unionId=1');
    expect(
      (areasUnderUnion.body.data.items as Array<{ code: string }>).some(
        (a) => a.code === 'AREA-INACTIVE',
      ),
    ).toBe(false);
  });

  it('allows a normal authenticated mobile user (no admin role) to read location selectors', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/common/bd/divisions')
      .set('Authorization', 'Bearer mobile-user');
    expect(res.status).toBe(200);
  });

  it('allows a guest (no token at all) to read location selectors — reference data is public', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/divisions');
    expect(res.status).toBe(200);
  });

  it('sets a public cache-control header on reference-data reads', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/divisions');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('bounds and paginates results deterministically', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/common/bd/divisions?page=1&pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(1);
  });

  it('validates a selection chain via location-master/validate-selection', async () => {
    const app = buildApp();
    const ok = await request(app)
      .post('/api/v1/location-master/validate-selection')
      .send({ divisionId: 1, districtId: 1, upazilaId: 1, unionId: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.valid).toBe(true);

    const mismatched = await request(app)
      .post('/api/v1/location-master/validate-selection')
      .send({ divisionId: 2, districtId: 1 }); // district 1 belongs to division 1, not 2
    expect(mismatched.status).toBe(200);
    expect(mismatched.body.data.valid).toBe(false);
  });

  describe('Urban and Rural Location Master API Validation', () => {
    it('validates a correct urban chain and rejects mismatched urban/rural branches', async () => {
      const app = buildApp();

      // Valid urban: District 1 (Dhaka), CC 2 (DNCC), Zone 3 (Zone 1), Ward 4 (Ward 1), Area 5 (Uttara Sector 1)
      const okUrban = await request(app)
        .post('/api/v1/location-master/validate-selection')
        .send({ divisionId: 1, districtId: 1, cityCorporationId: 2, zoneId: 3, wardId: 4, areaId: 5 });
      expect(okUrban.status).toBe(200);
      expect(okUrban.body.data.valid).toBe(true);

      // Incompatible mix: upazilaId (rural) and cityCorporationId (urban)
      const mixed = await request(app)
        .post('/api/v1/location-master/validate-selection')
        .send({ divisionId: 1, districtId: 1, upazilaId: 1, cityCorporationId: 2 });
      expect(mixed.status).toBe(200);
      expect(mixed.body.data.valid).toBe(false);

      // Wrong parent: zoneId 3 (Zone 1 under CC 2) with CC 99 (invalid)
      const wrongZoneParent = await request(app)
        .post('/api/v1/location-master/validate-selection')
        .send({ divisionId: 1, districtId: 1, cityCorporationId: 99, zoneId: 3 });
      expect(wrongZoneParent.status).toBe(200);
      expect(wrongZoneParent.body.data.valid).toBe(false);
    });

    it('exposes location-master endpoints for urban entities correctly', async () => {
      const app = buildApp();

      // Master City Corporations
      const cc = await request(app).get('/api/v1/location-master/city-corporations?districtId=1');
      expect(cc.status).toBe(200);
      expect(cc.body.data.items[0].code).toBe('CC-DNCC');

      // Master Zones
      const zones = await request(app).get('/api/v1/location-master/zones?cityCorporationId=2');
      expect(zones.status).toBe(200);
      expect(zones.body.data.items[0].code).toBe('ZONE-01');

      // Master Wards
      const wards = await request(app).get('/api/v1/location-master/wards?zoneId=3');
      expect(wards.status).toBe(200);
      expect(wards.body.data.items[0].code).toBe('WARD-01');

      // Master Areas
      const areas = await request(app).get('/api/v1/location-master/areas?parentId=4');
      expect(areas.status).toBe(200);
      expect(areas.body.data.items[0].code).toBe('AREA-WARD01-01');
    });
  });
});

