import * as fs from 'fs';
import * as path from 'path';
import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Canonical Bangladesh location hierarchy seed — the single source of truth
 * for every module (adoption, fundraising, profiles, lost-and-found,
 * services, nearby search). Idempotent: every row is upserted by its unique
 * `code` (or `iso2` for Country), so re-running never duplicates records and
 * safely picks up name/order corrections.
 *
 * Data sources (prisma/seeds/data/):
 * - bd.country.json      — Country (ISO alpha-2 "BD")
 * - bd.divisions.json    — 8 divisions (complete, official)
 * - bd.districts.json    — 64 districts (complete, official), by divisionCode
 * - bd.upazilas.json     — 495 upazilas/thanas (complete, official), by districtCode
 * - bd.areas.json        — union-level rows (type "UNION"), by upazilaCode.
 *   NOTE: despite the filename, every row in this file is a union (the
 *   dataset predates the dedicated BdUnion table); it is seeded into
 *   `BdUnion`, not `BdArea`.
 * - bd.wards-and-cc.json — the Dhaka urban branch plus a small carry-forward
 *   set of locality rows. It intentionally mixes current DNCC records,
 *   historical DSCC records, and a few legacy-compatible rural leaf rows.
 *   Treat this file as a reviewed, partially current urban dataset, not a
 *   complete current Dhaka hierarchy.
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'seeds', 'data');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
}

interface CountryRow {
  iso2: string;
  iso3?: string;
  name: string;
  nameBn?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface DivisionRow {
  code: string;
  nameEn: string;
  nameBn?: string;
}

interface DistrictRow {
  code: string;
  divisionCode: string;
  nameEn: string;
  nameBn?: string;
}

interface UpazilaRow {
  code: string;
  districtCode: string;
  nameEn: string;
  nameBn?: string;
}

interface UnionSourceRow {
  code: string;
  upazilaCode: string;
  nameEn: string;
  nameBn?: string;
  type: string;
}

interface WardOrCcRow {
  code: string;
  nameEn: string;
  nameBn?: string;
  type: string;
  unionCode?: string;
  districtCode?: string;
  parentCode?: string;
  sortOrder?: number;
}

interface UrbanProvenanceRecord {
  code: string;
  reviewStatus: string;
  currentValidity: string;
  sourceDocument: string;
  sourcePublicationDate: string;
  sourcePage: string;
}

interface UrbanProvenanceManifest {
  records: UrbanProvenanceRecord[];
}

function readRootJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', relativePath), 'utf-8')) as T;
}

