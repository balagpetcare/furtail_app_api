CREATE TABLE IF NOT EXISTS "pets" (
  "id" SERIAL PRIMARY KEY,
  "ownerUserId" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(160),
  "animalTypeId" INTEGER NOT NULL,
  "breedId" INTEGER,
  "subBreedId" INTEGER,
  "colorId" INTEGER,
  "coatPatternId" INTEGER,
  "sizeId" INTEGER,
  "customBreedText" VARCHAR(120),
  "customColorText" VARCHAR(80),
  "dateOfBirth" TIMESTAMP(3),
  "sex" VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
  "gender" VARCHAR(32),
  "microchipNumber" VARCHAR(80),
  "isRescue" BOOLEAN NOT NULL DEFAULT false,
  "isNeutered" BOOLEAN NOT NULL DEFAULT false,
  "foodHabits" TEXT,
  "healthDisorders" TEXT,
  "notes" TEXT,
  "bloodType" VARCHAR(32),
  "allergies" JSONB,
  "profilePicId" INTEGER,
  "coverMediaId" INTEGER,
  "bio" TEXT,
  "isPublicProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
  "visibility" VARCHAR(32) NOT NULL DEFAULT 'PRIVATE',
  "followersCount" INTEGER NOT NULL DEFAULT 0,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "originatingClientId" VARCHAR(128),
  "originatingClientAudience" VARCHAR(256),
  "identityDetails" JSONB,
  "archivedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pets_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pets_animalTypeId_fkey" FOREIGN KEY ("animalTypeId") REFERENCES "animal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pets_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "breeds"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pets_profilePicId_fkey" FOREIGN KEY ("profilePicId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pets_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pets_slug_key" ON "pets"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "pets_ownerUserId_microchipNumber_key" ON "pets"("ownerUserId", "microchipNumber");
CREATE INDEX IF NOT EXISTS "pets_ownerUserId_status_createdAt_idx" ON "pets"("ownerUserId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "pets_animalTypeId_breedId_idx" ON "pets"("animalTypeId", "breedId");
CREATE INDEX IF NOT EXISTS "pets_updatedAt_idx" ON "pets"("updatedAt");

CREATE TABLE IF NOT EXISTS "pet_vaccinations" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "vaccineName" VARCHAR(160) NOT NULL,
  "administeredAt" TIMESTAMP(3),
  "nextDueAt" TIMESTAMP(3),
  "veterinarian" VARCHAR(160),
  "batchNumber" VARCHAR(80),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_vaccinations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pet_vaccinations_petId_administeredAt_idx" ON "pet_vaccinations"("petId", "administeredAt");

CREATE TABLE IF NOT EXISTS "pet_medical_history_records" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "clinic" VARCHAR(160),
  "diagnosis" TEXT,
  "treatment" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_medical_history_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pet_medical_history_records_petId_occurredAt_idx" ON "pet_medical_history_records"("petId", "occurredAt");

CREATE TABLE IF NOT EXISTS "pet_weight_records" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "weightKg" DECIMAL(8,3) NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_weight_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pet_weight_records_petId_measuredAt_idx" ON "pet_weight_records"("petId", "measuredAt");

CREATE TABLE IF NOT EXISTS "pet_deworming_records" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "medicationName" VARCHAR(160) NOT NULL,
  "administeredAt" TIMESTAMP(3),
  "nextDueAt" TIMESTAMP(3),
  "dosage" VARCHAR(120),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_deworming_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pet_deworming_records_petId_administeredAt_idx" ON "pet_deworming_records"("petId", "administeredAt");

CREATE TABLE IF NOT EXISTS "pet_documents" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "mediaId" INTEGER NOT NULL,
  "uploadedById" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "documentType" VARCHAR(64),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_documents_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pet_documents_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pet_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pet_documents_petId_createdAt_idx" ON "pet_documents"("petId", "createdAt");
CREATE INDEX IF NOT EXISTS "pet_documents_mediaId_idx" ON "pet_documents"("mediaId");

CREATE TABLE IF NOT EXISTS "pet_posts" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "caption" TEXT,
  "mediaIds" JSONB,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_posts_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pet_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pet_posts_petId_createdAt_idx" ON "pet_posts"("petId", "createdAt");
CREATE INDEX IF NOT EXISTS "pet_posts_authorId_createdAt_idx" ON "pet_posts"("authorId", "createdAt");

CREATE TABLE IF NOT EXISTS "pet_follows" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_follows_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pet_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pet_follows_petId_userId_key" ON "pet_follows"("petId", "userId");
CREATE INDEX IF NOT EXISTS "pet_follows_userId_createdAt_idx" ON "pet_follows"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "pet_likes" (
  "id" SERIAL PRIMARY KEY,
  "petId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_likes_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pet_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pet_likes_petId_userId_key" ON "pet_likes"("petId", "userId");
CREATE INDEX IF NOT EXISTS "pet_likes_userId_createdAt_idx" ON "pet_likes"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "pet_create_idempotency_keys" (
  "id" SERIAL PRIMARY KEY,
  "ownerUserId" INTEGER NOT NULL,
  "scope" VARCHAR(64) NOT NULL DEFAULT 'pet.create',
  "key" VARCHAR(160) NOT NULL,
  "requestHash" VARCHAR(128),
  "petId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pet_create_idempotency_keys_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pet_create_idempotency_keys_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pet_create_idempotency_keys_scope_ownerUserId_key_key" ON "pet_create_idempotency_keys"("scope", "ownerUserId", "key");
CREATE INDEX IF NOT EXISTS "pet_create_idempotency_keys_ownerUserId_createdAt_idx" ON "pet_create_idempotency_keys"("ownerUserId", "createdAt");
