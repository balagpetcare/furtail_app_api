/**
 * Canonical Bangladesh location system. Single source of truth for every
 * module that needs Country/Division/District/Upazila/Union/City
 * Corporation/Zone/Ward/Area data — adoption, fundraising, profiles,
 * lost-and-found, services, nearby search. Do not build a second location
 * hierarchy in any module; extend this one instead.
 *
 * `LocationStore` is transport-agnostic business logic (parent-existence
 * validation, search, bounded pagination) over an injectable
 * `LocationDataSource` — Prisma-backed in production, an in-memory fake in
 * tests, mirroring the identity-resolver injection pattern already used by
 * `SocialCoreStore`.
 */

export interface LocationRecord {
  id: number;
  code: string;
  nameEn: string;
  nameBn: string | null;
  sortOrder: number;
}

export interface AreaRecord extends LocationRecord {
  type: string;
  reviewStatus: string;
  currentValidity: string;
  provenance: unknown | null;
  unionId: number | null;
  upazilaId: number | null;
  districtId: number | null;
  parentId: number | null;
  isLegacy?: boolean;
  isCurrentSelectable?: boolean;
  reviewMessage?: string | null;
}

export interface CountryRecord {
  id: number;
  iso2: string;
  iso3: string | null;
  name: string;
  nameBn: string | null;
  sortOrder: number;
}

export interface AreaFilter {
  unionId?: number;
  upazilaId?: number;
  districtId?: number;
  parentId?: number | null;
  type?: string;
}

export interface BoundedQuery {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LocationDataSource {
  findCountryByIso2(iso2: string): Promise<CountryRecord | null>;
  listCountries(): Promise<CountryRecord[]>;

  listDivisions(): Promise<LocationRecord[]>;
  getDivision(id: number): Promise<LocationRecord | null>;

  listDistricts(divisionId: number): Promise<LocationRecord[]>;
  getDistrict(id: number): Promise<LocationRecord | null>;

  listUpazilas(districtId: number): Promise<LocationRecord[]>;
  getUpazila(id: number): Promise<LocationRecord | null>;

  listUnions(upazilaId: number): Promise<LocationRecord[]>;
  getUnion(id: number): Promise<LocationRecord | null>;

  listAreas(filter: AreaFilter): Promise<AreaRecord[]>;
  getArea(id: number): Promise<AreaRecord | null>;
}

export class LocationContractError extends Error {
  readonly code: 'COUNTRY_NOT_FOUND' | 'NOT_FOUND' | 'PARENT_INVALID';
  readonly statusCode: number;

