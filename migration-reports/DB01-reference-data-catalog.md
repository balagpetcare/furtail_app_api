# DB01 — Reference Data Catalog & Seed Strategy

**Purpose:** Plan for importing location and animal reference data into new API  
**Status:** Read-only planning document (no data imported yet)

---

## Bangladesh Location Reference Data

### Data Volume Estimates

| Level | Estimated Rows | Hierarchy |
|-------|---|---|
| Divisions | 8 | Top-level (national administrative regions) |
| Districts | 64 | Mid-level (county equivalent) |
| Upazilas | 491 | Sub-county level |
| Unions | 4,554 | Sub-district administrative unit |
| Areas (sub-division level) | 10,000+ | Flexible hierarchy: wards, neighborhoods |
| **Total Location Records** | **~15,000+** | Nested hierarchy |

### Data Characteristics

**Ownership:** Government reference data (not proprietary)  
**Volatility:** Stable (changes rarely, managed by government)  
**Updatability:** Ideally imported once, then read-only  
**Source:** Extracted from legacy database or external government reference  
**Languages:** English + Bengali (nameEn, nameBn fields)  
**Geospatial:** Latitude/Longitude (Decimal precision 10,8 / 11,8)

### Data Access Pattern in Legacy API

```bash
# Example queries observed in location.repository.ts

# List all divisions (paginated)
GET /api/v1/location-master/divisions?page=1&pageSize=50&locale=en

# List districts for a division
GET /api/v1/location-master/districts?divisionId=1&locale=en

# List upazilas for a district
GET /api/v1/location-master/upazilas?districtId=1&locale=en

# List unions for an upazila
GET /api/v1/location-master/unions?upazilaId=1&locale=en

# Full-text search across all levels
GET /api/v1/location-master/search?q=dhaka&level=DISTRICT&locale=en

# Validate a user's location selection
POST /api/v1/location-master/validate-selection
Body: { divisionId: 1, districtId: 1, upazilaId: 1, unionId: 1 }
```

### Data Integrity Rules

1. **Cascade Hierarchy:** Cannot have District without Division
2. **Unique Codes:** Each location has unique code (identifier for imports)
3. **Bilateral Timestamps:** All records have createdAt, updatedAt for audit trail
4. **Bilingual Labels:** nameEn required, nameBn optional (graceful degradation)

---

## Animal Reference Data

### Data Volume Estimates

| Entity | Estimated Rows | Characteristics |
|--------|---|---|
| AnimalCategories | ~10 | Mammals, Birds, Reptiles, Aquatic, etc. |
| AnimalTypes | ~100-200 | Dog, Cat, Rabbit, Parrot, Fish, etc. |
| Breeds | ~1,000-5,000 | German Shepherd, Labrador, Siamese, etc. |
| AnimalSizes | ~10 | XS, S, M, L, XL with weight ranges |
| AnimalColors | ~20-30 | Black, White, Brown, Tri-color, Spotted, etc. |
| CoatPatterns | ~15-25 | Solid, Striped, Spotted, Merle, Brindle, etc. |
| **Total Animal Reference Data** | **~1,100-5,300** | Flat lookup tables + taxonomy |

### Data Characteristics

**Ownership:** Furtail internal reference data  
**Volatility:** Stable (rarely added/modified)  
**Updatability:** Manual additions via admin panel (future feature)  
**Source:** Seeded from legacy database  
**Active/Inactive:** Boolean isActive flag (soft deletes)  
**Display Order:** Custom sort order for UI dropdowns

### Data Access Pattern in Legacy API

```bash
# Inferred from Flutter app usage
# (Exact endpoints not mapped in this audit)

# Get all animal types for selection
GET /api/v1/animals/types?isActive=true

# Get breeds for an animal type
GET /api/v1/animals/breeds?animalTypeId=1

# Get sizes for pet creation
GET /api/v1/animals/sizes?isActive=true

# Get colors for pet description
GET /api/v1/animals/colors?isActive=true
```

### Data Integrity Rules

