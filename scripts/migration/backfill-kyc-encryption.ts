/**
 * One-time, idempotent backfill: encrypts any plaintext KYC values left in
 * `fundraising_verification_accounts` from before application-level
 * encryption was introduced (migration 20260730090000). Safe to run
 * multiple times — any value that's already an encryption envelope
 * (`looksLikeKycEnvelope`) is left untouched.
 *
 * The store's own read path (`fundraising-store.ts`) is defensive and
 * decrypts-or-passes-through legacy plaintext automatically, so running
 * this script is a hardening step, not a correctness requirement for the
 * app to keep working — but it should still be run once per environment
 * so every row is genuinely encrypted at rest.
 *
 * Usage:
 *   DATABASE_URL=... FUNDRAISING_KYC_ENCRYPTION_KEYS=... \
 *     npx tsx scripts/migration/backfill-kyc-encryption.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';

import {
  encryptKycField,
  looksLikeKycEnvelope,
} from '../../src/modules/fundraising/kyc-encryption';

const ENCRYPTED_FIELDS = [
  'dateOfBirth',
  'presentAddress',
  'permanentAddress',
  'addressLine',
  'nationalIdNumber',
  'birthRegNumber',
  'passportNumber',
  'studentIdNumber',
  'drivingLicenceNumber',
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const rows = await prisma.fundraisingVerificationAccount.findMany({
    select: {
      id: true,
      dateOfBirth: true,
      presentAddress: true,
      permanentAddress: true,
      addressLine: true,
      nationalIdNumber: true,
      birthRegNumber: true,
      passportNumber: true,
      studentIdNumber: true,
      drivingLicenceNumber: true,
    },
  });

  let updatedRows = 0;
  let updatedFields = 0;
  for (const row of rows) {
    const data: Record<string, string> = {};
    for (const field of ENCRYPTED_FIELDS) {
      const value = row[field];
      if (value && !looksLikeKycEnvelope(value)) {
        data[field] = encryptKycField(value);
        updatedFields += 1;
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.fundraisingVerificationAccount.update({ where: { id: row.id }, data });
      updatedRows += 1;
    }
  }

  // Never log plaintext identity values — only counts.
  console.log(
    `KYC backfill complete: ${updatedRows} account row(s) updated, ${updatedFields} field(s) encrypted.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('KYC backfill failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
