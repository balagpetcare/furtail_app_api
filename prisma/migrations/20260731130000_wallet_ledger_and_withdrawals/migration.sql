DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'FundraisingVerificationStatus'
  ) THEN
    BEGIN
      ALTER TYPE "FundraisingVerificationStatus" ADD VALUE 'SUSPENDED';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "FundraisingVerificationStatus" ADD VALUE 'DEACTIVATED';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "wallet_ledger_entries" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
  "sourceType" TEXT,
  "sourceId" INTEGER,
  "note" TEXT,
  "idempotencyKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_ledger_entries_userId_idempotencyKey_key"
  ON "wallet_ledger_entries"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "wallet_ledger_entries_userId_createdAt_idx"
  ON "wallet_ledger_entries"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "wallet_ledger_entries_sourceType_sourceId_idx"
  ON "wallet_ledger_entries"("sourceType", "sourceId");

CREATE TABLE IF NOT EXISTS "wallet_withdraw_requests" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "amountMinor" BIGINT NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
  "method" TEXT NOT NULL,
  "payoutDetails" JSONB NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL,
  "failureReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_withdraw_requests_idempotencyKey_key"
  ON "wallet_withdraw_requests"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "wallet_withdraw_requests_userId_createdAt_idx"
  ON "wallet_withdraw_requests"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "wallet_withdraw_requests_userId_status_createdAt_idx"
  ON "wallet_withdraw_requests"("userId", "status", "createdAt");
