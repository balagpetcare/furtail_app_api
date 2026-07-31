import { seedBdLocations } from '../prisma/seed/locations/bd-locations';

type FakeRow = Record<string, unknown> & {
  id: number;
  code?: string;
  isActive?: boolean;
  type?: string;
};

function matchesWhere(row: FakeRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(value)) {
      if (!value.every((clause) => matchesWhere(row, clause as Record<string, unknown>))) {
        return false;
      }
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      if (!value.some((clause) => matchesWhere(row, clause as Record<string, unknown>))) {
        return false;
      }
      continue;
    }

    if (key === 'NOT' && value && typeof value === 'object' && !Array.isArray(value)) {
      if (matchesWhere(row, value as Record<string, unknown>)) {
        return false;
      }
      continue;
    }

    const rowValue = row[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as { in?: unknown[] };
      if (nested.in && !nested.in.includes(rowValue)) {
        return false;
      }
      continue;
    }

    if (rowValue !== value) {
      return false;
    }
  }

  return true;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createFakeModel(keyField: string, initialRows: FakeRow[] = []) {
  const rows = new Map<string, FakeRow>();
  let nextId = 1;

  const addRow = (row: FakeRow) => {
    rows.set(String(row[keyField] ?? row.id), row);
    nextId = Math.max(nextId, row.id + 1);
  };

  for (const row of initialRows) {
    addRow(clone(row));
  }

  const findById = (id: number) => [...rows.values()].find((row) => row.id === id) ?? null;

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
      const key = String(where[keyField]);
      const existing = rows.get(key);
      if (existing) {
        Object.assign(existing, update);
        return clone(existing);
      }
      const row = { id: nextId++, [keyField]: key, ...create } as FakeRow;
      addRow(row);
      return clone(row);
    },
    async update({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) {
      const target =
        typeof where.id === 'number'
          ? findById(where.id)
          : rows.get(String(where[keyField] ?? where.code));
      if (!target) {
        throw new Error(`Missing row for update on ${keyField}`);
      }
      Object.assign(target, data);
      return clone(target);
    },
    async findFirst({ where }: { where?: Record<string, unknown> } = {}) {
      return clone((await this.findMany({ where }))[0] ?? null);
    },
    async findMany({
      where,
      select,
    }: {
      where?: Record<string, unknown>;
      select?: Record<string, true>;
    } = {}) {
      const matched = [...rows.values()].filter((row) => matchesWhere(row, where));
      return matched.map((row) => {
        if (!select) return clone(row);
        const picked: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          picked[key] = row[key];
        }
        return picked;
      });
    },
  };
}

