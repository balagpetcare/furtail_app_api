import { seedBdLocations } from '../prisma/seed/locations/bd-locations';

/**
 * Minimal in-memory stand-in for the slice of PrismaClient the seed script
 * uses (upsert-by-unique-key + findMany({select})), so this test exercises
 * the REAL seed script/JSON data against a fake "database" — no Postgres
 * required — and verifies it is safe to run repeatedly (idempotent) and
 * that every parent reference in the canonical JSON data actually resolves.
 */
function createFakeModel(keyField: string) {
  const rows = new Map<string, Record<string, unknown> & { id: number }>();
  let nextId = 1;
  return {
    async upsert({
      where,
      update,
      create,
    }: {
      where: Record<string, string>;
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) {
      const key = where[keyField]!;
      const existing = rows.get(key);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: nextId++, [keyField]: key, ...create };
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
  };
}

function createFakePrisma() {
  return {
    country: createFakeModel('iso2'),
    bdDivision: createFakeModel('code'),
    bdDistrict: createFakeModel('code'),
    bdUpazila: createFakeModel('code'),
    bdUnion: createFakeModel('code'),
    bdArea: createFakeModel('code'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('seedBdLocations (real seed script + canonical JSON data)', () => {
  it('seeds the complete hierarchy with zero unresolved parent references', async () => {
    const prisma = createFakePrisma();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await seedBdLocations(prisma);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(prisma.country.size()).toBe(1);
    expect(prisma.bdDivision.size()).toBe(8);
    expect(prisma.bdDistrict.size()).toBe(64);
    expect(prisma.bdUpazila.size()).toBe(495);
    expect(prisma.bdUnion.size()).toBe(4540);
    expect(prisma.bdArea.size()).toBe(74);

    const areas = (await prisma.bdArea.findMany()) as Array<Record<string, unknown>>;
    const cc = areas.find((a) => a.code === 'CC-DNCC');
    const zone3 = areas.find((a) => a.code === 'ZONE-DNCC-03');
    const ward18 = areas.find((a) => a.code === 'WARD-DNCC-18');

    expect(cc).toBeDefined();
    expect(zone3).toBeDefined();
    expect(ward18).toBeDefined();
    expect(zone3?.parentId).toBe(cc?.id);
    expect(zone3?.reviewStatus).toBe('CURRENT_VERIFIED');
    expect(zone3?.currentValidity).toBe('CURRENT_VERIFIED');
    expect(ward18?.parentId).toBe(zone3?.id);
    expect(ward18?.reviewStatus).toBe('CURRENT_VERIFIED');
    expect(ward18?.currentValidity).toBe('CURRENT_VERIFIED');

    warnSpy.mockRestore();
  });

  it('is idempotent: running twice does not duplicate any record', async () => {
    const prisma = createFakePrisma();

    await seedBdLocations(prisma);
    const counts1 = {
      country: prisma.country.size(),
      division: prisma.bdDivision.size(),
      district: prisma.bdDistrict.size(),
      upazila: prisma.bdUpazila.size(),
      union: prisma.bdUnion.size(),
      area: prisma.bdArea.size(),
    };

    await seedBdLocations(prisma);
    const counts2 = {
      country: prisma.country.size(),
      division: prisma.bdDivision.size(),
      district: prisma.bdDistrict.size(),
      upazila: prisma.bdUpazila.size(),
      union: prisma.bdUnion.size(),
      area: prisma.bdArea.size(),
    };

    expect(counts2).toEqual(counts1);
  });

  it('resolves Bangladesh by ISO alpha-2 code, not display name', async () => {
    const prisma = createFakePrisma();
    await seedBdLocations(prisma);
    const rows = await prisma.country.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].iso2).toBe('BD');
    expect(rows[0].name).toBe('Bangladesh');
  });

  it('seeds a real urban City Corporation -> Zone -> Ward -> Area chain anchored to a district, not a union', async () => {
    const prisma = createFakePrisma();
    await seedBdLocations(prisma);
    const areas: Array<Record<string, unknown>> = await prisma.bdArea.findMany();
    const cc = areas.find((a) => a.code === 'CC-DNCC');
    expect(cc).toBeDefined();
    expect(cc?.type).toBe('CITY_CORPORATION');
    expect(cc?.unionId).toBeNull();
    expect(cc?.districtId).not.toBeNull();

    const zone = areas.find((a) => a.code === 'ZONE-DNCC-01');
    expect(zone?.parentId).toBe(cc?.id);

    const ward = areas.find((a) => a.code === 'WARD-DNCC-01');
    expect(ward?.parentId).toBe(zone?.id);
  });
});
