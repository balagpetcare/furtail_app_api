# Animal Taxonomy Data Model

**Status:** Implemented in Prisma schema (DB Step 2)  
**Database:** PostgreSQL via Prisma ORM  
**Scope:** Animal reference data (categories, types, sizes, colors, patterns, breeds)  

---

## Animal Taxonomy Hierarchy

The animal system models a flexible taxonomy for pet classification:

```
AnimalCategory (top-level category, e.g., "Mammals")
└── AnimalType (species, e.g., "Dog")
    ├── Breed (breed variant, e.g., "German Shepherd")
    │   └── AnimalSize (default size for breed)
    ├── AnimalSize (reference table for all sizes)
    └── AnimalColor & CoatPattern (lookup tables)
```

---

## Models

### AnimalCategory

Top-level animal grouping (Mammals, Birds, Reptiles, etc.).

```prisma
model AnimalCategory {
  id           Int           @id @default(autoincrement())
  code         String        @unique
  name         String
  displayOrder Int           @default(0)
  isActive     Boolean       @default(true)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  animalTypes  AnimalType[]
  @@map("animal_categories")
}
```

**Fields:**
- `id`: Primary key
- `code`: Unique identifier (e.g., "MAMMAL", "BIRD")
- `name`: Display name
- `displayOrder`: Sort order in UI dropdowns
- `isActive`: Soft delete flag

**Example Data:**
- Mammals
- Birds
- Reptiles
- Aquatic Animals

---

### AnimalType

Species or animal type (Dog, Cat, Rabbit, etc.).

```prisma
model AnimalType {
  id             Int             @id @default(autoincrement())
  name           String          @unique
  categoryId     Int?
  code           String?         @unique
  scientificName String?         @db.VarChar(128)
  icon           String?         @db.VarChar(64)
  displayOrder   Int             @default(0)
  isActive       Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  category       AnimalCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  breeds         Breed[]
  @@index([categoryId])
  @@map("animal_types")
}
```

**Fields:**
- `name`: Unique species name (e.g., "Dog")
- `categoryId`: Optional parent category (SetNull if deleted)
- `code`: Unique code for lookups (e.g., "DOG")
- `scientificName`: Latin name (optional, e.g., "Canis lupus familiaris")
- `icon`: Emoji or icon identifier (e.g., "🐕")
- `displayOrder`: Sort order in dropdowns
- `isActive`: Soft delete flag

**Example Data:**
- Dog (Canis lupus familiaris, 🐕)
- Cat (Felis catus, 🐈)
- Rabbit (Oryctolagus cuniculus, 🐰)
- Parrot (Psittacidae, 🦜)
- Fish (various, 🐠)

---

### AnimalSize

Standard size categories for pets.

```prisma
model AnimalSize {
  id           Int       @id @default(autoincrement())
  code         String    @unique
  name         String
  minWeightKg  Float?
  maxWeightKg  Float?
  displayOrder Int       @default(0)
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  breeds       Breed[]
  @@map("animal_sizes")
}
```

**Fields:**
- `code`: Unique size code (e.g., "XS", "S", "M", "L", "XL")
- `name`: Display name with range (e.g., "Extra Small (0-2 kg)")
- `minWeightKg`, `maxWeightKg`: Optional weight range

**Example Data:**
- XS: Extra Small (0-2 kg)
- S: Small (2-5 kg)
- M: Medium (5-15 kg)
- L: Large (15-30 kg)
- XL: Extra Large (30+ kg)

---

### AnimalColor

Coat color palette for pet description.

```prisma
model AnimalColor {
  id           Int       @id @default(autoincrement())
  code         String    @unique
  name         String
  hexPreview   String?   @db.VarChar(16)
  displayOrder Int       @default(0)
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@map("animal_colors")
}
```

