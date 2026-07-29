/**
 * Canonical animal taxonomy: Category -> Type/Species -> Breed. Single
 * source of truth for adoption, lost-and-found, fundraising beneficiary
 * type, and any other module that needs a species/breed selector. Do not
 * build a second taxonomy in any module; extend this one instead.
 *
 * `AnimalTaxonomyStore` is transport-agnostic business logic (search,
 * bounded pagination, cross-species validation) over an injectable
 * `AnimalTaxonomyDataSource` — Prisma-backed in production, an in-memory
 * fake in tests, mirroring the `LocationStore`/`LocationDataSource` pattern.
 */

export interface AnimalTypeRecord {
  id: number;
  code: string | null;
  name: string;
  nameBn: string | null;
  icon: string | null;
  scientificName: string | null;
  categoryId: number | null;
  displayOrder: number;
}

export interface BreedRecord {
  id: number;
  code: string | null;
  name: string;
  nameBn: string | null;
  animalTypeId: number;
  aliasNames: string[];
  originCountry: string | null;
  defaultSizeId: number | null;
  isMixed: boolean;
  isOther: boolean;
  isLocal: boolean;
  isUnknown: boolean;
  displayOrder: number;
}

export interface BoundedQuery {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AnimalTaxonomyDataSource {
  listTypes(): Promise<AnimalTypeRecord[]>;
  getType(id: number): Promise<AnimalTypeRecord | null>;
  listBreedsByType(animalTypeId: number): Promise<BreedRecord[]>;
  getBreed(id: number): Promise<BreedRecord | null>;
}

export class AnimalTaxonomyContractError extends Error {
  readonly code: 'TYPE_NOT_FOUND' | 'BREED_NOT_FOUND' | 'SPECIES_MISMATCH';
  readonly statusCode: number;

  constructor(code: AnimalTaxonomyContractError['code'], message: string, statusCode: number) {
    super(message);
    this.name = 'AnimalTaxonomyContractError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function paginate<T>(items: T[], query: BoundedQuery): PagedResult<T> {
  const pageSize = Math.min(
    Math.max(Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Math.trunc(query.page ?? 1), 1);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

/** Case-insensitive match across name, Bengali name, and alias/search terms. */
function matchesSearch(
  record: { name: string; nameBn: string | null; aliasNames?: string[] },
  q?: string,
): boolean {
  if (!q || !q.trim()) return true;
  const needle = q.trim().toLowerCase();
  if (record.name.toLowerCase().includes(needle)) return true;
  if ((record.nameBn ?? '').toLowerCase().includes(needle)) return true;
  return (record.aliasNames ?? []).some((alias) => alias.toLowerCase().includes(needle));
}

export class AnimalTaxonomyStore {
  constructor(private readonly ds: AnimalTaxonomyDataSource) {}

  async listTypes(query: BoundedQuery = {}): Promise<PagedResult<AnimalTypeRecord>> {
    const rows = (await this.ds.listTypes()).filter((r) => matchesSearch(r, query.q));
    return paginate(rows, query);
  }

  async getType(id: number): Promise<AnimalTypeRecord> {
    const type = await this.ds.getType(id);
    if (!type)
      throw new AnimalTaxonomyContractError('TYPE_NOT_FOUND', `Animal type not found: ${id}`, 404);
    return type;
  }

  async listBreedsByType(
    animalTypeId: number,
    query: BoundedQuery = {},
  ): Promise<PagedResult<BreedRecord>> {
    if (!(await this.ds.getType(animalTypeId))) {
      throw new AnimalTaxonomyContractError(
        'TYPE_NOT_FOUND',
        `Animal type not found: ${animalTypeId}`,
        404,
      );
    }
    const rows = (await this.ds.listBreedsByType(animalTypeId)).filter((r) =>
      matchesSearch(r, query.q),
    );
    return paginate(rows, query);
  }

  async getBreed(id: number): Promise<BreedRecord> {
    const breed = await this.ds.getBreed(id);
    if (!breed)
      throw new AnimalTaxonomyContractError('BREED_NOT_FOUND', `Breed not found: ${id}`, 404);
    return breed;
  }

  /**
   * Cross-species validation for write paths (adoption listing creation,
   * fundraising beneficiary details, ...): a breed must belong to the
   * animal type/species it's being submitted against.
   */
  async assertBreedBelongsToType(breedId: number, animalTypeId: number): Promise<BreedRecord> {
    const breed = await this.getBreed(breedId);
    if (breed.animalTypeId !== animalTypeId) {
      throw new AnimalTaxonomyContractError(
        'SPECIES_MISMATCH',
        `Breed ${breedId} does not belong to animal type ${animalTypeId}`,
        422,
      );
    }
    return breed;
  }
}

export function createAnimalTaxonomyStore(ds: AnimalTaxonomyDataSource): AnimalTaxonomyStore {
  return new AnimalTaxonomyStore(ds);
}