function createFakePrisma(initialRows: Partial<Record<string, FakeRow[]>> = {}) {
  return {
    country: createFakeModel('iso2', initialRows.country ?? []),
    bdDivision: createFakeModel('code', initialRows.bdDivision ?? []),
    bdDistrict: createFakeModel('code', initialRows.bdDistrict ?? []),
    bdUpazila: createFakeModel('code', initialRows.bdUpazila ?? []),
    bdUnion: createFakeModel('code', initialRows.bdUnion ?? []),
    bdArea: createFakeModel('code', initialRows.bdArea ?? []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

async function activeRows(model: { findMany: () => Promise<FakeRow[]> }): Promise<FakeRow[]> {
  return (await model.findMany()).filter((row) => row.isActive !== false);
}

async function activeCount(model: { findMany: () => Promise<FakeRow[]> }): Promise<number> {
  return (await activeRows(model)).length;
}

function countTyped(rows: FakeRow[], type: string): number {
  return rows.filter((row) => row.type === type && row.isActive !== false).length;
}

describe('seedBdLocations (canonical BPA-aligned hierarchy)', () => {
  it('seeds the canonical counts and representative DNCC/DSCC paths', async () => {
    const prisma = createFakePrisma();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await seedBdLocations(prisma);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(await activeCount(prisma.country)).toBe(1);
    expect(await activeCount(prisma.bdDivision)).toBe(8);
    expect(await activeCount(prisma.bdDistrict)).toBe(64);
    expect(await activeCount(prisma.bdUpazila)).toBe(494);
    expect(await activeCount(prisma.bdUnion)).toBe(4540);

    const urbanRows = await activeRows(prisma.bdArea);
    expect(countTyped(urbanRows, 'CITY_CORPORATION')).toBe(12);
    expect(countTyped(urbanRows, 'CITY_ZONE')).toBe(17);
    expect(countTyped(urbanRows, 'WARD')).toBe(129);

    const dncc = urbanRows.find((row) => row.code === 'CC-DNCC');
    const dnccZone4 = urbanRows.find((row) => row.code === 'ZONE-DNCC-04');
    const dnccWard18 = urbanRows.find((row) => row.code === 'WARD-DNCC-18');
    expect(dncc).toBeDefined();
    expect(dncc?.type).toBe('CITY_CORPORATION');
    expect(dnccZone4?.parentId).toBe(dncc?.id);
    expect(dnccWard18?.parentId).toBe(dnccZone4?.id);

    const dscc = urbanRows.find((row) => row.code === 'CC-DSCC');
    const dsccZone2 = urbanRows.find((row) => row.code === 'ZONE-DSCC-02');
    const dsccWard25 = urbanRows.find((row) => row.code === 'WARD-DSCC-25');
    expect(dscc).toBeDefined();
    expect(dscc?.type).toBe('CITY_CORPORATION');
    expect(dsccZone2?.parentId).toBe(dscc?.id);
    expect(dsccWard25?.parentId).toBe(dsccZone2?.id);

    expect(urbanRows.some((row) => row.code === 'UPA-495')).toBe(false);
    expect(urbanRows.some((row) => row.code === 'AREA-AMINBAZAR-01')).toBe(false);

    warnSpy.mockRestore();
  });

  it('is idempotent and deactivates a preexisting legacy Shaistaganj upazila row', async () => {
    const prisma = createFakePrisma({
      bdUpazila: [
        {
          id: 999,
          code: 'UPA-495',
          nameEn: 'Shaistaganj',
          nameBn: 'শায়েস্তাগঞ্জ',
          districtId: 38,
          sortOrder: 495,
          isActive: true,
        },
      ],
    });

    await seedBdLocations(prisma);

    const firstUpazilas: FakeRow[] = await prisma.bdUpazila.findMany();
    const firstActiveUpazilas = firstUpazilas.filter((row: FakeRow) => row.isActive !== false);
    const legacyRow = firstUpazilas.find((row: FakeRow) => row.code === 'UPA-495');

    expect(firstActiveUpazilas).toHaveLength(494);
    expect(legacyRow?.isActive).toBe(false);

    const firstCounts = {
      countries: await activeCount(prisma.country),
      divisions: await activeCount(prisma.bdDivision),
      districts: await activeCount(prisma.bdDistrict),
      upazilas: firstActiveUpazilas.length,
      unions: await activeCount(prisma.bdUnion),
      cityCorporations: countTyped(await activeRows(prisma.bdArea), 'CITY_CORPORATION'),
      zones: countTyped(await activeRows(prisma.bdArea), 'CITY_ZONE'),
      wards: countTyped(await activeRows(prisma.bdArea), 'WARD'),
    };

    await seedBdLocations(prisma);

    const secondUpazilas: FakeRow[] = await prisma.bdUpazila.findMany();
    const secondActiveUpazilas = secondUpazilas.filter((row: FakeRow) => row.isActive !== false);
    const secondCounts = {
      countries: await activeCount(prisma.country),
      divisions: await activeCount(prisma.bdDivision),
      districts: await activeCount(prisma.bdDistrict),
      upazilas: secondActiveUpazilas.length,
      unions: await activeCount(prisma.bdUnion),
      cityCorporations: countTyped(await activeRows(prisma.bdArea), 'CITY_CORPORATION'),
      zones: countTyped(await activeRows(prisma.bdArea), 'CITY_ZONE'),
      wards: countTyped(await activeRows(prisma.bdArea), 'WARD'),
    };

    expect(secondCounts).toEqual(firstCounts);
    expect(secondUpazilas.find((row: FakeRow) => row.code === 'UPA-495')?.isActive).toBe(false);
  });
});
