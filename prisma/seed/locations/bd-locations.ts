import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Canonical Bangladesh location hierarchy seed for Furtail.
 *
 * Canonical source comparison:
 * - Rural hierarchy is aligned to the BPA geocode source and uses the checked-in
 *   stable code pattern already present in Furtail (`DIV-*`, `DIS-*`, `UPA-*`,
 *   `ARE-*`).
 * - Urban hierarchy is imported from BPA's reviewed `city-corporations.json`
 *   payload, covering 12 city corporations, 17 zones, and 129 wards.
 *
 * Idempotent:
 * - canonical rows are upserted by stable code;
 * - rows that no longer exist in the canonical source are safely deactivated;
 * - existing row IDs are preserved because updates happen in place.
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'seeds', 'data');

const DIVISION_NAME_ALIASES = new Map<string, string>([
  ['barishal', 'barisal'],
  ['chattogram', 'chattagram'],
]);

const URBAN_CURRENT_TYPES = new Set(['CITY_CORPORATION', 'CITY_ZONE', 'WARD']);

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

interface UnionRow {
  code: string;
  upazilaCode: string;
  nameEn: string;
  nameBn?: string;
  type: string;
}

interface WardEntry {
  number: number;
  nameEn: string;
  nameBn: string;
  area?: string;
}

interface ZoneEntry {
  nameEn: string;
  nameBn: string;
  code: string;
  wards: WardEntry[];
}

interface CityCorporationEntry {
  nameEn: string;
  nameBn: string;
  code: string;
  districtName: string;
  divisionName: string;
  isVerified: boolean;
  wardCount?: number;
  zones: ZoneEntry[];
  _note?: string;
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

interface RegionRef {
  id: number;
  code: string;
  nameEn: string;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
}

function readRootJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', relativePath), 'utf-8'),
  ) as T;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeAlias(value: string): string {
  const normalized = normalize(value);
  return DIVISION_NAME_ALIASES.get(normalized) ?? normalized;
}

function codeForCorporation(code: string): string {
  return `CC-${code}`;
}

function codeForZone(corpCode: string, index: number): string {
  return `ZONE-${corpCode}-${String(index).padStart(2, '0')}`;
}

function codeForWard(corpCode: string, wardNumber: number): string {
  return `WARD-${corpCode}-${String(wardNumber).padStart(2, '0')}`;
}

async function upsertCountry(prisma: PrismaClient, row: CountryRow) {
  return prisma.country.upsert({
    where: { iso2: row.iso2 },
    update: {
      iso3: row.iso3 ?? null,
      name: row.name,
      nameBn: row.nameBn ?? null,
      sortOrder: row.sortOrder ?? 0,
      isActive: row.isActive ?? true,
    },
    create: {
      iso2: row.iso2,
      iso3: row.iso3 ?? null,
      name: row.name,
      nameBn: row.nameBn ?? null,
      sortOrder: row.sortOrder ?? 0,
      isActive: row.isActive ?? true,
    },
  });
}

async function deactivateObsoleteRows(
  rows: Array<{ id: number; code: string; isActive: boolean; type?: string | null }>,
  canonicalCodes: Set<string>,
  updateRow: (id: number) => Promise<void>,
  predicate?: (row: {
    id: number;
    code: string;
    isActive: boolean;
    type?: string | null;
  }) => boolean,
): Promise<string[]> {
  const obsolete = rows.filter(
    (row) => row.isActive && !canonicalCodes.has(row.code) && (predicate ? predicate(row) : true),
  );

  for (const row of obsolete) {
    await updateRow(row.id);
  }

  return obsolete.map((row) => row.code);
}

function buildUrbanMeta(
  provenanceMap: Map<string, UrbanProvenanceRecord>,
  code: string,
): {
  reviewStatus: string;
  currentValidity: string;
  provenance: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  const provenance = provenanceMap.get(code);
  if (!provenance) {
    return {
      reviewStatus: 'CURRENT_VERIFIED',
      currentValidity: 'CURRENT_VERIFIED',
      provenance: Prisma.DbNull,
    };
  }

  return {
    reviewStatus: provenance.reviewStatus,
    currentValidity: provenance.currentValidity,
    provenance: {
      sourceDocument: provenance.sourceDocument,
      sourcePublicationDate: provenance.sourcePublicationDate,
      sourcePage: provenance.sourcePage,
      reviewStatus: provenance.reviewStatus,
      currentValidity: provenance.currentValidity,
    },
  };
}

