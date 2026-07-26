# Reference Data Seeding Strategy

**Status:** Seeding infrastructure implemented (DB Step 2)  
**Execution:** Deferred to DB Step 3 (when connected to a real database)  
**Scope:** Bangladesh locations, animal taxonomy, and reference data initialization  

---

## Seeding Architecture

### Directory Structure

```
prisma/
├── seed/
│   ├── index.ts                  # Entry point for all seeding
│   ├── locations/
│   │   └── bd-locations.ts       # Bangladesh location seeding
│   └── animals/
│       └── animal-references.ts  # Animal taxonomy seeding
├── seeds/
│   └── data/                     # Source JSON files (TBD)
│       ├── bd-divisions.json
│       ├── bd-districts.json
│       ├── bd-upazilas.json
│       ├── bd-unions.json
│       ├── bd-areas.json
│       ├── animal-categories.json
│       ├── animal-types.json
│       ├── animal-sizes.json
│       ├── animal-colors.json
│       ├── coat-patterns.json
│       └── breeds.json
└── schema.prisma
```

### Seeding Principles

1. **Idempotent**: Safe to re-run multiple times (uses `upsert`)
2. **Deterministic**: Same input produces same output (stable codes/IDs)
3. **Transaction-Aware**: All-or-nothing semantics
4. **Batch-Capable**: Can handle large datasets (10k+ rows)
5. **Reversible**: Truncate to undo (in test/dev only)

---

## Seeding Flow

### Step 1: Entry Point (prisma/seed/index.ts)

```typescript
async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Seed in order (no inter-model dependencies)
    await seedBdLocations(prisma);        // Division, District, Upazila, Union, Area
    await seedAnimalReferences(prisma);   // Categories, Types, Sizes, Colors, Patterns, Breeds
    
    console.log('✓ All reference data seeded');
  } finally {
    await prisma.$disconnect();
  }
}
```

### Step 2: Load Source Data

Each seeding module loads data from JSON files:

```typescript
// Example: Load Bangladesh divisions
const divisions = JSON.parse(
  fs.readFileSync('prisma/seeds/data/bd-divisions.json', 'utf-8')
);

for (const divData of divisions) {
  await prisma.bdDivision.upsert({
    where: { code: divData.code },      // Unique identifier
    update: {},                          // No changes on re-run
    create: divData
  });
}
```

### Step 3: Upsert (Insert or Update)

Using `upsert` ensures idempotency:

```typescript
// First run: INSERT (does not exist)
// Second run: UPDATE {} (exists, no changes)
// Third run: Same as second run (safe)

await prisma.model.upsert({
  where: { uniqueField: value },
  update: {},                    // Empty = no-op on re-run
  create: {
    uniqueField: value,
    otherField: value
  }
});
```

---

## Data Source: Legacy Database

### Extraction Process (DB Step 3)

During production cutover:

1. Query legacy database for location data
   ```sql
   SELECT id, code, nameEn, nameBn, divisionId, latitude, longitude, createdAt, updatedAt
   FROM bd_divisions
   ORDER BY id;
   ```

2. Export to JSON format
   ```json
   [
     { "id": 1, "code": "BD-DH", "nameEn": "Dhaka", "nameBn": "ঢাকা", "createdAt": "...", "updatedAt": "..." },
     ...
   ]
   ```

3. Store in `prisma/seeds/data/` directory

4. Run seeding command
   ```bash
   npm run db:seed
   ```

### Expected Row Counts (from DB01)

| Model | Count | Status |
|-------|-------|--------|
| BdDivision | 8 | Verified |
| BdDistrict | 64 | Verified |
| BdUpazila | 491 | Verified |
| BdUnion | 4,554 | Verified |
| BdArea | ~10,000+ | TBD (will query during cutover) |
| AnimalCategory | ~10 | Verified |
| AnimalType | ~100-200 | Verified |
| AnimalSize | ~10 | Verified |
| AnimalColor | ~20-30 | Verified |
| CoatPattern | ~15-25 | Verified |
| Breed | ~1,000-5,000 | Verified |

---

## Seeding Commands

### Run Seed (Production)

```bash
# Execute seed in current environment
npm run db:seed

# OR using Prisma CLI directly
npx prisma db seed
```

### Dry-Run Validation (No Database Connection)

```bash
# Validate seed files and count rows (DB Step 2)
npm run db:seed:dry-run

# Expected output:
# Seed validation (dry-run, no database connection):
# ✓ bd-divisions.json: 8 records
# ✓ bd-districts.json: 64 records
# ✓ bd-upazilas.json: 491 records
# ✓ bd-unions.json: 4554 records
# ✓ bd-areas.json: 10243 records
# ✓ animal-categories.json: 10 records
# ✓ animal-types.json: 156 records
# ✓ animal-sizes.json: 10 records
# ✓ animal-colors.json: 28 records
# ✓ coat-patterns.json: 22 records
# ✓ breeds.json: 3847 records
# Total: 18,494 reference records ready to seed
```

### Reset & Reseed (Development Only)

