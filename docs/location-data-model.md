# Location Data Model

**Status:** Implemented in Prisma schema (DB Step 2)  
**Database:** PostgreSQL via Prisma ORM  
**Scope:** Bangladesh administrative hierarchy + worldwide location support  

---

## Bangladesh Administrative Hierarchy

The location system models Bangladesh's five-level administrative hierarchy:

```
BdDivision (8 total)
├── BdDistrict (64 total)
│   ├── BdUpazila (491 total)
│   │   ├── BdUnion (4,554 total)
│   │   └── BdArea (flexible)
│   └── BdArea (direct under district)
└── BdArea (flexible placement)
```

### Models

#### BdDivision

Top-level administrative region (e.g., Dhaka, Chittagong).

```prisma
model BdDivision {
  id        Int         @id @default(autoincrement())
  code      String      @unique
  nameEn    String
  nameBn    String?
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  districts BdDistrict[]
  @@map("bd_divisions")
}
```

**Fields:**
- `id`: Primary key (autoincrement)
- `code`: Unique identifier (e.g., "BD-DH" for Dhaka)
- `nameEn`: English name (required)
- `nameBn`: Bengali name (optional, graceful degradation)
- `createdAt`, `updatedAt`: Audit timestamps

#### BdDistrict

Mid-level district or county (e.g., Dhaka District).

```prisma
model BdDistrict {
  id        Int         @id @default(autoincrement())
  code      String      @unique
  nameEn    String
  nameBn    String?
  divisionId Int
  latitude  Decimal?    @db.Decimal(10, 8)
  longitude Decimal?    @db.Decimal(11, 8)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  division  BdDivision  @relation(fields: [divisionId], references: [id], onDelete: Cascade)
  upazilas  BdUpazila[]
  areas     BdArea[]    @relation("BdDistrictAreas")
  @@index([divisionId])
  @@map("bd_districts")
}
```

**Key Features:**
- Bilingual names (English + Bengali)
- Geographic coordinates (Decimal precision 10,8 for latitude, 11,8 for longitude)
- Parent-child relation: Division → Districts (Cascade delete)
- Can have direct areas (bypassing Upazila/Union)

#### BdUpazila

Sub-district administrative unit.

```prisma
model BdUpazila {
  id        Int         @id @default(autoincrement())
  code      String      @unique
  nameEn    String
  nameBn    String?
  districtId Int
  latitude  Decimal?    @db.Decimal(10, 8)
  longitude Decimal?    @db.Decimal(11, 8)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  district  BdDistrict  @relation(fields: [districtId], references: [id], onDelete: Cascade)
  unions    BdUnion[]
  areas     BdArea[]
  @@index([districtId])
  @@map("bd_upazilas")
}
```

#### BdUnion

Sub-upazila administrative unit.

```prisma
model BdUnion {
  id        Int         @id @default(autoincrement())
  code      String      @unique
  nameEn    String
  nameBn    String?
  upazilaId Int
  latitude  Decimal?    @db.Decimal(10, 8)
  longitude Decimal?    @db.Decimal(11, 8)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  upazila   BdUpazila   @relation(fields: [upazilaId], references: [id], onDelete: Cascade)
  areas     BdArea[]
  @@index([upazilaId])
  @@map("bd_unions")
}
```

#### BdArea

Flexible area designation (ward, neighborhood, etc.): can be placed at any level or as a sub-area.

```prisma
model BdArea {
  id        Int         @id @default(autoincrement())
  code      String      @unique
  nameEn    String
  nameBn    String?
  type      String      // "UNION", "AREA", "WARD", "WARD_NO", etc.
  unionId   Int?
  upazilaId Int?
  districtId Int?
  parentId  Int?
  latitude  Decimal?    @db.Decimal(10, 8)
  longitude Decimal?    @db.Decimal(11, 8)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  union     BdUnion?    @relation(fields: [unionId], references: [id], onDelete: SetNull)
  upazila   BdUpazila?  @relation(fields: [upazilaId], references: [id], onDelete: SetNull)
  district  BdDistrict? @relation("BdDistrictAreas", fields: [districtId], references: [id], onDelete: SetNull)
  parent    BdArea?     @relation("BdAreaHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children  BdArea[]    @relation("BdAreaHierarchy")
  @@index([unionId])
  @@index([upazilaId])
  @@index([districtId])
  @@index([type])
  @@map("bd_areas")
}
```

