/**
 * Import complete legacy location datasets
 * Validates and upserts Bangladesh locations from repository seed files
 */

import * as fs from 'fs';
import * as path from 'path';

interface LegacyDivision {
  code: string;
  nameEn: string;
  nameBn?: string;
}

interface LegacyDistrict {
  code: string;
  nameEn: string;
  nameBn?: string;
  divisionId?: number;
  division?: string;
}

interface LegacyUpazila {
  code: string;
  nameEn: string;
  nameBn?: string;
  districtId?: number;
  district?: string;
  latitude?: number;
  longitude?: number;
}

interface LegacyArea {
  code: string;
  nameEn: string;
  nameBn?: string;
  type?: string;
  unionId?: number;
  upazilaId?: number;
  districtId?: number;
  latitude?: number;
  longitude?: number;
}

async function importLegacyLocations() {
  const dataDir = path.join(__dirname, '..', 'seeds', 'data');

  console.log('Legacy Location Import\n');
  console.log('Reading and validating seed files...\n');

  // Validate divisions
  const divisionsPath = path.join(dataDir, 'bd.divisions.json');
  const divisions: LegacyDivision[] = JSON.parse(fs.readFileSync(divisionsPath, 'utf-8'));
  console.log(`✓ bd.divisions.json: ${divisions.length} records`);
  if (!divisions.every((d) => d.code && d.nameEn)) {
    throw new Error('Division missing required fields');
  }

  // Validate districts
  const districtsPath = path.join(dataDir, 'bd.districts.json');
  const districts: LegacyDistrict[] = JSON.parse(fs.readFileSync(districtsPath, 'utf-8'));
  console.log(`✓ bd.districts.json: ${districts.length} records`);
  if (!districts.every((d) => d.code && d.nameEn)) {
    throw new Error('District missing required fields');
  }

  // Validate upazilas
  const upazilasPath = path.join(dataDir, 'bd.upazilas.json');
  const upazilas: LegacyUpazila[] = JSON.parse(fs.readFileSync(upazilasPath, 'utf-8'));
  console.log(`✓ bd.upazilas.json: ${upazilas.length} records`);
  if (!upazilas.every((u) => u.code && u.nameEn)) {
    throw new Error('Upazila missing required fields');
  }

  // Validate areas
  const areasPath = path.join(dataDir, 'bd.areas.json');
  const areas: LegacyArea[] = JSON.parse(fs.readFileSync(areasPath, 'utf-8'));
  console.log(`✓ bd.areas.json: ${areas.length} records`);
  if (!areas.every((a) => a.code && a.nameEn)) {
    throw new Error('Area missing required fields');
  }

  console.log(
    `\nTotal records ready for import: ${divisions.length + districts.length + upazilas.length + areas.length}`,
  );
  console.log('\nAll files validated successfully!\n');

  // Map division names to IDs
  const divisionMap = new Map<string, number>();
  divisions.forEach((d, idx) => {
    divisionMap.set(d.code.toUpperCase(), idx + 1); // Assume sequential IDs
    divisionMap.set(d.nameEn.toUpperCase(), idx + 1);
  });

  console.log('File checksums:');
  const crypto = require('crypto');

  for (const file of [
    'bd.divisions.json',
    'bd.districts.json',
    'bd.upazilas.json',
    'bd.areas.json',
  ]) {
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    console.log(`  ${file}: ${hash}`);
  }

  console.log('\n✓ Import validation complete - ready for database seeding');
}

importLegacyLocations().catch((err) => {
  console.error('\n✗ Import validation failed:', err.message);
  process.exit(1);
});
