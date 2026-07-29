import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';

/**
 * Canonical animal taxonomy seed — Category -> Type/Species -> Breed. Single
 * source of truth for every module that needs animal reference data
 * (adoption, lost-and-found, fundraising beneficiary type, etc.). Idempotent:
 * every row is upserted by its unique key (`code` for category/type/size/
 * color/pattern, `[name, animalTypeId]` for breed), so re-running never
 * duplicates records and existing ids are preserved across runs.
 *
 * Data sources (prisma/seeds/data/):
 * - animal-categories.json — top-level grouping (Mammals, Birds, ...)
 * - animal-types.json      — the species/type selector Flutter shows
 *   (Dog, Cat, Bird, Rabbit, Fish, Reptile, Small Mammal, Farm/Large
 *   Animal, Other, plus a few finer-grained legacy types), by categoryCode
 * - animal-sizes.json / animal-colors.json / coat-patterns.json — flat
 *   reference lists, no parent
 * - breeds.json — breed catalog, by animalTypeCode (+ optional
 *   defaultSizeCode). Every species includes the four safe non-specific
 *   choices (isLocal, isMixed, isUnknown, isOther).
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'seeds', 'data');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
}

interface CategoryRow {
  code: string;
  name: string;
  nameBn?: string;
  displayOrder?: number;
  isActive?: boolean;
}

interface TypeRow {
  name: string;
  nameBn?: string;
  categoryCode?: string;
  code: string;
  scientificName?: string | null;
  icon?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

interface SizeRow {
  code: string;
  name: string;
  minWeightKg?: number | null;
  maxWeightKg?: number | null;
  displayOrder?: number;
  isActive?: boolean;
}

interface ColorRow {
  code: string;
  name: string;
  hexPreview?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

interface PatternRow {
  code: string;
  name: string;
  displayOrder?: number;
  isActive?: boolean;
}

interface BreedRow {
  name: string;
  nameBn?: string;
  animalTypeCode: string;
  code?: string;
  aliasNames?: string[];
  originCountry?: string | null;
  defaultSizeCode?: string;
  isMixed?: boolean;
  isOther?: boolean;
  isLocal?: boolean;
  isUnknown?: boolean;
  displayOrder?: number;
  isActive?: boolean;
}

async function idMapByCode(model: {
  findMany: (args: {
    select: { id: true; code: true };
  }) => Promise<Array<{ id: number; code: string | null }>>;
}): Promise<Map<string, number>> {
  const rows = await model.findMany({ select: { id: true, code: true } });
  return new Map(
    rows
      .filter((r): r is { id: number; code: string } => r.code !== null)
      .map((r) => [r.code, r.id]),
  );
}

export async function seedAnimalReferences(prisma: PrismaClient): Promise<void> {
  console.log('Seeding animal taxonomy reference data...');

  // --- Categories ------------------------------------------------------
  const categories = readJson<CategoryRow[]>('animal-categories.json');
  for (let i = 0; i < categories.length; i += 1) {
    const c = categories[i]!;
    await prisma.animalCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, displayOrder: c.displayOrder ?? i, isActive: c.isActive ?? true },
      create: {
        code: c.code,
        name: c.name,
        displayOrder: c.displayOrder ?? i,
        isActive: c.isActive ?? true,
      },
      select: { id: true },
    });
  }
  const categoryIdByCode = await idMapByCode(prisma.animalCategory);
  console.log(`  Categories: ${categories.length} upserted`);

  // --- Types / species ---------------------------------------------------
  const types = readJson<TypeRow[]>('animal-types.json');
  let typesSkipped = 0;
  for (let i = 0; i < types.length; i += 1) {
    const t = types[i]!;
    const categoryId = t.categoryCode ? categoryIdByCode.get(t.categoryCode) : undefined;
    if (t.categoryCode && !categoryId) {
      console.warn(
        `  ! ${t.code}: unknown categoryCode ${t.categoryCode} (seeding with no category)`,
      );
      typesSkipped += 1;
    }
    await prisma.animalType.upsert({
      where: { name: t.name },
      update: {
        code: t.code,
        categoryId: categoryId ?? null,
        scientificName: t.scientificName ?? null,
        icon: t.icon ?? null,
        displayOrder: t.displayOrder ?? i,
        isActive: t.isActive ?? true,
      },
      create: {
        name: t.name,
        code: t.code,
        categoryId: categoryId ?? null,
        scientificName: t.scientificName ?? null,
        icon: t.icon ?? null,
        displayOrder: t.displayOrder ?? i,
        isActive: t.isActive ?? true,
      },
      select: { id: true },
    });
  }
  const typeIdByCode = await idMapByCode(prisma.animalType);
  console.log(
    `  Types: ${types.length} upserted${typesSkipped ? `, ${typesSkipped} with an unresolved category` : ''}`,
  );

  // --- Sizes ---------------------------------------------------------------
  const sizes = readJson<SizeRow[]>('animal-sizes.json');
  for (let i = 0; i < sizes.length; i += 1) {
    const s = sizes[i]!;
    await prisma.animalSize.upsert({
      where: { code: s.code },
      update: {
        name: s.name,
        minWeightKg: s.minWeightKg ?? null,
        maxWeightKg: s.maxWeightKg ?? null,
        displayOrder: s.displayOrder ?? i,
        isActive: s.isActive ?? true,
      },
      create: {
        code: s.code,
        name: s.name,
        minWeightKg: s.minWeightKg ?? null,
        maxWeightKg: s.maxWeightKg ?? null,
        displayOrder: s.displayOrder ?? i,
        isActive: s.isActive ?? true,
      },
    });
  }
  const sizeIdByCode = await idMapByCode(prisma.animalSize);
  console.log(`  Sizes: ${sizes.length} upserted`);

  // --- Colors ----------------------------------------------------------
  const colors = readJson<ColorRow[]>('animal-colors.json');
  for (let i = 0; i < colors.length; i += 1) {
    const c = colors[i]!;
    await prisma.animalColor.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        hexPreview: c.hexPreview ?? null,
        displayOrder: c.displayOrder ?? i,
        isActive: c.isActive ?? true,
      },
      create: {
        code: c.code,
        name: c.name,
        hexPreview: c.hexPreview ?? null,
        displayOrder: c.displayOrder ?? i,
        isActive: c.isActive ?? true,
      },
    });
  }
  console.log(`  Colors: ${colors.length} upserted`);

  // --- Coat patterns -----------------------------------------------------
  const patterns = readJson<PatternRow[]>('coat-patterns.json');
  for (let i = 0; i < patterns.length; i += 1) {
    const p = patterns[i]!;
    await prisma.coatPattern.upsert({
      where: { code: p.code },
      update: { name: p.name, displayOrder: p.displayOrder ?? i, isActive: p.isActive ?? true },
      create: {
        code: p.code,
        name: p.name,
        displayOrder: p.displayOrder ?? i,
        isActive: p.isActive ?? true,
      },
    });
  }
  console.log(`  Coat patterns: ${patterns.length} upserted`);

  // --- Breeds ------------------------------------------------------------
  const breeds = readJson<BreedRow[]>('breeds.json');
  let breedsSeeded = 0;
  let breedsSkipped = 0;
  for (let i = 0; i < breeds.length; i += 1) {
    const b = breeds[i]!;
    const animalTypeId = typeIdByCode.get(b.animalTypeCode);
    if (!animalTypeId) {
      console.warn(`  ! Skipping breed ${b.name}: unknown animalTypeCode ${b.animalTypeCode}`);
      breedsSkipped += 1;
      continue;
    }
    const defaultSizeId = b.defaultSizeCode ? sizeIdByCode.get(b.defaultSizeCode) : undefined;
    if (b.defaultSizeCode && !defaultSizeId) {
      console.warn(
        `  ! Breed ${b.name}: unknown defaultSizeCode ${b.defaultSizeCode} (seeding with no size)`,
      );
    }
    const shared = {
      nameBn: b.nameBn ?? null,
      code: b.code ?? null,
      aliasNames: b.aliasNames ?? [],
      originCountry: b.originCountry ?? null,
      defaultSizeId: defaultSizeId ?? null,
      isMixed: b.isMixed ?? false,
      isOther: b.isOther ?? false,
      isLocal: b.isLocal ?? false,
      isUnknown: b.isUnknown ?? false,
      displayOrder: b.displayOrder ?? i,
      isActive: b.isActive ?? true,
    };
    await prisma.breed.upsert({
      where: { name_animalTypeId: { name: b.name, animalTypeId } },
      update: shared,
      create: { name: b.name, animalTypeId, ...shared },
      select: { id: true },
    });
    breedsSeeded += 1;
  }
  console.log(
    `  Breeds: ${breedsSeeded} upserted${breedsSkipped ? `, ${breedsSkipped} skipped (unresolved species)` : ''}`,
  );

  console.log('Animal taxonomy reference data seeded.');
}
