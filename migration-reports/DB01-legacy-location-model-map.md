# DB01 — Legacy Location & Reference-Data Model Map

**Purpose:** Exact Prisma schema definitions from legacy API for safe migration to new API  
**Status:** Read-only audit (no database connections, no schema changes)

---

## Bangladesh Administrative Hierarchy Models

### Model 1: BdDivision

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model BdDivision {
  id                  Int                  @id @default(autoincrement())
  code                String               @unique
  nameEn              String
  nameBn              String?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  districts           BdDistrict[]
  fundraisingAccounts FundraisingAccount[]

  @@map("bd_divisions")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | Unique code (e.g., "BD-DH") |
| nameEn | String | Required | Division name in English |
| nameBn | String | Optional | Division name in Bengali |
| createdAt | DateTime | default: now() | Creation timestamp |
| updatedAt | DateTime | Auto-updated | Last modification timestamp |
| districts | BdDistrict[] | Relation (1→many) | Child divisions (64 per country) |
| fundraisingAccounts | FundraisingAccount[] | Relation | Not in scope for new API |

**Used By:**
- Flutter location selector (UI dropdown)
- Legacy fundraising coverage mapping
- Legacy location search/list endpoints

---

### Model 2: BdDistrict

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model BdDistrict {
  id                  Int                  @id @default(autoincrement())
  code                String               @unique
  nameEn              String
  nameBn              String?
  divisionId          Int
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  latitude            Decimal?             @db.Decimal(10, 8)
  longitude           Decimal?             @db.Decimal(11, 8)
  areas               BdArea[]             @relation("BdDistrictAreas")
  division            BdDivision           @relation(fields: [divisionId], references: [id], onDelete: Cascade)
  upazilas            BdUpazila[]
  fundraisingAccounts FundraisingAccount[]
  coverageZoneAreas   CoverageZoneArea[]

  @@map("bd_districts")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | Unique code (e.g., "BD-DH-01") |
| nameEn | String | Required | District name in English |
| nameBn | String | Optional | District name in Bengali |
| divisionId | Int | Required FK | Foreign key to BdDivision (Cascade delete) |
| latitude | Decimal | Optional, 10,8 precision | Geographic coordinate |
| longitude | Decimal | Optional, 11,8 precision | Geographic coordinate |
| createdAt | DateTime | default: now() | Creation timestamp |
| updatedAt | DateTime | Auto-updated | Last modification timestamp |
| division | BdDivision | Relation (FK: divisionId) | Parent division |
| upazilas | BdUpazila[] | Relation (1→many) | Child upazilas (491 total) |
| areas | BdArea[] | Relation (1→many) | Direct areas (BdDistrictAreas) |
| fundraisingAccounts | FundraisingAccount[] | Relation | Not in scope for new API |
| coverageZoneAreas | CoverageZoneArea[] | Relation | Not in scope for new API |

**Used By:**
- Flutter location selector (nested under Division)
- Adoption pet location listing
- User profile location representation

---

### Model 3: BdUpazila

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model BdUpazila {
  id                  Int                  @id @default(autoincrement())
  code                String               @unique
  nameEn              String
  nameBn              String?
  districtId          Int
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  latitude            Decimal?             @db.Decimal(10, 8)
  longitude           Decimal?             @db.Decimal(11, 8)
  areas               BdArea[]
  unions              BdUnion[]
  district            BdDistrict           @relation(fields: [districtId], references: [id], onDelete: Cascade)
  fundraisingAccounts FundraisingAccount[]
  coverageZoneAreas   CoverageZoneArea[]

  @@map("bd_upazilas")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | Unique code (e.g., "BD-DH-01-01") |
| nameEn | String | Required | Upazila name in English |
| nameBn | String | Optional | Upazila name in Bengali |
| districtId | Int | Required FK | Foreign key to BdDistrict (Cascade delete) |
| latitude | Decimal | Optional, 10,8 precision | Geographic coordinate |
| longitude | Decimal | Optional, 11,8 precision | Geographic coordinate |
| createdAt | DateTime | default: now() | Creation timestamp |
| updatedAt | DateTime | Auto-updated | Last modification timestamp |
| district | BdDistrict | Relation (FK: districtId) | Parent district |
| unions | BdUnion[] | Relation (1→many) | Child unions |
| areas | BdArea[] | Relation (1→many) | Direct areas |
| fundraisingAccounts | FundraisingAccount[] | Relation | Not in scope for new API |
| coverageZoneAreas | CoverageZoneArea[] | Relation | Not in scope for new API |

**Used By:**
- Flutter location selector (nested under District)
- Adoption pet granular location filtering
- User profile detailed location

---

### Model 4: BdUnion

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model BdUnion {
  id                  Int                  @id @default(autoincrement())
  code                String               @unique
  nameEn              String
  nameBn              String?
  upazilaId           Int
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  latitude            Decimal?             @db.Decimal(10, 8)
  longitude           Decimal?             @db.Decimal(11, 8)
  upazila             BdUpazila            @relation(fields: [upazilaId], references: [id], onDelete: Cascade)
  fundraisingAccounts FundraisingAccount[]
  areas               BdArea[]

  @@map("bd_unions")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | Unique code (e.g., "BD-DH-01-01-001") |
| nameEn | String | Required | Union name in English |
| nameBn | String | Optional | Union name in Bengali |
| upazilaId | Int | Required FK | Foreign key to BdUpazila (Cascade delete) |
| latitude | Decimal | Optional, 10,8 precision | Geographic coordinate |
| longitude | Decimal | Optional, 11,8 precision | Geographic coordinate |
| createdAt | DateTime | default: now() | Creation timestamp |
| updatedAt | DateTime | Auto-updated | Last modification timestamp |
| upazila | BdUpazila | Relation (FK: upazilaId) | Parent upazila |
| areas | BdArea[] | Relation (1→many) | Child areas (sub-union administrative divisions) |
| fundraisingAccounts | FundraisingAccount[] | Relation | Not in scope for new API |

**Used By:**
- Flutter location selector (fine-grained location selection)
- Local government administrative boundaries

---

### Model 5: BdArea

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model BdArea {
  id                  Int                  @id @default(autoincrement())
  code                String               @unique
  nameEn              String
  nameBn              String?
  type                String               // "UNION", "AREA", "WARD", "WARD_NO", etc.
  unionId             Int?
  upazilaId           Int?
  districtId          Int?
  parentId            Int?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  latitude            Decimal?             @db.Decimal(10, 8)
  longitude           Decimal?             @db.Decimal(11, 8)
  // Additional relations: ward, coverageZones, etc.

  @@map("bd_areas")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | Unique code |
| nameEn | String | Required | Area name in English |
| nameBn | String | Optional | Area name in Bengali |
| type | String | Required (no enum) | Flexible type: "UNION", "AREA", "WARD", "WARD_NO" |
| unionId | Int | Optional FK | Foreign key to BdUnion (nullable) |
| upazilaId | Int | Optional FK | Foreign key to BdUpazila (nullable) |
| districtId | Int | Optional FK | Foreign key to BdDistrict (nullable) |
| parentId | Int | Optional FK | Self-reference for nested hierarchies |
| latitude | Decimal | Optional, 10,8 precision | Geographic coordinate |
| longitude | Decimal | Optional, 11,8 precision | Geographic coordinate |
| createdAt | DateTime | default: now() | Creation timestamp |
| updatedAt | DateTime | Auto-updated | Last modification timestamp |

**Design Note:** Type field is STRING (not enum) for flexibility in administrative divisions (wards, sub-areas, neighborhoods, etc.)

**Used By:**
- Fine-grained location representation
- Nested administrative boundaries
- Neighborhood-level selection

---

## Animal Reference Data Models

### Model 6: AnimalCategory

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model AnimalCategory {
  id           Int          @id @default(autoincrement())
  code         String       @unique
  name         String
  displayOrder Int          @default(0)
  isActive     Boolean      @default(true)
  animalTypes  AnimalType[]

  @@map("animal_categories")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | e.g., "MAMMAL", "BIRD", "REPTILE" |
| name | String | Required | Display name |
| displayOrder | Int | default: 0 | Sort order in UI |
| isActive | Boolean | default: true | Soft delete flag |
| animalTypes | AnimalType[] | Relation (1→many) | Child animal types |

**Example Data:** Mammals, Birds, Reptiles, Aquatic Animals

---

### Model 7: AnimalType

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model AnimalType {
  id             Int             @id @default(autoincrement())
  name           String          @unique
  categoryId     Int?
  code           String?         @unique
  scientificName String?         @db.VarChar(128)
  icon           String?         @db.VarChar(64)
  displayOrder   Int?            @default(0)
  isActive       Boolean?        @default(true)
  category       AnimalCategory? @relation(fields: [categoryId], references: [id])
  breeds         Breed[]
  pets           Pet[]
  vaccineTypes   VaccineType[]
  campaignPets   CampaignPet[]   @relation("CampaignPetAnimalType")

  @@map("animal_types")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| name | String | @unique | e.g., "Dog", "Cat", "Rabbit" |
| categoryId | Int | Optional FK | Foreign key to AnimalCategory (nullable for flexibility) |
| code | String | Optional @unique | e.g., "DOG", "CAT" |
| scientificName | String | Optional, max 128 | e.g., "Canis lupus familiaris" |
| icon | String | Optional, max 64 | Emoji or icon code (e.g., "🐕") |
| displayOrder | Int | default: 0 | Sort order in dropdown |
| isActive | Boolean | default: true | Soft delete flag |
| category | AnimalCategory | Relation (FK: categoryId) | Parent category |
| breeds | Breed[] | Relation (1→many) | Available breeds for this type |
| pets | Pet[] | Relation (1→many) | Pets of this type |
| vaccineTypes | VaccineType[] | Relation | Vaccines applicable to this type |
| campaignPets | CampaignPet[] | Relation | Pets used in campaigns |

**Example Data:** Dog, Cat, Rabbit, Bird, Fish

**Used By:**
- Pet creation form (primary selection)
- Fundraising campaign type filtering
- Adoption pet listings

---

### Model 8: AnimalSize

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model AnimalSize {
  id            Int     @id @default(autoincrement())
  code          String  @unique
  name          String
  minWeightKg   Float?
  maxWeightKg   Float?
  displayOrder  Int     @default(0)
  isActive      Boolean @default(true)
  breedsDefault Breed[]
  pets          Pet[]

  @@map("animal_sizes")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | e.g., "XS", "S", "M", "L", "XL" |
| name | String | Required | e.g., "Extra Small (0-2 kg)" |
| minWeightKg | Float | Optional | Minimum weight in kilograms |
| maxWeightKg | Float | Optional | Maximum weight in kilograms |
| displayOrder | Int | default: 0 | Sort order in dropdown |
| isActive | Boolean | default: true | Soft delete flag |
| breedsDefault | Breed[] | Relation (1→many) | Breeds with this as default size |
| pets | Pet[] | Relation (1→many) | Pets of this size |

**Example Data:** Extra Small (0-2kg), Small (2-5kg), Medium (5-15kg), Large (15-30kg), Extra Large (30+ kg)

---

### Model 9: AnimalColor

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model AnimalColor {
  id           Int     @id @default(autoincrement())
  code         String  @unique
  name         String
  hexPreview   String? @db.VarChar(16)
  displayOrder Int     @default(0)
  isActive     Boolean @default(true)
  pets         Pet[]

  @@map("animal_colors")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | e.g., "BLACK", "WHITE", "BROWN" |
| name | String | Required | Display name |
| hexPreview | String | Optional, max 16 | Hex color code (e.g., "#000000") for UI preview |
| displayOrder | Int | default: 0 | Sort order in dropdown |
| isActive | Boolean | default: true | Soft delete flag |
| pets | Pet[] | Relation (1→many) | Pets with this color |

**Example Data:** Black, White, Brown, Red, Yellow, Spotted, Tri-color

---

### Model 10: CoatPattern

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model CoatPattern {
  id           Int     @id @default(autoincrement())
  code         String  @unique
  name         String
  displayOrder Int     @default(0)
  isActive     Boolean @default(true)
  pets         Pet[]

  @@map("coat_patterns")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| code | String | @unique | e.g., "SOLID", "STRIPED", "SPOTTED" |
| name | String | Required | Display name |
| displayOrder | Int | default: 0 | Sort order in dropdown |
| isActive | Boolean | default: true | Soft delete flag |
| pets | Pet[] | Relation (1→many) | Pets with this coat pattern |

**Example Data:** Solid, Striped, Spotted, Patched, Brindle, Merle

---

### Model 11: Breed

**Source File:** `D:\wpa\furtail\furtail_api\prisma\schema.prisma`

```prisma
model Breed {
  id            Int           @id @default(autoincrement())
  name          String
  animalTypeId  Int
  code          String?       @db.VarChar(64)
  aliasNames    Json?
  originCountry String?       @db.VarChar(64)
  defaultSizeId Int?
  isMixed       Boolean       @default(false)
  isOther       Boolean       @default(false)
  displayOrder  Int?          @default(0)
  isActive      Boolean?      @default(true)
  animalType    AnimalType    @relation(fields: [animalTypeId], references: [id])
  defaultSize   AnimalSize?   @relation(fields: [defaultSizeId], references: [id])
  pets          Pet[]
  subBreeds     SubBreed[]
  campaignPets  CampaignPet[] @relation("CampaignPetBreed")

  @@unique([name, animalTypeId])
  @@map("breeds")
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | Int | @id, autoincrement | Primary key |
| name | String | Required, @unique with animalTypeId | e.g., "German Shepherd", "Labrador" |
| animalTypeId | Int | Required FK | Foreign key to AnimalType (Cascade delete) |
| code | String | Optional, max 64 | e.g., "GERMAN_SHEPHERD" |
| aliasNames | Json | Optional | Array of alternative breed names |
| originCountry | String | Optional, max 64 | e.g., "Germany", "Canada" |
| defaultSizeId | Int | Optional FK | Foreign key to AnimalSize (default for this breed) |
| isMixed | Boolean | default: false | True for mixed/crossbreed |
| isOther | Boolean | default: false | True for "Other" category |
| displayOrder | Int | default: 0 | Sort order in dropdown |
| isActive | Boolean | default: true | Soft delete flag |
| animalType | AnimalType | Relation (FK: animalTypeId) | Parent animal type |
| defaultSize | AnimalSize | Relation (FK: defaultSizeId) | Default size for this breed |
| pets | Pet[] | Relation (1→many) | Pets of this breed |
| subBreeds | SubBreed[] | Relation (1→many) | Sub-breeds or variants |
| campaignPets | CampaignPet[] | Relation | Pets used in campaigns |

**Unique Constraint:** (name, animalTypeId) — prevents duplicate breed names within same animal type

**Example Data for Dogs:**
- German Shepherd, Labrador, Golden Retriever, Poodle, Boxer, Beagle, Shih Tzu, etc.

**Used By:**
- Pet creation form (nested under AnimalType)
- Fundraising campaign filtering
- Adoption pet listings

---

### Model 12: SubBreed

**Reference:** Exists in legacy schema for breed variants/sub-categories  
**Status:** Not detailed in this audit; can be imported if campaigns use it

---

## Data Ownership & Migration Scope

### Import into New API (MVP Scope)

**Required:**
- ✅ BdDivision, BdDistrict, BdUpazila, BdUnion, BdArea
- ✅ AnimalCategory, AnimalType, AnimalSize, AnimalColor, CoatPattern, Breed

**Rationale:**
- Flutter app depends on these via location endpoints
- Pet/adoption features require animal type references
- Read-only reference data (no transactional writes)
- Safe to copy without modification

### Do NOT Import (Out of Scope)

- ❌ FundraisingAccount (enterprise feature, Phase 2)
- ❌ CoverageZoneArea (business logic, Phase 2)
- ❌ CampaignPet (campaign feature, Phase 2)
- ❌ SubBreed (optional, not actively used)

---

## Model Dependencies (Cascade Delete)

**Chain for Safe Deletion:**

```
BdDivision
  ├─ BdDistrict (cascade on division delete)
  │   ├─ BdUpazila (cascade on district delete)
  │   │   ├─ BdUnion (cascade on upazila delete)
  │   │   └─ BdArea
  │   └─ BdArea (BdDistrictAreas relation)
```

**For Animals:**

```
AnimalCategory
  └─ AnimalType (nullable categoryId, no cascade needed)
      └─ Breed (cascade on type delete)
```

**Safety:** Use `onDelete: Cascade` for new API imports to maintain referential integrity

---

## Recommended Import Strategy

1. **Create Seed Script:** `prisma/seed.ts` (DB Step 2)
2. **Extract Legacy Data:** Query current legacy database (if available in production)
3. **Serialize as SQL/JSON:** Store in version-controlled file
4. **Apply in New Database:** Via seed script after migration
5. **Verify:** Row count checks post-migration

---

## Summary Table

| Model | Type | Scope | Row Count (Approx) | Dependencies |
|-------|------|-------|-----|------|
| BdDivision | Reference | ✅ Import | 8 | None |
| BdDistrict | Reference | ✅ Import | 64 | BdDivision |
| BdUpazila | Reference | ✅ Import | 491 | BdDistrict |
| BdUnion | Reference | ✅ Import | 4,554 | BdUpazila |
| BdArea | Reference | ✅ Import | ~10k+ | Mixed (flexible hierarchy) |
| AnimalCategory | Reference | ✅ Import | ~10 | None |
| AnimalType | Reference | ✅ Import | ~100 | AnimalCategory |
| AnimalSize | Reference | ✅ Import | ~10 | None |
| AnimalColor | Reference | ✅ Import | ~20 | None |
| CoatPattern | Reference | ✅ Import | ~20 | None |
| Breed | Reference | ✅ Import | ~1000+ | AnimalType, AnimalSize |

---

## Next Step

**DB Step 2** will implement these models in the new API schema and create seed infrastructure without connecting to a database.

