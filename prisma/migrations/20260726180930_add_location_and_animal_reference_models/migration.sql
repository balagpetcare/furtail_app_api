-- CreateTable
CREATE TABLE "bd_divisions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bd_divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bd_districts" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "divisionId" INTEGER NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bd_districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bd_upazilas" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "districtId" INTEGER NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bd_upazilas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bd_unions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "upazilaId" INTEGER NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bd_unions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bd_areas" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "type" TEXT NOT NULL,
    "unionId" INTEGER,
    "upazilaId" INTEGER,
    "districtId" INTEGER,
    "parentId" INTEGER,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bd_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER,
    "code" TEXT,
    "scientificName" VARCHAR(128),
    "icon" VARCHAR(64),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_sizes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minWeightKg" DOUBLE PRECISION,
    "maxWeightKg" DOUBLE PRECISION,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_colors" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hexPreview" VARCHAR(16),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coat_patterns" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coat_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "animalTypeId" INTEGER NOT NULL,
    "code" VARCHAR(64),
    "aliasNames" JSONB,
    "originCountry" VARCHAR(64),
    "defaultSizeId" INTEGER,
    "isMixed" BOOLEAN NOT NULL DEFAULT false,
    "isOther" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bd_divisions_code_key" ON "bd_divisions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bd_districts_code_key" ON "bd_districts"("code");

-- CreateIndex
CREATE INDEX "bd_districts_divisionId_idx" ON "bd_districts"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "bd_upazilas_code_key" ON "bd_upazilas"("code");

-- CreateIndex
CREATE INDEX "bd_upazilas_districtId_idx" ON "bd_upazilas"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "bd_unions_code_key" ON "bd_unions"("code");

-- CreateIndex
CREATE INDEX "bd_unions_upazilaId_idx" ON "bd_unions"("upazilaId");

-- CreateIndex
CREATE UNIQUE INDEX "bd_areas_code_key" ON "bd_areas"("code");

-- CreateIndex
CREATE INDEX "bd_areas_unionId_idx" ON "bd_areas"("unionId");

-- CreateIndex
CREATE INDEX "bd_areas_upazilaId_idx" ON "bd_areas"("upazilaId");

-- CreateIndex
CREATE INDEX "bd_areas_districtId_idx" ON "bd_areas"("districtId");

-- CreateIndex
CREATE INDEX "bd_areas_type_idx" ON "bd_areas"("type");

-- CreateIndex
CREATE UNIQUE INDEX "animal_categories_code_key" ON "animal_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "animal_types_name_key" ON "animal_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "animal_types_code_key" ON "animal_types"("code");

-- CreateIndex
CREATE INDEX "animal_types_categoryId_idx" ON "animal_types"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "animal_sizes_code_key" ON "animal_sizes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "animal_colors_code_key" ON "animal_colors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coat_patterns_code_key" ON "coat_patterns"("code");

-- CreateIndex
CREATE INDEX "breeds_animalTypeId_idx" ON "breeds"("animalTypeId");

-- CreateIndex
CREATE INDEX "breeds_defaultSizeId_idx" ON "breeds"("defaultSizeId");

-- CreateIndex
CREATE UNIQUE INDEX "breeds_name_animalTypeId_key" ON "breeds"("name", "animalTypeId");

-- AddForeignKey
ALTER TABLE "bd_districts" ADD CONSTRAINT "bd_districts_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "bd_divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_upazilas" ADD CONSTRAINT "bd_upazilas_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "bd_districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_unions" ADD CONSTRAINT "bd_unions_upazilaId_fkey" FOREIGN KEY ("upazilaId") REFERENCES "bd_upazilas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_areas" ADD CONSTRAINT "bd_areas_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "bd_unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_areas" ADD CONSTRAINT "bd_areas_upazilaId_fkey" FOREIGN KEY ("upazilaId") REFERENCES "bd_upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_areas" ADD CONSTRAINT "bd_areas_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "bd_districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_areas" ADD CONSTRAINT "bd_areas_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "bd_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_types" ADD CONSTRAINT "animal_types_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "animal_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_animalTypeId_fkey" FOREIGN KEY ("animalTypeId") REFERENCES "animal_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_defaultSizeId_fkey" FOREIGN KEY ("defaultSizeId") REFERENCES "animal_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
