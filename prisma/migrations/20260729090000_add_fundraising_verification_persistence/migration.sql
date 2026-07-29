-- Forward-only, additive migration: introduces durable persistence for the
-- fundraising KYC verification flow, replacing the previous process-memory
-- FundraisingStore account map. Does not modify, rename, or drop any
-- existing table/column, and does not touch User/Media/Bd* location
-- tables — ownerUserId/mediaId/location ids are plain scalar columns, not
-- Prisma relations, so no unrelated schema is altered.

CREATE TYPE "FundraisingVerificationStatus" AS ENUM ('DRAFT', 'PENDING', 'VERIFIED', 'REJECTED');

CREATE TYPE "FundraisingVerificationDocumentType" AS ENUM ('PRIMARY', 'SUPPORTING');

CREATE TABLE "fundraising_verification_accounts" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "status" "FundraisingVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "accountType" VARCHAR(32),
    "fullName" TEXT,
    "dateOfBirth" VARCHAR(10),
    "presentAddress" TEXT,
    "permanentAddress" TEXT,
    "occupation" TEXT,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "divisionId" INTEGER,
    "districtId" INTEGER,
    "upazilaId" INTEGER,
    "unionId" INTEGER,
    "areaId" INTEGER,
    "area" TEXT,
    "countryCode" VARCHAR(8),
    "countryName" TEXT,
    "stateName" TEXT,
    "cityName" TEXT,
    "addressLine" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "formattedAddress" TEXT,
    "primaryDocumentType" TEXT,
    "nationalIdNumber" TEXT,
    "birthRegNumber" TEXT,
    "passportNumber" TEXT,
    "studentIdNumber" TEXT,
    "drivingLicenceNumber" TEXT,
    "verificationDraftJson" JSONB,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundraising_verification_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_verification_accounts_ownerUserId_key" ON "fundraising_verification_accounts"("ownerUserId");

CREATE INDEX "fundraising_verification_accounts_status_idx" ON "fundraising_verification_accounts"("status");

CREATE INDEX "fundraising_verification_accounts_status_submittedAt_idx" ON "fundraising_verification_accounts"("status", "submittedAt");

CREATE TABLE "fundraising_verification_documents" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "FundraisingVerificationDocumentType" NOT NULL DEFAULT 'SUPPORTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fundraising_verification_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fundraising_verification_documents_accountId_deletedAt_idx" ON "fundraising_verification_documents"("accountId", "deletedAt");

CREATE INDEX "fundraising_verification_documents_mediaId_idx" ON "fundraising_verification_documents"("mediaId");

ALTER TABLE "fundraising_verification_documents"
  ADD CONSTRAINT "fundraising_verification_documents_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "fundraising_verification_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
