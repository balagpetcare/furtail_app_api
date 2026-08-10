/**
 * Future BPA legacy pet import interface.
 *
 * This script intentionally does not run an import by default. A production
 * backfill needs an identified source schema and an explicit immutable Central
 * Auth subject-to-owner mapping. Never map pet ownership by email, phone,
 * username, or display name.
 */

export interface LegacyPetImportSource {
  sourceName: string;
  readBatch(cursor: string | null): Promise<{
    items: LegacyPetImportRecord[];
    nextCursor: string | null;
  }>;
}

export interface LegacyPetImportRecord {
  legacyId: string;
  centralAuthSubject: string;
  name: string;
  animalTypeId: number;
  breedId?: number | null;
  updatedAt?: string | Date | null;
  payload?: Record<string, unknown>;
}

export interface LegacyPetImportResult {
  scanned: number;
  imported: number;
  skipped: number;
  failures: Array<{ legacyId: string; reason: string }>;
}

export async function importLegacyPets(
  _source: LegacyPetImportSource,
): Promise<LegacyPetImportResult> {
  throw new Error(
    'Legacy pet import is not configured. Provide a source schema and explicit Central Auth subject mapping first.',
  );
}
