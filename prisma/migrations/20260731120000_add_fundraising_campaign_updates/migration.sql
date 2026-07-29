-- Forward-only, additive migration: introduces durable persistence for
-- fundraising campaign update posts. This replaces the previous
-- process-memory update map with a real table. Does not modify, rename,
-- or drop any existing table/column.

CREATE TABLE "fundraising_campaign_updates" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "mediaIds" INTEGER[] NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fundraising_campaign_updates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fundraising_campaign_updates_publicId_key" ON "fundraising_campaign_updates"("publicId");
CREATE INDEX "fundraising_campaign_updates_campaignId_createdAt_idx" ON "fundraising_campaign_updates"("campaignId", "createdAt");
CREATE INDEX "fundraising_campaign_updates_authorUserId_createdAt_idx" ON "fundraising_campaign_updates"("authorUserId", "createdAt");
CREATE INDEX "fundraising_campaign_updates_campaignId_status_deletedAt_createdAt_idx" ON "fundraising_campaign_updates"("campaignId", "status", "deletedAt", "createdAt");

ALTER TABLE "fundraising_campaign_updates"
  ADD CONSTRAINT "fundraising_campaign_updates_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "fundraising_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
