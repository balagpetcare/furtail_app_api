-- Forward-only, additive/widening migration: application-level encryption
-- (AES-256-GCM, see src/modules/fundraising/kyc-encryption.ts) stores each
-- KYC field as a text envelope ("v<version>:<iv>:<authTag>:<ciphertext>"),
-- which is longer than the raw plaintext it replaces. Every other affected
-- column (nationalIdNumber, birthRegNumber, passportNumber,
-- studentIdNumber, drivingLicenceNumber, presentAddress, permanentAddress,
-- addressLine) was already an unconstrained TEXT column and needs no
-- change. dateOfBirth was VARCHAR(10) and must widen to TEXT. This does
-- not delete or truncate any existing row.
ALTER TABLE "fundraising_verification_accounts"
  ALTER COLUMN "dateOfBirth" TYPE TEXT;
