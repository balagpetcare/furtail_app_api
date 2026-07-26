/**
 * Dry-run validation script for seed data
 * Validates JSON files and counts records WITHOUT connecting to database
 * Usage: npm run db:seed:dry-run
 */

import * as fs from 'fs';
import * as path from 'path';

interface SeedFile {
  name: string;
  path: string;
  expectedCount?: number;
}

const seedFiles: SeedFile[] = [
  // Location files
  { name: 'bd-divisions.json', path: 'prisma/seeds/data/bd-divisions.json', expectedCount: 8 },
  { name: 'bd-districts.json', path: 'prisma/seeds/data/bd-districts.json', expectedCount: 64 },
  { name: 'bd-upazilas.json', path: 'prisma/seeds/data/bd-upazilas.json', expectedCount: 491 },
  { name: 'bd-unions.json', path: 'prisma/seeds/data/bd-unions.json', expectedCount: 4554 },
  { name: 'bd-areas.json', path: 'prisma/seeds/data/bd-areas.json' }, // TBD count

  // Animal reference files
  {
    name: 'animal-categories.json',
    path: 'prisma/seeds/data/animal-categories.json',
    expectedCount: 10,
  },
  { name: 'animal-types.json', path: 'prisma/seeds/data/animal-types.json', expectedCount: 100 }, // ~100-200
  { name: 'animal-sizes.json', path: 'prisma/seeds/data/animal-sizes.json', expectedCount: 10 },
  { name: 'animal-colors.json', path: 'prisma/seeds/data/animal-colors.json', expectedCount: 20 }, // ~20-30
  { name: 'coat-patterns.json', path: 'prisma/seeds/data/coat-patterns.json', expectedCount: 15 }, // ~15-25
  { name: 'breeds.json', path: 'prisma/seeds/data/breeds.json', expectedCount: 1000 }, // ~1000-5000
];

function validateSeedFile(file: SeedFile): {
  success: boolean;
  count: number;
  error?: string;
} {
  try {
    if (!fs.existsSync(file.path)) {
      return { success: false, count: 0, error: `File not found: ${file.path}` };
    }

    const content = fs.readFileSync(file.path, 'utf-8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
      return { success: false, count: 0, error: `File is not a JSON array: ${file.name}` };
    }

    return { success: true, count: data.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, count: 0, error: `Parse error in ${file.name}: ${message}` };
  }
}

function main() {
  console.log('Seed Data Validation (Dry-Run)\n');
  console.log('Validating seed files (NO database connection)...\n');

  let totalRecords = 0;
  let filesChecked = 0;
  let filesMissing = 0;
  const results: Array<{ file: string; status: string; count: number; expected?: number }> = [];

  for (const file of seedFiles) {
    const result = validateSeedFile(file);
    filesChecked++;

    if (!result.success) {
      filesMissing++;
      console.log(`✗ ${file.name}: ${result.error}`);
      results.push({ file: file.name, status: 'MISSING', count: 0 });
    } else {
      totalRecords += result.count;

      const status =
        file.expectedCount !== undefined && result.count !== file.expectedCount
          ? `⚠️  COUNT MISMATCH`
          : '✓';

      console.log(
        `${status} ${file.name}: ${result.count} records${file.expectedCount ? ` (expected: ${file.expectedCount})` : ' (count TBD)'}`,
      );

      results.push({
        file: file.name,
        status: 'OK',
        count: result.count,
        expected: file.expectedCount,
      });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  Files checked: ${filesChecked}`);
  console.log(`  Files valid: ${filesChecked - filesMissing}`);
  console.log(`  Files missing: ${filesMissing}`);
  console.log(`  Total records ready to seed: ${totalRecords.toLocaleString()}`);
  console.log(`${'='.repeat(60)}\n`);

  if (filesMissing === 0) {
    console.log('✓ All seed files valid! Ready to run: npm run db:seed\n');
    process.exit(0);
  } else {
    console.log(`✗ ${filesMissing} seed file(s) missing or invalid.\n`);
    console.log('Create seed files in prisma/seeds/data/ before running db:seed\n');
    process.exit(1);
  }
}

main();