**Example Data:**
- Black (#000000)
- White (#FFFFFF)
- Brown (#8B4513)
- Red (#FF0000)
- Yellow (#FFFF00)
- Tri-color (multiple)
- Spotted (pattern)

---

### CoatPattern

Fur or scale patterns (Solid, Striped, Spotted, etc.).

```prisma
model CoatPattern {
  id           Int       @id @default(autoincrement())
  code         String    @unique
  name         String
  displayOrder Int       @default(0)
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@map("coat_patterns")
}
```

**Example Data:**
- Solid
- Striped
- Spotted
- Patched
- Brindle
- Merle
- Tabby

---

### Breed

Specific breed within an animal type.

```prisma
model Breed {
  id             Int         @id @default(autoincrement())
  name           String
  animalTypeId   Int
  code           String?     @db.VarChar(64)
  aliasNames     Json?
  originCountry  String?     @db.VarChar(64)
  defaultSizeId  Int?
  isMixed        Boolean     @default(false)
  isOther        Boolean     @default(false)
  displayOrder   Int         @default(0)
  isActive       Boolean     @default(true)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  animalType     AnimalType  @relation(fields: [animalTypeId], references: [id], onDelete: Cascade)
  defaultSize    AnimalSize? @relation(fields: [defaultSizeId], references: [id], onDelete: SetNull)
  @@unique([name, animalTypeId])
  @@index([animalTypeId])
  @@index([defaultSizeId])
  @@map("breeds")
}
```

**Fields:**
- `name`: Breed name (e.g., "German Shepherd")
- `animalTypeId`: Parent animal type (required, Cascade delete)
- `code`: Unique code per type (e.g., "GERMAN_SHEPHERD")
- `aliasNames`: JSON array of alternate breed names (e.g., ["GSD", "Alsatian"])
- `originCountry`: Country of origin (e.g., "Germany")
- `defaultSizeId`: Typical size for this breed
- `isMixed`: True for crossbreeds/mixed breeds
- `isOther`: True for "Other" category
- **Unique Constraint:** (name, animalTypeId) — prevents duplicate breed names within same type

**Example Data for Dogs:**
- German Shepherd (Germany, defaultSize: Large)
- Labrador (Canada, defaultSize: Large)
- Golden Retriever (Scotland, defaultSize: Large)
- Poodle (France, defaultSize: varies)
- Shih Tzu (China, defaultSize: Small)
- Mixed Breed (isMixed: true)
- Other (isOther: true)

---

## Flutter Integration

### Pet Creation Flow

1. User selects **AnimalType** (Dog, Cat, etc.)
2. Based on type, show **Breed** dropdown (filtered by animalTypeId)
3. Show **AnimalSize** (can override breed default)
4. Show **AnimalColor** (multi-select or dropdown)
5. Show **CoatPattern** (optional)

### API Endpoints (Required)

Implement the following endpoints to support Flutter:

```typescript
// GET /api/v1/animals/categories?isActive=true
// GET /api/v1/animals/types?categoryId=1&isActive=true
// GET /api/v1/animals/breeds?animalTypeId=1&isActive=true
// GET /api/v1/animals/sizes?isActive=true
// GET /api/v1/animals/colors?isActive=true
// GET /api/v1/animals/coat-patterns?isActive=true
```

All endpoints should support:
- Filtering: `isActive=true` (soft delete)
- Pagination: `page`, `pageSize`
- Sorting: `orderBy=displayOrder` (respects UI order)

---

## Data Migration

### Source

Animal reference data is seeded from:
- `prisma/seeds/data/animal-categories.json`
- `prisma/seeds/data/animal-types.json`
- `prisma/seeds/data/animal-sizes.json`
- `prisma/seeds/data/animal-colors.json`
- `prisma/seeds/data/coat-patterns.json`
- `prisma/seeds/data/breeds.json`

Loaded via `prisma/seed/animals/animal-references.ts`

### Idempotency

All seed operations use `upsert` with unique keys:

```typescript
// Category upsert by code
prisma.animalCategory.upsert({
  where: { code: 'MAMMAL' },
  update: {},
  create: { code: 'MAMMAL', name: 'Mammals' }
})

// Type upsert by name
prisma.animalType.upsert({
  where: { name: 'Dog' },
  update: { displayOrder: 1 },  // Can update display order on re-run
  create: { name: 'Dog', categoryId: 1 }
})

// Breed upsert by compound key (name + animalTypeId)
prisma.breed.upsert({
  where: { name_animalTypeId: { name: 'German Shepherd', animalTypeId: 1 } },
  update: {},
  create: { name: 'German Shepherd', animalTypeId: 1 }
})
```

### Row Count Expectations

| Model | Expected Count | Status |
|-------|---|---|
| AnimalCategory | ~10 | ✓ Known |
| AnimalType | ~100-200 | ✓ Known |
| AnimalSize | ~10 | ✓ Known |
| AnimalColor | ~20-30 | ✓ Known |
| CoatPattern | ~15-25 | ✓ Known |
| Breed | ~1,000-5,000 | ✓ Known (varies by type coverage) |

---

## Constraints & Validation

- **Type Uniqueness:** Each animal type name is globally unique
- **Breed-Type Uniqueness:** Each breed name is unique within its animal type
- **Cascade Delete:** Deleting an AnimalType cascades to all its breeds
- **Soft Delete:** `isActive` flag allows hiding without data loss
- **Display Order:** Controls UI dropdown sort order (lower = first)
- **Alias Names:** JSON array for alternative breed names (e.g., alternate spellings)

---

## Notes

- All animal reference data is **read-only** after seeding
- Seeding is **idempotent** (safe to re-run)
- **No medical or pet-instance tables** in this model (deferred to later phases)
- **Future:** Could add vaccine types, allergies, dietary requirements, etc.