1. **AnimalType Uniqueness:** name is unique (no duplicate species)
2. **Breed-Type Uniqueness:** (name, animalTypeId) is unique (same breed name OK for different species)
3. **Active Flag:** isActive controls visibility in UI (soft delete)
4. **Display Order:** Controls dropdown/list sort order
5. **Size Range Validation:** minWeightKg < maxWeightKg

---

## Seed Data Source Strategy

### Option A: SQL Extract from Legacy Database (Recommended)

**Advantages:**
- Exact data parity with legacy system
- Verifiable (can compare row counts)
- Transactional consistency

**Process:**
```sql
-- Export from legacy database
SELECT id, code, nameEn, nameBn, latitude, longitude, createdAt, updatedAt 
  FROM bd_divisions 
  WHERE isActive = true
  ORDER BY id;

-- Repeat for districts, upazilas, unions, areas
-- Repeat for animal reference tables

-- Store as SQL INSERT statements or JSON format
```

**Challenges:**
- Requires access to legacy production database (offline only during migration window)
- IDs must be preserved or remapped

### Option B: JSON/CSV Files in Version Control (Approved)

**Advantages:**
- Audit trail (git history)
- No database access required for review/audit
- Easy to validate and review row by row

**Process:**
```json
// File: prisma/seeds/data/bd-divisions.json
[
  { "id": 1, "code": "BD-DH", "nameEn": "Dhaka", "nameBn": "ঢাকা" },
  { "id": 2, "code": "BD-CHA", "nameEn": "Chittagong", "nameBn": "চট্টগ্রাম" },
  ...
]

// File: prisma/seeds/data/animal-types.json
[
  { "id": 1, "name": "Dog", "code": "DOG", "categoryId": 1 },
  { "id": 2, "name": "Cat", "code": "CAT", "categoryId": 1 },
  ...
]
```

**Challenges:**
- Manual extraction required
- Git history limits large text files (but JSON is compressible)

### Option C: Prisma Seed Script with Inline Data (For Small Sets)

**Suitable for:** Animal references only (smaller data set)

```typescript
// prisma/seed.ts
async function main() {
  // Create animal categories
  await prisma.animalCategory.createMany({
    data: [
      { code: 'MAMMAL', name: 'Mammals' },
      { code: 'BIRD', name: 'Birds' },
      ...
    ],
    skipDuplicates: true,
  });

  // Create animal types
  await prisma.animalType.createMany({
    data: [
      { name: 'Dog', categoryId: 1 },
      { name: 'Cat', categoryId: 1 },
      ...
    ],
    skipDuplicates: true,
  });
}
```

**Not suitable for:** Location data (~15k rows) — would make seed.ts too large

---

## Recommended Seed Strategy for New API

### Phase 1: Create Seed Infrastructure (DB Step 2)

```bash
# Structure:
prisma/
  ├── seeds/
  │   ├── index.ts          # Main seed runner
  │   ├── bd-locations.ts   # Location seeding logic
  │   ├── animal-refs.ts    # Animal reference seeding logic
  │   └── data/
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

package.json:
  "scripts": {
    "prisma:seed": "prisma db seed"
  }

prisma/package.json:
  "prisma": {
    "seed": "ts-node prisma/seeds/index.ts"
  }
```

### Phase 2: Extract Data from Legacy (Pre-Migration)

```bash
# Extract location data from legacy database (if available)
# Store in prisma/seeds/data/*.json

# Extract animal reference data
# Verify row counts:
# - Divisions: 8
# - Districts: 64
# - Upazilas: 491
# - Unions: 4,554
# - Areas: TBD (query: SELECT COUNT(*) FROM bd_areas)
```

### Phase 3: Seed New Database (During Migration)

```bash
# After initial Prisma migration, run seed:
npm run prisma:seed

# Verify:
psql -d furtail_db_new -c "SELECT COUNT(*) FROM bd_divisions;" # Expected: 8
psql -d furtail_db_new -c "SELECT COUNT(*) FROM bd_districts;" # Expected: 64
psql -d furtail_db_new -c "SELECT COUNT(*) FROM bd_upazilas;"  # Expected: 491
psql -d furtail_db_new -c "SELECT COUNT(*) FROM bd_unions;"    # Expected: 4,554
```

---

