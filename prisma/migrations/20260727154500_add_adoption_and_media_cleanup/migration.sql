-- CreateEnum
CREATE TYPE "AdoptionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'PAUSED', 'ADOPTED', 'REJECTED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "AdoptionApplicationStatus" AS ENUM ('SUBMITTED', 'VIEWED', 'SHORTLISTED', 'OWNER_REVIEW', 'INTERVIEW_SCHEDULED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaStatus" ADD VALUE 'PENDING_DELETION';
ALTER TYPE "MediaStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "deletionRetries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "markedForDeletionAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "adoption_listings" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "status" "AdoptionStatus" NOT NULL DEFAULT 'DRAFT',
    "petName" TEXT,
    "animalTypeId" INTEGER,
    "breedId" INTEGER,
    "sex" VARCHAR(16),
    "ageText" TEXT,
    "ageYears" INTEGER,
    "ageMonths" INTEGER,
    "ageDays" INTEGER,
    "totalAgeDays" INTEGER,
    "approximateDateOfBirth" TIMESTAMP(3),
    "size" VARCHAR(64),
    "colors" TEXT,
    "story" TEXT,
    "adoptionReason" TEXT,
    "vaccinated" BOOLEAN NOT NULL DEFAULT false,
    "dewormed" BOOLEAN NOT NULL DEFAULT false,
    "neutered" BOOLEAN NOT NULL DEFAULT false,
    "microchipped" BOOLEAN NOT NULL DEFAULT false,
    "healthInfo" TEXT,
    "countryId" INTEGER,
    "bdDivisionId" INTEGER,
    "bdDistrictId" INTEGER,
    "bdUpazilaId" INTEGER,
    "bdAreaId" INTEGER,
    "ownerCityAreaText" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "ownerContactPhone" TEXT,
    "ownerWhatsappPhone" TEXT,
    "pickupLocationNotes" TEXT,
    "serviceAreaType" TEXT,
    "serviceAreaNotes" TEXT,
    "customServiceAreas" JSONB,
    "allowInternationalAdoption" BOOLEAN NOT NULL DEFAULT false,
    "adopterConditions" JSONB,
    "adoptionExperienceRequired" BOOLEAN NOT NULL DEFAULT false,
    "homeCheckRequired" BOOLEAN NOT NULL DEFAULT false,
    "vetReferenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "identityVerificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "landlordApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "minimumMonthlyIncomeRange" TEXT,
    "maximumMonthlyIncomeRange" TEXT,
    "notes" TEXT,
    "mediaIds" INTEGER[],
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "markedForDeletionAt" TIMESTAMP(3),
    "deletionRetries" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "adoption_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adoption_applications" (
    "id" SERIAL NOT NULL,
    "adoptionListingId" INTEGER NOT NULL,
    "applicantUserId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "status" "AdoptionApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "applicantName" TEXT NOT NULL,
    "applicantPhone" TEXT NOT NULL,
    "applicantWhatsappPhone" TEXT,
    "applicantLocationText" TEXT,
    "applicantCityAreaText" TEXT,
    "applicantEmail" TEXT,
    "applicantHouseholdSummary" TEXT,
    "applicantExperienceSummary" TEXT,
    "applicantOtherPetsSummary" TEXT,
    "applicantIncomeRange" TEXT,
    "messageToOwner" TEXT,
    "answers" JSONB,
    "consentToHomeCheck" BOOLEAN NOT NULL DEFAULT false,
    "consentToFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "ownerNotes" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "adoption_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adoption_listings_idempotencyKey_key" ON "adoption_listings"("idempotencyKey");

-- CreateIndex
CREATE INDEX "adoption_listings_ownerUserId_status_createdAt_idx" ON "adoption_listings"("ownerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "adoption_listings_status_createdAt_idx" ON "adoption_listings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "adoption_listings_markedForDeletionAt_idx" ON "adoption_listings"("markedForDeletionAt");

-- CreateIndex
CREATE INDEX "adoption_listings_animalTypeId_breedId_idx" ON "adoption_listings"("animalTypeId", "breedId");

-- CreateIndex
CREATE INDEX "adoption_applications_applicantUserId_createdAt_idx" ON "adoption_applications"("applicantUserId", "createdAt");

-- CreateIndex
CREATE INDEX "adoption_applications_ownerUserId_adoptionListingId_created_idx" ON "adoption_applications"("ownerUserId", "adoptionListingId", "createdAt");

-- CreateIndex
CREATE INDEX "adoption_applications_adoptionListingId_status_createdAt_idx" ON "adoption_applications"("adoptionListingId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "adoption_applications_adoptionListingId_applicantUserId_key" ON "adoption_applications"("adoptionListingId", "applicantUserId");

-- CreateIndex
CREATE INDEX "Media_markedForDeletionAt_idx" ON "Media"("markedForDeletionAt");

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_animalTypeId_fkey" FOREIGN KEY ("animalTypeId") REFERENCES "animal_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "breeds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_bdDivisionId_fkey" FOREIGN KEY ("bdDivisionId") REFERENCES "bd_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_bdDistrictId_fkey" FOREIGN KEY ("bdDistrictId") REFERENCES "bd_districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_bdUpazilaId_fkey" FOREIGN KEY ("bdUpazilaId") REFERENCES "bd_upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_listings" ADD CONSTRAINT "adoption_listings_bdAreaId_fkey" FOREIGN KEY ("bdAreaId") REFERENCES "bd_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_adoptionListingId_fkey" FOREIGN KEY ("adoptionListingId") REFERENCES "adoption_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

