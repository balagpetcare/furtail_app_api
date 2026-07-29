import { seedAnimalReferences } from '../prisma/seed/animals/animal-references';

/**
 * Minimal in-memory stand-in for the slice of PrismaClient the seed script
 * uses (upsert-by-unique-key + findMany({select})), so this test exercises
 * the REAL seed script/JSON data — no Postgres required — and verifies it
 * is safe to run repeatedly and that every breed's species reference
 * resolves.
 */
function createFakeModel(keyField: string, compositeKeyName?: string) {
  const rows = new Map<string, Record<string, unknown> & { id: number }>();
  let nextId = 1;
  return {
    async upsert({
      where,
      update,
      create,
    }: {
      where: Record<string, unknown>;
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) {
      const key = compositeKeyName
        ? JSON.stringify(where[compositeKeyName])
        : (where[keyField] as string);
      const existing = rows.get(key);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: nextId++, ...create };
      rows.set(key, row);
      return row;
    },
    async findMany({ select }: { select?: Record<string, true> } = {}) {
      return [...rows.values()].map((row) => {
        if (!select) return row;
        const picked: Record<string, unknown> = {};
        for (const key of Object.keys(select)) picked[key] = row[key];
        return picked;
      });
    },
    size: () => rows.size,
    all: () => [...rows.values()],
  };
}

function createFakePrisma() {
  return {
    animalCategory: createFakeModel('code'),
    animalType: createFakeModel('name'),
    animalSize: createFakeModel('code'),
    animalColor: createFakeModel('code'),
    coatPattern: createFakeModel('code'),
    breed: createFakeModel('', 'name_animalTypeId'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('seedAnimalReferences (real seed script + canonical JSON data)', () => {
  it('seeds the complete taxonomy with zero unresolved species references', async () => {
    const prisma = createFakePrisma();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await seedAnimalReferences(prisma);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(prisma.animalCategory.size()).toBe(6);
    expect(prisma.animalType.size()).toBe(12);
    expect(prisma.animalSize.size()).toBe(5);
    expect(prisma.animalColor.size()).toBe(8);
    expect(prisma.coatPattern.size()).toBe(7);
    expect(prisma.breed.size()).toBe(84);

    warnSpy.mockRestore();
  });

  it('is idempotent: running twice does not duplicate any record', async () => {
    const prisma = createFakePrisma();

    await seedAnimalReferences(prisma);
    const counts1 = {
      category: prisma.animalCategory.size(),
      type: prisma.animalType.size(),
      size: prisma.animalSize.size(),
      color: prisma.animalColor.size(),
      pattern: prisma.coatPattern.size(),
      breed: prisma.breed.size(),
    };

    await seedAnimalReferences(prisma);
    const counts2 = {
      category: prisma.animalCategory.size(),
      type: prisma.animalType.size(),
      size: prisma.animalSize.size(),
      color: prisma.animalColor.size(),
      pattern: prisma.coatPattern.size(),
      breed: prisma.breed.size(),
    };

    expect(counts2).toEqual(counts1);
  });

  it('covers every required companion-animal category with the four safe non-specific choices', async () => {
    const prisma = createFakePrisma();
    await seedAnimalReferences(prisma);

    const types: Array<{ id: number; code: string; name: string }> = prisma.animalType.all();
    const requiredCodes = [
      'DOG',
      'CAT',
      'BIRD',
      'RABBIT',
      'FISH',
      'REPTILE',
      'SMALL_MAMMAL',
      'FARM_ANIMAL',
      'OTHER',
    ];
    for (const code of requiredCodes) {
      const type = types.find((t) => t.code === code);
      expect(type).toBeDefined();

      const breeds: Array<Record<string, unknown>> = prisma.breed
        .all()
        .filter((b: Record<string, unknown>) => b.animalTypeId === type!.id);
      expect(breeds.some((b) => b.isLocal === true)).toBe(true);
      expect(breeds.some((b) => b.isMixed === true)).toBe(true);
      expect(breeds.some((b) => b.isUnknown === true)).toBe(true);
      expect(breeds.some((b) => b.isOther === true)).toBe(true);
      // Every category except the generic "Other" catch-all also has at
      // least one named, specific breed beyond the 4 safe choices.
      if (code !== 'OTHER') {
        expect(breeds.some((b) => !b.isMixed && !b.isOther && !b.isLocal && !b.isUnknown)).toBe(
          true,
        );
      }
    }
  });
});