## Data Validation Checklist

### Pre-Seed Validation

- [ ] Location JSON files have correct structure (id, code, nameEn, nameBn, lat/lng)
- [ ] Animal reference JSON files have required fields
- [ ] No missing foreign keys (district.divisionId all valid)
- [ ] Unique constraints honored (no duplicate codes, names)
- [ ] Timestamps reasonable (createdAt < updatedAt)
- [ ] Row counts match expected estimates

### Post-Seed Validation

```sql
-- Verify divisions
SELECT COUNT(*) FROM bd_divisions;  -- Expected: 8

-- Verify referential integrity
SELECT COUNT(*) FROM bd_districts WHERE division_id IS NULL;  -- Expected: 0

-- Verify bilingual data
SELECT COUNT(*) FROM bd_divisions WHERE name_bn IS NULL;  -- Count nulls (OK)

-- Verify animal types
SELECT COUNT(*) FROM animal_types;  -- Expected: ~100+

-- Verify breed counts
SELECT animal_type_id, COUNT(*) as breed_count 
  FROM breeds 
  GROUP BY animal_type_id 
  ORDER BY breed_count DESC;
```

---

## Rollback Strategy (If Seed Fails)

**Safe approach:** All seed data is reference data, can be safely deleted and re-imported

```sql
-- Truncate seed tables (in new database only)
TRUNCATE TABLE bd_areas CASCADE;
TRUNCATE TABLE bd_unions CASCADE;
TRUNCATE TABLE bd_upazilas CASCADE;
TRUNCATE TABLE bd_districts CASCADE;
TRUNCATE TABLE bd_divisions CASCADE;

TRUNCATE TABLE breeds CASCADE;
TRUNCATE TABLE breeds CASCADE;
TRUNCATE TABLE animal_colors CASCADE;
TRUNCATE TABLE coat_patterns CASCADE;
TRUNCATE TABLE animal_sizes CASCADE;
TRUNCATE TABLE animal_types CASCADE;
TRUNCATE TABLE animal_categories CASCADE;

-- Re-run seed
npm run prisma:seed
```

---

## Migration Timing

**When to Import Data:**

1. ✅ **After initial Prisma migration** (core models created)
2. ✅ **Before activating new API endpoints** (location/animal endpoints)
3. ✅ **Before testing Flutter app** (needs location dropdown populated)
4. ❌ **Not before:** Doesn't need to wait for user data migration

**Timeline:**
- T-2 days: Extract reference data from legacy
- T-1 days: Load into dev/staging for testing
- T 0:00:  Seed production database during cutover

---

## Example Seed Row Counts

### Bangladesh Locations (Example Partial Extract)

| Level | Sample Entry | Code | Lat | Lng |
|-------|---|---|---|---|
| Division | Dhaka | BD-DH | 23.8103 | 90.4125 |
| District | Dhaka | BD-DH-01 | 23.8103 | 90.4125 |
| Upazila | Adabor | BD-DH-01-01 | 23.7700 | 90.3600 |
| Union | Kakrail | BD-DH-01-01-001 | 23.7500 | 90.3500 |
| Area | Ward 1 | BD-DH-01-01-001-W01 | 23.7450 | 90.3450 |

### Animal References (Example)

| Category | Type | Breed | Size |
|----------|------|-------|------|
| Mammals | Dog | German Shepherd | Large |
| Mammals | Dog | Labrador | Large |
| Mammals | Cat | Persian | Medium |
| Mammals | Cat | Siamese | Small |
| Birds | Parrot | Macaw | Large |
| Birds | Parrot | Cockatiel | Small |

---

## Conclusion

**Reference Data Import Strategy:**

1. ✅ **Required:** BdDivision through BdArea (location hierarchy)
2. ✅ **Required:** AnimalCategory through CoatPattern (animal taxonomy)
3. ✅ **Recommended:** Store in JSON files (git-tracked, auditable)
4. ✅ **Safe:** All reference data (read-only, no transactional writes)
5. ✅ **Reversible:** Can be truncated and re-seeded if needed

**Next Step:** DB Step 2 will create seed infrastructure and load this data without connecting to a database.

