import { PrismaClient } from '@prisma/client';

/**
 * Seed Bangladesh administrative hierarchy (Division -> District -> Upazila -> Union -> Area)
 * Expected counts from legacy system:
 * - BdDivision: 8
 * - BdDistrict: 64
 * - BdUpazila: 491
 * - BdUnion: 4,554
 * - BdArea: ~10,000+ (flexible hierarchy, exact count TBD from legacy database)
 *
 * Status: PLACEHOLDER STRUCTURE
 * Actual data will be imported from legacy database or JSON seed files during DB Step 3.
 */

export async function seedBdLocations(prisma: PrismaClient) {
  console.log('Seeding Bangladesh locations...');

  // Check if data already exists (idempotent)
  const divisionCount = await prisma.bdDivision.count();
  if (divisionCount > 0) {
    console.log(`  Skipping: ${divisionCount} divisions already exist`);
    return;
  }

  // Placeholder: Insert minimal data for schema validation
  // Actual production data will be:
  // 1. Extracted from legacy database during cutover
  // 2. Stored in JSON seed files (prisma/seeds/data/*.json)
  // 3. Loaded via upsert for idempotency

  // Example structure (minimal test data):
  const divisions = [
    {
      code: 'BD-DH',
      nameEn: 'Dhaka',
      nameBn: 'ঢাকা',
    },
    {
      code: 'BD-CHA',
      nameEn: 'Chittagong',
      nameBn: 'চট্টগ্রাম',
    },
  ];

  for (const divData of divisions) {
    await prisma.bdDivision.upsert({
      where: { code: divData.code },
      update: {},
      create: divData,
    });
  }

  console.log(`  Created ${divisions.length} divisions (placeholder data for schema validation)`);
  console.log('  Note: Production location data will be imported from legacy database');
}