**Key Features:**
- Flexible placement: can be under Union, Upazila, District, or Division
- `type` field: STRING for flexibility (allows "WARD", "WARD_NO", "AREA", "UNION", etc.)
- Self-referential hierarchy: `parentId` → `BdArea` (supports nesting within areas)
- Foreign keys use `onDelete: SetNull` for flexibility (non-cascade, allows orphaned areas)
- Multiple indexes for efficient queries

---

## API Integration Points

### Location Endpoints (Required)

Implement the following endpoints to match legacy API contracts:

```typescript
// GET /api/v1/location-master/divisions
// GET /api/v1/location-master/districts?divisionId=1
// GET /api/v1/location-master/upazilas?districtId=1
// GET /api/v1/location-master/unions?upazilaId=1
// GET /api/v1/location-master/areas?unionId=1
// GET /api/v1/location-master/search?q=dhaka&level=DISTRICT
// POST /api/v1/location-master/validate-selection { divisionId, districtId, upazilaId, unionId }
```

All endpoints must support:
- Pagination: `page`, `pageSize` (or `limit`)
- Locale: `locale=en` or `locale=bn` (defaults to `en`)
- Search: `q` parameter for full-text search

---

## Usage in Flutter App

Flutter uses location data for:
1. Pet adoption location selection (dropdown hierarchy)
2. User profile location representation
3. Post location tagging
4. Location-based search/filtering

The Flutter app expects this exact endpoint structure and response format (see legacy `locationMasterDivisions`, etc. in `api_endpoints.dart`).

---

## Data Migration

### Source

Location data is imported from legacy database:
- Extracted during DB cutover window
- Stored in `prisma/seeds/data/bd-locations.json`
- Loaded via `prisma/seed/locations/bd-locations.ts`

### Idempotency

All seed operations use `upsert` with `code` as unique key:
```typescript
prisma.bdDivision.upsert({
  where: { code: 'BD-DH' },
  update: {},  // No changes on re-run
  create: { code: 'BD-DH', nameEn: 'Dhaka', ... }
})
```

This ensures re-running the seed is safe (no duplicates).

### Row Count Expectations

| Model | Expected Count | Status |
|-------|---|---|
| BdDivision | 8 | ✓ Known |
| BdDistrict | 64 | ✓ Known |
| BdUpazila | 491 | ✓ Known |
| BdUnion | 4,554 | ✓ Known |
| BdArea | ~10,000+ | TBD (will be determined during data migration) |

---

## Future: Worldwide Location Support

For future expansion to worldwide location hierarchy:

1. Create a generic `Location` model (polymorphic design):
   ```prisma
   model Location {
     id       Int
     level    String  // "COUNTRY", "REGION", "CITY", etc.
     code     String
     nameEn   String
     nameBn   String?
     latitude Decimal?
     longitude Decimal?
     parentId Int?
     parent   Location? @relation(fields: [parentId], references: [id])
     children Location[] @relation("ChildLocations")
   }
   ```

2. Or keep Bangladesh separate and add new tables for other countries/regions

3. Document hierarchy per country to ensure proper parent-child constraints

---

## Constraints & Validation

- **Uniqueness:** Each `code` must be unique per model
- **Hierarchy:** Every district/upazila/union must have a valid parent
- **Cascade Delete:** Deleting a division cascades to all child districts
- **Soft Delete:** Areas use `SetNull` on parent deletion (preserves orphaned records)
- **Coordinates:** Optional but when present, must be valid (latitude -90 to 90, longitude -180 to 180)

---

## Notes

- All location data is **read-only** (no writes after seeding)
- Seeding is **idempotent** (safe to re-run)
- Seeding is **transaction-aware** (atomic operations)
- No active/inactive flag on location models (unlike animal taxonomy)

