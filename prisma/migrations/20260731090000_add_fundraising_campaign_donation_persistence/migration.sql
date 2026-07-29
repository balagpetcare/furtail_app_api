-- Forward-only, additive migration: introduces durable persistence for
-- fundraising campaigns, drafts, donations, payment attempts, webhook
-- events, receipts, and idempotency keys — replacing the previous
-- process-memory FundraisingStore maps for these entities. Does not
-- modify, rename, or drop any existing table/column. ownerUserId/
-- donorUserId/mediaId/petId/location ids are plain scalar columns, not
-- Prisma relations, so no unrelated schema (User/Media/Bd*) is altered.
--
-- No durable backfill source exists for prior campaign/donation data: the
-- previous implementation was process-memory only, so there is nothing to
-- migrate forward from — every row created going forward is new.

CREATE TABLE "fundraising_campaign_drafts" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "caption" TEXT,
    "category" TEXT,
    "fundingMode" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "targetAmountMinor" BIGINT,
    "monthlyGoalMinor" BIGINT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "beneficiaryType" TEXT,
    "beneficiaryName" TEXT,
    "petId" INTEGER,
    "urgency" TEXT,
    "treatmentProvider" TEXT,
    "estimatedExpenseMinor" BIGINT,
    "spendingPlan" JSONB,
    "locationText" TEXT,
    "countryId" INTEGER,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "subDistrictId" INTEGER,
    "bdDivisionId" INTEGER,
    "bdDistrictId" INTEGER,
    "bdUpazilaId" INTEGER,
    "bdAreaId" INTEGER,
    "mediaIds" INTEGER[],
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundraising_campaign_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_campaign_drafts_publicId_key" ON "fundraising_campaign_drafts"("publicId");
CREATE INDEX "fundraising_campaign_drafts_ownerUserId_status_createdAt_idx" ON "fundraising_campaign_drafts"("ownerUserId", "status", "createdAt");

CREATE TABLE "fundraising_campaigns" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "draftId" INTEGER,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "category" TEXT,
    "fundingMode" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "targetAmountMinor" BIGINT,
    "monthlyGoalMinor" BIGINT,
    "raisedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "withdrawnAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "donorsCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "beneficiaryType" TEXT,
    "beneficiaryName" TEXT,
    "petId" INTEGER,
    "urgency" TEXT,
    "treatmentProvider" TEXT,
    "estimatedExpenseMinor" BIGINT,
    "spendingPlan" JSONB,
    "locationText" TEXT,
    "countryId" INTEGER,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "subDistrictId" INTEGER,
    "bdDivisionId" INTEGER,
    "bdDistrictId" INTEGER,
    "bdUpazilaId" INTEGER,
    "bdAreaId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fundraising_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_campaigns_publicId_key" ON "fundraising_campaigns"("publicId");
CREATE UNIQUE INDEX "fundraising_campaigns_draftId_key" ON "fundraising_campaigns"("draftId");
CREATE INDEX "fundraising_campaigns_ownerUserId_status_createdAt_idx" ON "fundraising_campaigns"("ownerUserId", "status", "createdAt");
CREATE INDEX "fundraising_campaigns_status_createdAt_idx" ON "fundraising_campaigns"("status", "createdAt");
CREATE INDEX "fundraising_campaigns_deletedAt_idx" ON "fundraising_campaigns"("deletedAt");

ALTER TABLE "fundraising_campaigns"
  ADD CONSTRAINT "fundraising_campaigns_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "fundraising_campaign_drafts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "fundraising_campaign_media" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fundraising_campaign_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_campaign_media_campaignId_mediaId_key" ON "fundraising_campaign_media"("campaignId", "mediaId");
CREATE INDEX "fundraising_campaign_media_campaignId_position_idx" ON "fundraising_campaign_media"("campaignId", "position");

ALTER TABLE "fundraising_campaign_media"
  ADD CONSTRAINT "fundraising_campaign_media_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "fundraising_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fundraising_donations" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "donorUserId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "supportMessage" TEXT NOT NULL DEFAULT '',
    "paymentMethodLabel" TEXT NOT NULL DEFAULT '',
    "consentAccepted" BOOLEAN NOT NULL DEFAULT true,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundraising_donations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_donations_publicId_key" ON "fundraising_donations"("publicId");
CREATE UNIQUE INDEX "fundraising_donations_referenceId_key" ON "fundraising_donations"("referenceId");
CREATE UNIQUE INDEX "fundraising_donations_donorUserId_campaignId_idempotencyKe_key" ON "fundraising_donations"("donorUserId", "campaignId", "idempotencyKey");
CREATE INDEX "fundraising_donations_campaignId_status_createdAt_idx" ON "fundraising_donations"("campaignId", "status", "createdAt");
CREATE INDEX "fundraising_donations_donorUserId_createdAt_idx" ON "fundraising_donations"("donorUserId", "createdAt");

ALTER TABLE "fundraising_donations"
  ADD CONSTRAINT "fundraising_donations_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "fundraising_campaigns"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fundraising_payment_attempts" (
    "id" SERIAL NOT NULL,
    "attemptId" TEXT NOT NULL,
    "donationId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "redirectUrl" TEXT,
    "logId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundraising_payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_payment_attempts_attemptId_key" ON "fundraising_payment_attempts"("attemptId");
CREATE UNIQUE INDEX "fundraising_payment_attempts_provider_providerPaymentId_key" ON "fundraising_payment_attempts"("provider", "providerPaymentId");
CREATE INDEX "fundraising_payment_attempts_donationId_idx" ON "fundraising_payment_attempts"("donationId");
CREATE INDEX "fundraising_payment_attempts_provider_providerPaymentId_idx" ON "fundraising_payment_attempts"("provider", "providerPaymentId");

ALTER TABLE "fundraising_payment_attempts"
  ADD CONSTRAINT "fundraising_payment_attempts_donationId_fkey"
  FOREIGN KEY ("donationId") REFERENCES "fundraising_donations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fundraising_webhook_events" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundraising_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_webhook_events_provider_eventId_key" ON "fundraising_webhook_events"("provider", "eventId");
CREATE INDEX "fundraising_webhook_events_referenceId_idx" ON "fundraising_webhook_events"("referenceId");

CREATE TABLE "fundraising_receipts" (
    "id" SERIAL NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "donationId" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundraising_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_receipts_receiptNumber_key" ON "fundraising_receipts"("receiptNumber");
CREATE UNIQUE INDEX "fundraising_receipts_donationId_key" ON "fundraising_receipts"("donationId");

ALTER TABLE "fundraising_receipts"
  ADD CONSTRAINT "fundraising_receipts_donationId_fkey"
  FOREIGN KEY ("donationId") REFERENCES "fundraising_donations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fundraising_idempotency_keys" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundraising_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_idempotency_keys_scope_ownerUserId_key_key" ON "fundraising_idempotency_keys"("scope", "ownerUserId", "key");