export async function seedBdLocations(prisma: PrismaClient): Promise<void> {
  console.log('Seeding Bangladesh location reference data...');
  const urbanProvenance = new Map(
    readRootJson<UrbanProvenanceManifest>('migration-reports/dhaka-urban-provenance-audit.json').records.map(
      (row) => [row.code, row],
    ),
  );

  // --- Country -------------------------------------------------------------
  const countries = readJson<CountryRow[]>('bd.country.json');
  for (const c of countries) {
    await prisma.country.upsert({
      where: { iso2: c.iso2 },
      update: {
        iso3: c.iso3 ?? null,
        name: c.name,
        nameBn: c.nameBn ?? null,
        sortOrder: c.sortOrder ?? 0,
        isActive: c.isActive ?? true,
      },
      create: {
        iso2: c.iso2,
        iso3: c.iso3 ?? null,
        name: c.name,
        nameBn: c.nameBn ?? null,
        sortOrder: c.sortOrder ?? 0,
        isActive: c.isActive ?? true,
      },
    });
  }
  console.log(`  Country: ${countries.length} upserted`);

  // --- Divisions -------------------------------------------------------------
  const divisions = readJson<DivisionRow[]>('bd.divisions.json');
  for (let i = 0; i < divisions.length; i += 1) {
    const d = divisions[i]!;
    await prisma.bdDivision.upsert({
      where: { code: d.code },
      update: { nameEn: d.nameEn, nameBn: d.nameBn ?? null },
      create: { code: d.code, nameEn: d.nameEn, nameBn: d.nameBn ?? null },
      select: { id: true },
    });
  }
  const divisionIdByCode = await idMapByCode(prisma.bdDivision);
  console.log(`  Divisions: ${divisions.length} upserted`);

  // --- Districts -------------------------------------------------------------
  const districts = readJson<DistrictRow[]>('bd.districts.json');
  let districtsSeeded = 0;
  let districtsSkipped = 0;
  for (let i = 0; i < districts.length; i += 1) {
    const d = districts[i]!;
    const divisionId = divisionIdByCode.get(d.divisionCode);
    if (!divisionId) {
      console.warn(`  ! Skipping district ${d.code}: unknown divisionCode ${d.divisionCode}`);
      districtsSkipped += 1;
      continue;
    }
    await prisma.bdDistrict.upsert({
      where: { code: d.code },
      update: { nameEn: d.nameEn, nameBn: d.nameBn ?? null, divisionId },
      create: { code: d.code, nameEn: d.nameEn, nameBn: d.nameBn ?? null, divisionId },
      select: { id: true },
    });
    districtsSeeded += 1;
  }
  const districtIdByCode = await idMapByCode(prisma.bdDistrict);
  console.log(
    `  Districts: ${districtsSeeded} upserted${districtsSkipped ? `, ${districtsSkipped} skipped (unresolved parent)` : ''}`,
  );

  // --- Upazilas -------------------------------------------------------------
  const upazilas = readJson<UpazilaRow[]>('bd.upazilas.json');
  let upazilasSeeded = 0;
  let upazilasSkipped = 0;
  for (let i = 0; i < upazilas.length; i += 1) {
    const u = upazilas[i]!;
    const districtId = districtIdByCode.get(u.districtCode);
    if (!districtId) {
      console.warn(`  ! Skipping upazila ${u.code}: unknown districtCode ${u.districtCode}`);
      upazilasSkipped += 1;
      continue;
    }
    await prisma.bdUpazila.upsert({
      where: { code: u.code },
      update: { nameEn: u.nameEn, nameBn: u.nameBn ?? null, districtId },
      create: { code: u.code, nameEn: u.nameEn, nameBn: u.nameBn ?? null, districtId },
      select: { id: true },
    });
    upazilasSeeded += 1;
  }
  const upazilaIdByCode = await idMapByCode(prisma.bdUpazila);
  console.log(
    `  Upazilas: ${upazilasSeeded} upserted${upazilasSkipped ? `, ${upazilasSkipped} skipped (unresolved parent)` : ''}`,
  );

  // --- Unions (sourced from bd.areas.json's UNION-typed rows) --------------
  const unionRows = readJson<UnionSourceRow[]>('bd.areas.json').filter((r) => r.type === 'UNION');
  let unionsSeeded = 0;
  let unionsSkipped = 0;
  for (let i = 0; i < unionRows.length; i += 1) {
    const u = unionRows[i]!;
    const upazilaId = upazilaIdByCode.get(u.upazilaCode);
    if (!upazilaId) {
      console.warn(`  ! Skipping union ${u.code}: unknown upazilaCode ${u.upazilaCode}`);
      unionsSkipped += 1;
      continue;
    }
    await prisma.bdUnion.upsert({
      where: { code: u.code },
      update: { nameEn: u.nameEn, nameBn: u.nameBn ?? null, upazilaId },
      create: { code: u.code, nameEn: u.nameEn, nameBn: u.nameBn ?? null, upazilaId },
      select: { id: true },
    });
    unionsSeeded += 1;
  }
  const unionIdByCode = await idMapByCode(prisma.bdUnion);
  console.log(
    `  Unions: ${unionsSeeded} upserted${unionsSkipped ? `, ${unionsSkipped} skipped (unresolved parent)` : ''}`,
  );

  // --- Areas: current DNCC rows, historical DSCC rows, and a small
  // carry-forward set of rural/locality rows. Processed in file order —
  // parents (city corporations, then zones, then wards) must precede their
  // children so `parentCode` resolves on first pass.
  const wardRows = readJson<WardOrCcRow[]>('bd.wards-and-cc.json');
  const areaIdByCode = new Map<string, number>();
  let areasSeeded = 0;
  let areasSkipped = 0;
  for (let i = 0; i < wardRows.length; i += 1) {
    const a = wardRows[i]!;
    const unionId = a.unionCode ? unionIdByCode.get(a.unionCode) : undefined;
    const districtId = a.districtCode ? districtIdByCode.get(a.districtCode) : undefined;
    const parentId = a.parentCode ? areaIdByCode.get(a.parentCode) : undefined;
    const provenance = urbanProvenance.get(a.code);
    if (a.unionCode && !unionId) {
      console.warn(`  ! Skipping area ${a.code}: unknown unionCode ${a.unionCode}`);
      areasSkipped += 1;
      continue;
    }
    if (a.districtCode && !districtId) {
      console.warn(`  ! Skipping area ${a.code}: unknown districtCode ${a.districtCode}`);
      areasSkipped += 1;
      continue;
    }
    if (a.parentCode && !parentId) {
      console.warn(
        `  ! Skipping area ${a.code}: unknown parentCode ${a.parentCode} (seed order issue)`,
      );
      areasSkipped += 1;
      continue;
    }
    const row = await prisma.bdArea.upsert({
      where: { code: a.code },
      update: {
        nameEn: a.nameEn,
        nameBn: a.nameBn ?? null,
        type: a.type,
        reviewStatus: provenance?.reviewStatus ?? 'CURRENT_VERIFIED',
        currentValidity: provenance?.currentValidity ?? 'CURRENT_VERIFIED',
        provenance: provenance
          ? {
              sourceDocument: provenance.sourceDocument,
              sourcePublicationDate: provenance.sourcePublicationDate,
              sourcePage: provenance.sourcePage,
              reviewStatus: provenance.reviewStatus,
              currentValidity: provenance.currentValidity,
            }
          : Prisma.DbNull,
        unionId: unionId ?? null,
        districtId: districtId ?? null,
        parentId: parentId ?? null,
      },
      create: {
        code: a.code,
        nameEn: a.nameEn,
        nameBn: a.nameBn ?? null,
        type: a.type,
        reviewStatus: provenance?.reviewStatus ?? 'CURRENT_VERIFIED',
        currentValidity: provenance?.currentValidity ?? 'CURRENT_VERIFIED',
        provenance: provenance
          ? {
              sourceDocument: provenance.sourceDocument,
              sourcePublicationDate: provenance.sourcePublicationDate,
              sourcePage: provenance.sourcePage,
              reviewStatus: provenance.reviewStatus,
              currentValidity: provenance.currentValidity,
            }
          : Prisma.DbNull,
        unionId: unionId ?? null,
        districtId: districtId ?? null,
        parentId: parentId ?? null,
      },
      select: { id: true },
    });
    areaIdByCode.set(a.code, row.id);
    areasSeeded += 1;
  }
  console.log(
    `  Areas (wards/city-corporations/zones/localities): ${areasSeeded} upserted${areasSkipped ? `, ${areasSkipped} skipped` : ''}`,
  );

  console.log('Bangladesh location reference data seeded.');
}

async function idMapByCode(model: {
  findMany: (args: {
    select: { id: true; code: true };
  }) => Promise<Array<{ id: number; code: string }>>;
}): Promise<Map<string, number>> {
  const rows = await model.findMany({ select: { id: true, code: true } });
  return new Map(rows.map((row) => [row.code, row.id]));
}
