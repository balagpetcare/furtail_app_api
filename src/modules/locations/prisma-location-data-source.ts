import type { PrismaClient } from '@prisma/client';

import type {
  AreaFilter,
  AreaRecord,
  CountryRecord,
  LocationDataSource,
  LocationRecord,
} from './location-store';

type DbLocationRow = Pick<LocationRecord, 'id' | 'code' | 'nameEn' | 'nameBn'>;

const ORDER_BY = [{ nameEn: 'asc' as const }, { code: 'asc' as const }];

function withSortOrder(row: DbLocationRow, sortOrder = 0): LocationRecord {
  return { ...row, sortOrder };
}

export class PrismaLocationDataSource implements LocationDataSource {
  constructor(private readonly prisma: PrismaClient) {}

  async findCountryByIso2(iso2: string): Promise<CountryRecord | null> {
    return this.prisma.country.findFirst({ where: { iso2, isActive: true } });
  }

  async listCountries(): Promise<CountryRecord[]> {
    return this.prisma.country.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listDivisions(): Promise<LocationRecord[]> {
    const rows = await this.prisma.bdDivision.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
      orderBy: ORDER_BY,
    });
    return rows.map((row, index) => withSortOrder(row, index));
  }

  async getDivision(id: number): Promise<LocationRecord | null> {
    const row = await this.prisma.bdDivision.findFirst({
      where: { id, isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
    });
    return row ? withSortOrder(row) : null;
  }

  async listDistricts(divisionId: number): Promise<LocationRecord[]> {
    const rows = await this.prisma.bdDistrict.findMany({
      where: { divisionId, isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
      orderBy: ORDER_BY,
    });
    return rows.map((row, index) => withSortOrder(row, index));
  }

  async getDistrict(id: number): Promise<LocationRecord | null> {
    const row = await this.prisma.bdDistrict.findFirst({
      where: { id, isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
    });
    return row ? withSortOrder(row) : null;
  }

  async listUpazilas(districtId: number): Promise<LocationRecord[]> {
    const rows = await this.prisma.bdUpazila.findMany({
      where: { districtId, isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
      orderBy: ORDER_BY,
    });
    return rows.map((row, index) => withSortOrder(row, index));
  }

  async getUpazila(id: number): Promise<LocationRecord | null> {
    const row = await this.prisma.bdUpazila.findFirst({
      where: { id, isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
    });
    return row ? withSortOrder(row) : null;
  }

  async listUnions(upazilaId: number): Promise<LocationRecord[]> {
    const rows = await this.prisma.bdArea.findMany({
      where: { upazilaId, type: 'UNION', isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
      orderBy: ORDER_BY,
    });
    return rows.map((row, index) => withSortOrder(row, index));
  }

  async getUnion(id: number): Promise<LocationRecord | null> {
    const row = await this.prisma.bdArea.findFirst({
      where: { id, type: 'UNION', isActive: true },
      select: { id: true, code: true, nameEn: true, nameBn: true },
    });
    return row ? withSortOrder(row) : null;
  }

  async listAreas(filter: AreaFilter): Promise<AreaRecord[]> {
    const rows = await this.prisma.bdArea.findMany({
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameBn: true,
        reviewStatus: true,
        currentValidity: true,
        provenance: true,
        type: true,
        unionId: true,
        upazilaId: true,
        districtId: true,
        parentId: true,
      },
      where: {
        isActive: true,
        ...(filter.unionId !== undefined ? { unionId: filter.unionId } : {}),
        ...(filter.upazilaId !== undefined ? { upazilaId: filter.upazilaId } : {}),
        ...(filter.districtId !== undefined ? { districtId: filter.districtId } : {}),
        ...(filter.parentId !== undefined ? { parentId: filter.parentId } : {}),
        ...(filter.type !== undefined ? { type: filter.type } : {}),
      },
      orderBy: ORDER_BY,
    });
    return rows.map((row, index) => withSortOrder(row, index) as AreaRecord);
  }

  async getArea(id: number): Promise<AreaRecord | null> {
    const row = await this.prisma.bdArea.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameBn: true,
        reviewStatus: true,
        currentValidity: true,
        provenance: true,
        type: true,
        unionId: true,
        upazilaId: true,
        districtId: true,
        parentId: true,
      },
    });
    return row ? (withSortOrder(row) as AreaRecord) : null;
  }
}

export function createPrismaLocationDataSource(prisma: PrismaClient): LocationDataSource {
  return new PrismaLocationDataSource(prisma);
}