export async function seedBdLocations(prisma: PrismaClient): Promise<void> {
  console.log('Seeding Bangladesh location reference data...');

  const urbanProvenance = new Map(
    readRootJson<UrbanProvenanceManifest>(
      'migration-reports/dhaka-urban-provenance-audit.json',
    ).records.map((row) => [row.code, row]),
  );

  // --- Country -------------------------------------------------------------
  const countries = readJson<CountryRow[]>('bd.country.json');
  for (const country of countries) {
    await upsertCountry(prisma, country);
  }
  console.log(`  Country: ${countries.length} upserted`);

  // --- Divisions -----------------------------------------------------------
  const divisions = readJson<DivisionRow[]>('bd.divisions.json');
  const divisionByCode = new Map<string, RegionRef>();
  const divisionByName = new Map<string, RegionRef>();
  for (let index = 0; index < divisions.length; index += 1) {
    const division = divisions[index]!;
    const saved = await prisma.bdDivision.upsert({
      where: { code: division.code },
      update: {
        nameEn: division.nameEn,
        nameBn: division.nameBn ?? null,
        sortOrder: index + 1,
        isActive: true,
      },
      create: {
        code: division.code,
        nameEn: division.nameEn,
        nameBn: division.nameBn ?? null,
        sortOrder: index + 1,
        isActive: true,
      },
      select: { id: true, code: true, nameEn: true },
    });
    const ref = { id: saved.id, code: saved.code, nameEn: saved.nameEn };
    divisionByCode.set(division.code, ref);
    divisionByName.set(normalize(division.nameEn), ref);
  }
  console.log(`  Divisions: ${divisions.length} upserted`);

  // --- Districts -----------------------------------------------------------
  const districts = readJson<DistrictRow[]>('bd.districts.json');
  const districtByCode = new Map<string, RegionRef & { divisionId: number }>();
  const districtByName = new Map<string, RegionRef & { divisionId: number }>();
  let districtsSkipped = 0;

  for (let index = 0; index < districts.length; index += 1) {
    const district = districts[index]!;
    const division = divisionByCode.get(district.divisionCode);
    if (!division) {
      console.warn(
        `  ! Skipping district ${district.code}: unknown divisionCode ${district.divisionCode}`,
      );
      districtsSkipped += 1;
      continue;
    }

    const saved = await prisma.bdDistrict.upsert({
      where: { code: district.code },
      update: {
        nameEn: district.nameEn,
        nameBn: district.nameBn ?? null,
        divisionId: division.id,
        sortOrder: index + 1,
        isActive: true,
      },
      create: {
        code: district.code,
        nameEn: district.nameEn,
        nameBn: district.nameBn ?? null,
        divisionId: division.id,
        sortOrder: index + 1,
        isActive: true,
      },
      select: { id: true, code: true, nameEn: true, divisionId: true },
    });

    const ref = {
      id: saved.id,
      code: saved.code,
      nameEn: saved.nameEn,
      divisionId: saved.divisionId,
    };
    districtByCode.set(district.code, ref);
    districtByName.set(normalize(district.nameEn), ref);
  }
  console.log(
    `  Districts: ${districts.length - districtsSkipped} upserted${districtsSkipped ? `, ${districtsSkipped} skipped (unresolved parent)` : ''}`,
  );

  // --- Upazilas ------------------------------------------------------------
  const upazilas = readJson<UpazilaRow[]>('bd.upazilas.json');
  const upazilaCodes = new Set<string>();
  let upazilasSkipped = 0;

  for (let index = 0; index < upazilas.length; index += 1) {
    const upazila = upazilas[index]!;
    upazilaCodes.add(upazila.code);

    const district = districtByCode.get(upazila.districtCode);
    if (!district) {
      console.warn(
        `  ! Skipping upazila ${upazila.code}: unknown districtCode ${upazila.districtCode}`,
      );
      upazilasSkipped += 1;
      continue;
    }

    await prisma.bdUpazila.upsert({
      where: { code: upazila.code },
      update: {
        nameEn: upazila.nameEn,
        nameBn: upazila.nameBn ?? null,
        districtId: district.id,
        sortOrder: index + 1,
        isActive: true,
      },
      create: {
        code: upazila.code,
        nameEn: upazila.nameEn,
        nameBn: upazila.nameBn ?? null,
        districtId: district.id,
        sortOrder: index + 1,
        isActive: true,
      },
    });
  }

  const obsoleteUpazilas = await deactivateObsoleteRows(
    await prisma.bdUpazila.findMany({ select: { id: true, code: true, isActive: true } }),
    upazilaCodes,
    async (id) => {
      await prisma.bdUpazila.update({ where: { id }, data: { isActive: false } });
    },
  );

  console.log(
    `  Upazilas: ${upazilas.length - upazilasSkipped} upserted${upazilasSkipped ? `, ${upazilasSkipped} skipped (unresolved parent)` : ''}${obsoleteUpazilas.length ? `, ${obsoleteUpazilas.length} obsolete deactivated` : ''}`,
  );
  if (obsoleteUpazilas.length > 0) {
    console.log(`  Upazila cleanup: ${obsoleteUpazilas.join(', ')}`);
  }

  // --- Unions --------------------------------------------------------------
  const unionRows = readJson<UnionRow[]>('bd.areas.json').filter((row) => row.type === 'UNION');
  const unionCodes = new Set<string>();
  let unionsSkipped = 0;

  for (let index = 0; index < unionRows.length; index += 1) {
    const union = unionRows[index]!;
    unionCodes.add(union.code);

    const upazila = await prisma.bdUpazila.findFirst({
      where: { code: union.upazilaCode, isActive: true },
      select: { id: true, code: true, nameEn: true },
    });
    if (!upazila) {
      console.warn(`  ! Skipping union ${union.code}: unknown upazilaCode ${union.upazilaCode}`);
      unionsSkipped += 1;
      continue;
    }

    await prisma.bdUnion.upsert({
      where: { code: union.code },
      update: {
        nameEn: union.nameEn,
        nameBn: union.nameBn ?? null,
        upazilaId: upazila.id,
        sortOrder: index + 1,
        isActive: true,
      },
      create: {
        code: union.code,
        nameEn: union.nameEn,
        nameBn: union.nameBn ?? null,
        upazilaId: upazila.id,
        sortOrder: index + 1,
        isActive: true,
      },
    });
  }

  const obsoleteUnions = await deactivateObsoleteRows(
    await prisma.bdUnion.findMany({ select: { id: true, code: true, isActive: true } }),
    unionCodes,
    async (id) => {
      await prisma.bdUnion.update({ where: { id }, data: { isActive: false } });
    },
  );

  console.log(
    `  Unions: ${unionRows.length - unionsSkipped} upserted${unionsSkipped ? `, ${unionsSkipped} skipped (unresolved parent)` : ''}${obsoleteUnions.length ? `, ${obsoleteUnions.length} obsolete deactivated` : ''}`,
  );

  // --- Urban hierarchy -----------------------------------------------------
  const cityCorporations = readJson<CityCorporationEntry[]>('bd.wards-and-cc.json');
  const urbanCodes = new Set<string>();
  let corporationsSeeded = 0;
  let zonesSeeded = 0;
  let wardsSeeded = 0;
  let urbanSkipped = 0;

  for (const corp of cityCorporations) {
    const divisionRef = divisionByName.get(normalizeAlias(corp.divisionName));
    const districtRef = districtByName.get(normalize(corp.districtName));

    if (!divisionRef) {
      console.warn(
        `  ! Skipping city corporation ${corp.code}: unknown divisionName ${corp.divisionName}`,
      );
      urbanSkipped += 1;
      continue;
    }

    if (!districtRef) {
      console.warn(
        `  ! Skipping city corporation ${corp.code}: unknown districtName ${corp.districtName}`,
      );
      urbanSkipped += 1;
      continue;
    }

    if (districtRef.divisionId !== divisionRef.id) {
      console.warn(
        `  ! Skipping city corporation ${corp.code}: district ${corp.districtName} does not belong to division ${corp.divisionName}`,
      );
      urbanSkipped += 1;
      continue;
    }

    const corpCode = codeForCorporation(corp.code);
    urbanCodes.add(corpCode);
    const corpMeta = buildUrbanMeta(urbanProvenance, corpCode);

    const corpRow = await prisma.bdArea.upsert({
      where: { code: corpCode },
      update: {
        nameEn: corp.nameEn,
        nameBn: corp.nameBn ?? null,
        type: 'CITY_CORPORATION',
        reviewStatus: corpMeta.reviewStatus,
        currentValidity: corpMeta.currentValidity,
        provenance: corpMeta.provenance,
        unionId: null,
        upazilaId: null,
        districtId: districtRef.id,
        parentId: null,
        sortOrder: corporationsSeeded + 1,
        isActive: true,
      },
      create: {
        code: corpCode,
        nameEn: corp.nameEn,
        nameBn: corp.nameBn ?? null,
        type: 'CITY_CORPORATION',
        reviewStatus: corpMeta.reviewStatus,
        currentValidity: corpMeta.currentValidity,
        provenance: corpMeta.provenance,
        unionId: null,
        upazilaId: null,
        districtId: districtRef.id,
        parentId: null,
        sortOrder: corporationsSeeded + 1,
        isActive: true,
      },
      select: { id: true },
    });
    corporationsSeeded += 1;

    const shouldExpandToZones = corp.code === 'DNCC' || corp.code === 'DSCC';

    if (shouldExpandToZones && corp.zones.length > 0) {
      for (let zoneIndex = 0; zoneIndex < corp.zones.length; zoneIndex += 1) {
        const zone = corp.zones[zoneIndex]!;
        const zoneCode = codeForZone(corp.code, zoneIndex + 1);
        urbanCodes.add(zoneCode);
        const zoneMeta = buildUrbanMeta(urbanProvenance, zoneCode);

        const zoneRow = await prisma.bdArea.upsert({
          where: { code: zoneCode },
          update: {
            nameEn: zone.nameEn,
            nameBn: zone.nameBn ?? null,
            type: 'CITY_ZONE',
            reviewStatus: zoneMeta.reviewStatus,
            currentValidity: zoneMeta.currentValidity,
            provenance: zoneMeta.provenance,
            unionId: null,
            upazilaId: null,
            districtId: districtRef.id,
            parentId: corpRow.id,
            sortOrder: zoneIndex + 1,
            isActive: true,
          },
          create: {
            code: zoneCode,
            nameEn: zone.nameEn,
            nameBn: zone.nameBn ?? null,
            type: 'CITY_ZONE',
            reviewStatus: zoneMeta.reviewStatus,
            currentValidity: zoneMeta.currentValidity,
            provenance: zoneMeta.provenance,
            unionId: null,
            upazilaId: null,
            districtId: districtRef.id,
            parentId: corpRow.id,
            sortOrder: zoneIndex + 1,
            isActive: true,
          },
          select: { id: true },
        });
        void zoneRow;
        zonesSeeded += 1;

        for (const ward of zone.wards) {
          const wardCode = codeForWard(corp.code, ward.number);
          urbanCodes.add(wardCode);
          const wardMeta = buildUrbanMeta(urbanProvenance, wardCode);
          await prisma.bdArea.upsert({
            where: { code: wardCode },
            update: {
              nameEn: ward.area ? `${ward.nameEn} - ${ward.area}` : ward.nameEn,
              nameBn: ward.nameBn ?? null,
              type: 'WARD',
              reviewStatus: wardMeta.reviewStatus,
              currentValidity: wardMeta.currentValidity,
              provenance: wardMeta.provenance,
              unionId: null,
              upazilaId: null,
              districtId: districtRef.id,
              parentId: zoneRow.id,
              sortOrder: ward.number,
              isActive: true,
            },
            create: {
              code: wardCode,
              nameEn: ward.area ? `${ward.nameEn} - ${ward.area}` : ward.nameEn,
              nameBn: ward.nameBn ?? null,
              type: 'WARD',
              reviewStatus: wardMeta.reviewStatus,
              currentValidity: wardMeta.currentValidity,
              provenance: wardMeta.provenance,
              unionId: null,
              upazilaId: null,
              districtId: districtRef.id,
              parentId: zoneRow.id,
              sortOrder: ward.number,
              isActive: true,
            },
          });
          wardsSeeded += 1;
        }
      }
    }
  }

  const obsoleteUrbanRows = await deactivateObsoleteRows(
    await prisma.bdArea.findMany({ select: { id: true, code: true, isActive: true, type: true } }),
    urbanCodes,
    async (id) => {
      await prisma.bdArea.update({ where: { id }, data: { isActive: false } });
    },
    (row) => typeof row.type === 'string' && URBAN_CURRENT_TYPES.has(row.type),
  );

  console.log(
    `  City corporations: ${corporationsSeeded} upserted${urbanSkipped ? `, ${urbanSkipped} skipped` : ''}`,
  );
  console.log(`  Zones: ${zonesSeeded} upserted`);
  console.log(`  Wards: ${wardsSeeded} upserted`);
  if (obsoleteUrbanRows.length > 0) {
    console.log(`  Urban cleanup: ${obsoleteUrbanRows.length} obsolete row(s) deactivated`);
    console.log(`  Urban cleanup codes: ${obsoleteUrbanRows.join(', ')}`);
  }

  console.log('Bangladesh location reference data seeded.');
}

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the Bangladesh location seed CLI');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
  });
  seedBdLocations(prisma)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
