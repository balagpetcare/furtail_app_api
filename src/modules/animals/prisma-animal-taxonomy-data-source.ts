import type { PrismaClient } from '@prisma/client';

import type {
  AnimalTaxonomyDataSource,
  AnimalTypeRecord,
  BreedRecord,
} from './animal-taxonomy-store';

const TYPE_ORDER_BY = [{ displayOrder: 'asc' as const }, { name: 'asc' as const }];
const BREED_ORDER_BY = [{ displayOrder: 'asc' as const }, { name: 'asc' as const }];

function toAliasNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export class PrismaAnimalTaxonomyDataSource implements AnimalTaxonomyDataSource {
  constructor(private readonly prisma: PrismaClient) {}

  async listTypes(): Promise<AnimalTypeRecord[]> {
    const rows = await this.prisma.animalType.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        categoryId: true,
        scientificName: true,
        icon: true,
        displayOrder: true,
      },
      orderBy: TYPE_ORDER_BY,
    });
    return rows.map((row) => ({ ...row, nameBn: null }));
  }

  async getType(id: number): Promise<AnimalTypeRecord | null> {
    const row = await this.prisma.animalType.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        categoryId: true,
        scientificName: true,
        icon: true,
        displayOrder: true,
      },
    });
    return row ? { ...row, nameBn: null } : null;
  }

  async listBreedsByType(animalTypeId: number): Promise<BreedRecord[]> {
    const rows = await this.prisma.breed.findMany({
      where: { animalTypeId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        animalTypeId: true,
        aliasNames: true,
        originCountry: true,
        defaultSizeId: true,
        isMixed: true,
        isOther: true,
        displayOrder: true,
      },
      orderBy: BREED_ORDER_BY,
    });
    return rows.map((row) => ({
      ...row,
      aliasNames: toAliasNames(row.aliasNames),
      nameBn: null,
      isLocal: false,
      isUnknown: false,
    }));
  }

  async getBreed(id: number): Promise<BreedRecord | null> {
    const row = await this.prisma.breed.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        animalTypeId: true,
        aliasNames: true,
        originCountry: true,
        defaultSizeId: true,
        isMixed: true,
        isOther: true,
        displayOrder: true,
      },
    });
    return row
      ? {
          ...row,
          aliasNames: toAliasNames(row.aliasNames),
          nameBn: null,
          isLocal: false,
          isUnknown: false,
        }
      : null;
  }
}

export function createPrismaAnimalTaxonomyDataSource(
  prisma: PrismaClient,
): AnimalTaxonomyDataSource {
  return new PrismaAnimalTaxonomyDataSource(prisma);
}