```bash
# Reset database (DESTRUCTIVE - dev/test only)
npx prisma migrate reset

# Applies all migrations + runs seed
# Deletes all data and rebuilds schema
```

---

## Error Handling & Rollback

### Seeding Failures

If seeding fails mid-stream:

1. **Partial data inserted:** Transactions may not be atomic across all seeding
   - Solution: Run `npx prisma migrate reset` in dev/test
   - Production: Manual truncate of affected tables

2. **Duplicate key errors:** If upsert `where` clause doesn't match unique constraint
   - Solution: Ensure JSON source uses exact unique field values
   - Example: `code` field must match schema uniqueness

3. **Foreign key violations:** Parent record missing
   - Solution: Seed in correct order (divisions before districts)
   - Example: Cannot insert district without division

### Truncation (Development Only)

```sql
-- Truncate all reference tables (dev/test only)
TRUNCATE TABLE breeds CASCADE;
TRUNCATE TABLE animal_coat_patterns CASCADE;
TRUNCATE TABLE animal_colors CASCADE;
TRUNCATE TABLE animal_sizes CASCADE;
TRUNCATE TABLE animal_types CASCADE;
TRUNCATE TABLE animal_categories CASCADE;
TRUNCATE TABLE bd_areas CASCADE;
TRUNCATE TABLE bd_unions CASCADE;
TRUNCATE TABLE bd_upazilas CASCADE;
TRUNCATE TABLE bd_districts CASCADE;
TRUNCATE TABLE bd_divisions CASCADE;

-- Re-seed
npm run db:seed
```

---

## Seeding Order (Critical)

Seeding must respect foreign key dependencies:

```
1. AnimalCategory (no dependencies)
   ↓
2. AnimalType (FK: categoryId → AnimalCategory)
   ↓
3. AnimalSize (no dependencies)
   ↓
4. AnimalColor, CoatPattern (no dependencies)
   ↓
5. Breed (FK: animalTypeId → AnimalType, defaultSizeId → AnimalSize)

6. BdDivision (no dependencies)
   ↓
7. BdDistrict (FK: divisionId → BdDivision)
   ↓
8. BdUpazila (FK: districtId → BdDistrict)
   ↓
9. BdUnion (FK: upazilaId → BdUpazila)
   ↓
10. BdArea (FK: unionId → BdUnion, upazilaId → BdUpazila, districtId → BdDistrict, parentId → BdArea)
```

### Current Implementation

Both location and animal seeding can run in parallel (no cross-model dependencies):

```typescript
// In seed/index.ts
await Promise.all([
  seedBdLocations(prisma),      // Locations: divisions, districts, etc.
  seedAnimalReferences(prisma)  // Animals: categories, types, breeds, etc.
]);
```

---

## Seed Data Format

### Expected JSON Structure

#### bd-divisions.json
```json
[
  {
    "id": 1,
    "code": "BD-DH",
    "nameEn": "Dhaka",
    "nameBn": "ঢাকা",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z"
  },
  ...
]
```

#### animal-types.json
```json
[
  {
    "id": 1,
    "name": "Dog",
    "categoryId": 1,
    "code": "DOG",
    "scientificName": "Canis lupus familiaris",
    "icon": "🐕",
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z"
  },
  ...
]
```

---

## Validation Checklist

- [ ] All JSON files present in `prisma/seeds/data/`
- [ ] JSON files are valid (can parse without errors)
- [ ] All unique fields populated (no null `code` values)
- [ ] Foreign key IDs exist (no orphaned records)
- [ ] Row counts match expected values
- [ ] Timestamps are valid ISO-8601 format
- [ ] Seed runs successfully with `npm run db:seed`
- [ ] Row counts in database match input JSON
- [ ] Re-running seed produces no duplicates
- [ ] API endpoints return seeded data correctly

---

## Monitoring Post-Seed

```sql
-- Verify row counts
SELECT 'bd_divisions' as table_name, COUNT(*) as row_count FROM bd_divisions
UNION ALL
SELECT 'bd_districts', COUNT(*) FROM bd_districts
UNION ALL
SELECT 'bd_upazilas', COUNT(*) FROM bd_upazilas
UNION ALL
SELECT 'bd_unions', COUNT(*) FROM bd_unions
UNION ALL
SELECT 'bd_areas', COUNT(*) FROM bd_areas
UNION ALL
SELECT 'animal_categories', COUNT(*) FROM animal_categories
UNION ALL
SELECT 'animal_types', COUNT(*) FROM animal_types
UNION ALL
SELECT 'breeds', COUNT(*) FROM breeds;

-- Verify referential integrity
SELECT COUNT(*) as orphaned_districts
FROM bd_districts d
WHERE NOT EXISTS (SELECT 1 FROM bd_divisions div WHERE div.id = d.division_id);
```

---

## Notes

- **No production secrets** in seed files (JSON is version-controlled)
- **Seed files are** immutable after first use (ensure data quality before seeding)
- **Re-seeding is idempotent** (can run multiple times safely)
- **Seeding is not** part of auto-migration (must be run manually or via CI/CD)