  constructor(code: LocationContractError['code'], message: string, statusCode: number) {
    super(message);
    this.name = 'LocationContractError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function paginate<T>(items: T[], query: BoundedQuery): PagedResult<T> {
  const pageSize = Math.min(
    Math.max(Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Math.trunc(query.page ?? 1), 1);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

function matchesSearch(record: { nameEn: string; nameBn: string | null }, q?: string): boolean {
  if (!q || !q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    record.nameEn.toLowerCase().includes(needle) ||
    (record.nameBn ?? '').toLowerCase().includes(needle)
  );
}

function isSelectableCurrent(record: { currentValidity?: string }): boolean {
  return record.currentValidity === 'CURRENT_VERIFIED';
}

function isSelectableForNewSelection(
  record: { currentValidity?: string; parentId?: number | null },
  parent?: { currentValidity?: string; parentId?: number | null } | null,
): boolean {
  if (isSelectableCurrent(record)) return true;
  if (record.currentValidity !== 'PARTIAL_CURRENT') return false;
  if (record.parentId == null) return false;
  return parent ? isSelectableForNewSelection(parent) : false;
}

export class LocationStore {
  constructor(private readonly ds: LocationDataSource) {}

  async resolveCountryByIso2(iso2: string): Promise<CountryRecord> {
    const normalized = iso2.trim().toUpperCase();
    const country = await this.ds.findCountryByIso2(normalized);
    if (!country) {
      throw new LocationContractError('COUNTRY_NOT_FOUND', `Country not found: ${normalized}`, 404);
    }
    return country;
  }

  async listCountries(): Promise<CountryRecord[]> {
    return this.ds.listCountries();
  }

  async listDivisions(query: BoundedQuery = {}): Promise<PagedResult<LocationRecord>> {
    const rows = (await this.ds.listDivisions()).filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async listDistricts(
    divisionId: number,
    query: BoundedQuery = {},
  ): Promise<PagedResult<LocationRecord>> {
    if (!(await this.ds.getDivision(divisionId))) {
      throw new LocationContractError('PARENT_INVALID', `Unknown divisionId: ${divisionId}`, 404);
    }
    const rows = (await this.ds.listDistricts(divisionId)).filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async listUpazilas(
    districtId: number,
    query: BoundedQuery = {},
  ): Promise<PagedResult<LocationRecord>> {
    if (!(await this.ds.getDistrict(districtId))) {
      throw new LocationContractError('PARENT_INVALID', `Unknown districtId: ${districtId}`, 404);
    }
    const rows = (await this.ds.listUpazilas(districtId)).filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async listUnions(
    upazilaId: number,
    query: BoundedQuery = {},
  ): Promise<PagedResult<LocationRecord>> {
    if (!(await this.ds.getUpazila(upazilaId))) {
      throw new LocationContractError('PARENT_INVALID', `Unknown upazilaId: ${upazilaId}`, 404);
    }
    const rows = (await this.ds.listUnions(upazilaId)).filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  /** Generic area lookup — filter by any combination of unionId/upazilaId/districtId/parentId/type. */
  async listAreas(filter: AreaFilter, query: BoundedQuery = {}): Promise<PagedResult<AreaRecord>> {
    await this.assertAreaFilterParentsExist(filter);
    const rows = [];
    for (const row of await this.ds.listAreas(filter)) {
      const parent = row.parentId ? await this.ds.getArea(row.parentId) : null;
      if (isSelectableForNewSelection(row, parent)) {
        rows.push(row);
      }
    }
    const filtered = rows.filter((r) => matchesSearch(r, query.q));
    return paginate(filtered, query);
  }

  async listCityCorporations(
    districtId: number,
    query: BoundedQuery = {},
  ): Promise<PagedResult<AreaRecord>> {
    if (!(await this.ds.getDistrict(districtId))) {
      throw new LocationContractError('PARENT_INVALID', `Unknown districtId: ${districtId}`, 404);
    }
    const rows = (await this.ds.listAreas({ districtId, type: 'CITY_CORPORATION' }))
      .filter((r) => isSelectableCurrent(r))
      .filter((r) => r.parentId === null)
      .filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async listZones(
    cityCorporationId: number,
    query: BoundedQuery = {},
  ): Promise<PagedResult<AreaRecord>> {
    const parent = await this.ds.getArea(cityCorporationId);
    if (!parent) {
      throw new LocationContractError(
        'PARENT_INVALID',
        `Unknown cityCorporationId: ${cityCorporationId}`,
        404,
      );
    }
    const rows = (await this.ds.listAreas({ parentId: cityCorporationId, type: 'ZONE' }))
      .filter((r) => isSelectableForNewSelection(r, parent))
      .filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async listCcAreas(zoneId: number, query: BoundedQuery = {}): Promise<PagedResult<AreaRecord>> {
    const parent = await this.ds.getArea(zoneId);
    if (!parent) {
      throw new LocationContractError('PARENT_INVALID', `Unknown zoneId: ${zoneId}`, 404);
    }
    const rows = (await this.ds.listAreas({ parentId: zoneId }))
      .filter((r) => isSelectableForNewSelection(r, parent))
      .filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async getAreaById(id: number): Promise<AreaRecord | null> {
    const record = await this.ds.getArea(id);
    if (!record) return null;

    let parent = null;
    if (record.parentId) {
      parent = await this.ds.getArea(record.parentId);
    }

    const isCurrentSelectable = isSelectableForNewSelection(record, parent);
    const isLegacy = !isCurrentSelectable;
    let reviewMessage = null;

    if (isLegacy) {
      reviewMessage =
        'This location is historical and no longer valid for new records. Please update your selection.';
    }

    return {
      ...record,
      isLegacy,
      isCurrentSelectable,
      reviewMessage,
    };
  }

  /**
   * Validates that a partial Bangladesh location selection is internally
   * consistent (each provided child actually belongs to its provided parent).
   * Used by the create-listing forms to catch a stale selection
   * (e.g. district changed but union wasn't cleared) before submit.
   */
  async validateSelection(input: {
    divisionId?: number;
    districtId?: number;
    upazilaId?: number;
    unionId?: number;
    cityCorporationId?: number;
    zoneId?: number;
    wardId?: number;
  }): Promise<{ valid: boolean; reason?: string }> {
    if (input.divisionId !== undefined) {
      const division = await this.ds.getDivision(input.divisionId);
      if (!division) return { valid: false, reason: 'Unknown divisionId' };
    }

    if (input.districtId !== undefined) {
      const district = await this.ds.getDistrict(input.districtId);
      if (!district) return { valid: false, reason: 'Unknown districtId' };
      const divisionId = (district as unknown as { divisionId?: number }).divisionId;
      if (
        input.divisionId !== undefined &&
        divisionId !== undefined &&
        divisionId !== input.divisionId
      ) {
        return { valid: false, reason: 'districtId does not belong to divisionId' };
      }
    }

    const hasUrban =
      input.cityCorporationId !== undefined ||
      input.zoneId !== undefined ||
      input.wardId !== undefined;
    const hasRural = input.upazilaId !== undefined || input.unionId !== undefined;

    if (hasUrban && hasRural) {
      return { valid: false, reason: 'Cannot mix rural and urban location parameters' };
    }

    // Bangladesh locations are canonical only when they end at Ward
    // (urban) or Union (rural). The legacy area/locality leaf is retained
    // for historical reads, but it is not part of the write-time contract.
    if (hasRural) {
      if (input.upazilaId === undefined || input.unionId === undefined) {
        return {
          valid: false,
          reason: 'Rural locations require divisionId, districtId, upazilaId, and unionId',
        };
      }

      const upazila = await this.ds.getUpazila(input.upazilaId);
      if (!upazila) return { valid: false, reason: 'Unknown upazilaId' };
      const districtId = (upazila as unknown as { districtId?: number }).districtId;
      if (
        input.districtId !== undefined &&
        districtId !== undefined &&
        districtId !== input.districtId
      ) {
        return { valid: false, reason: 'upazilaId does not belong to districtId' };
      }

      const union = await this.ds.getUnion(input.unionId);
      if (!union) return { valid: false, reason: 'Unknown unionId' };
      const unionUpazilaId = (union as unknown as { upazilaId?: number }).upazilaId;
      if (
        input.upazilaId !== undefined &&
        unionUpazilaId !== undefined &&
        unionUpazilaId !== input.upazilaId
      ) {
        return { valid: false, reason: 'unionId does not belong to upazilaId' };
      }
    }

    // 2. Urban branch
    if (hasUrban) {
      if (
        input.cityCorporationId === undefined ||
        input.zoneId === undefined ||
        input.wardId === undefined
      ) {
        return {
          valid: false,
          reason:
            'Urban locations require divisionId, districtId, cityCorporationId, zoneId, and wardId',
        };
      }

      const cc = await this.ds.getArea(input.cityCorporationId);
      if (!cc || cc.type !== 'CITY_CORPORATION') {
        return { valid: false, reason: 'Unknown or invalid cityCorporationId' };
      }
      if (!isSelectableCurrent(cc)) {
        return { valid: false, reason: 'cityCorporationId is not selectable for new records' };
      }
      if (input.districtId !== undefined && cc.districtId !== input.districtId) {
        return { valid: false, reason: 'cityCorporationId does not belong to districtId' };
      }

      const zone = await this.ds.getArea(input.zoneId);
      if (!zone || zone.type !== 'ZONE') {
        return { valid: false, reason: 'Unknown or invalid zoneId' };
      }
      if (!isSelectableForNewSelection(zone, cc)) {
        return { valid: false, reason: 'zoneId is not selectable for new records' };
      }
      if (zone.parentId !== input.cityCorporationId) {
        return { valid: false, reason: 'zoneId does not belong to cityCorporationId' };
      }

      const ward = await this.ds.getArea(input.wardId);
      if (!ward || ward.type !== 'WARD') {
        return { valid: false, reason: 'Unknown or invalid wardId' };
      }
      if (!isSelectableForNewSelection(ward, zone)) {
        return { valid: false, reason: 'wardId is not selectable for new records' };
      }
      if (ward.parentId !== input.zoneId) {
        return { valid: false, reason: 'wardId does not belong to zoneId' };
      }
    }

    return { valid: true };
  }

  private async assertAreaFilterParentsExist(filter: AreaFilter): Promise<void> {
    if (filter.unionId !== undefined && !(await this.ds.getUnion(filter.unionId))) {
      throw new LocationContractError('PARENT_INVALID', `Unknown unionId: ${filter.unionId}`, 404);
    }
    if (filter.upazilaId !== undefined && !(await this.ds.getUpazila(filter.upazilaId))) {
      throw new LocationContractError(
        'PARENT_INVALID',
        `Unknown upazilaId: ${filter.upazilaId}`,
        404,
      );
    }
    if (filter.districtId !== undefined && !(await this.ds.getDistrict(filter.districtId))) {
      throw new LocationContractError(
        'PARENT_INVALID',
        `Unknown districtId: ${filter.districtId}`,
        404,
      );
    }
    if (
      filter.parentId !== undefined &&
      filter.parentId !== null &&
      !(await this.ds.getArea(filter.parentId))
    ) {
      throw new LocationContractError(
        'PARENT_INVALID',
        `Unknown parentId: ${filter.parentId}`,
        404,
      );
    }
  }
}

export function createLocationStore(ds: LocationDataSource): LocationStore {
  return new LocationStore(ds);
}
