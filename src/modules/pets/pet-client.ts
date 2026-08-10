import type { SocialMediaLookupPayload } from '../social/social-store';

export type PetVisibility = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
export type PetSex = 'MALE' | 'FEMALE' | 'UNKNOWN';
export type PetDocumentCategory =
  | 'PROFILE_IMAGE'
  | 'VACCINATION_CARD'
  | 'VACCINE_CERTIFICATE'
  | 'PRESCRIPTION'
  | 'LAB_REPORT'
  | 'XRAY'
  | 'ULTRASOUND'
  | 'SURGERY_DOCUMENT'
  | 'DISCHARGE_SUMMARY'
  | 'MEDICAL_OTHER';

export type PetErrorKind =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'
  | 'ANIMAL_TYPE_NOT_FOUND'
  | 'ANIMAL_BREED_NOT_FOUND'
  | 'ANIMAL_BREED_SPECIES_MISMATCH'
  | 'INVALID_MEDIA_OWNERSHIP'
  | 'MALFORMED_CURSOR'
  | 'UNSUPPORTED_LEGACY_VALUE'
  | 'RATE_LIMITED'
  | 'DOWNSTREAM_TIMEOUT'
  | 'DOWNSTREAM_UNAVAILABLE'
  | 'MALFORMED_RESPONSE'
  | 'OWNERSHIP_VIOLATION'
  | 'UPLOAD_FAILED';

export class PetContractError extends Error {
  constructor(
    public readonly kind: PetErrorKind,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PetContractError';
  }
}

export interface PetMediaLookup {
  getMedia(mediaId: number): SocialMediaLookupPayload | null;
}

export interface PetCreateInput {
  name?: unknown;
  animalTypeId?: unknown;
  petType?: unknown;
  species?: unknown;
  breedId?: unknown;
  subBreedId?: unknown;
  colorId?: unknown;
  coatPatternId?: unknown;
  sizeId?: unknown;
  customBreedText?: unknown;
  customColorText?: unknown;
  dateOfBirth?: unknown;
  sex?: unknown;
  gender?: unknown;
  microchipNumber?: unknown;
  isRescue?: unknown;
  isNeutered?: unknown;
  foodHabits?: unknown;
  healthDisorders?: unknown;
  notes?: unknown;
  weightKg?: unknown;
  profilePicId?: unknown;
  profileImageId?: unknown;
  bloodType?: unknown;
  allergies?: unknown;
  slug?: unknown;
  bio?: unknown;
  coverMediaId?: unknown;
  isPublicProfileEnabled?: unknown;
  visibility?: unknown;
  historicalVaccinations?: unknown;
  identityDetails?: unknown;
  version?: unknown;
  idempotencyKey?: unknown;
  originatingClientId?: unknown;
  originatingClientAudience?: unknown;
}

export type PetUpdateInput = PetCreateInput;

export interface PetProfileUpdateInput {
  slug?: unknown;
  bio?: unknown;
  coverMediaId?: unknown;
  isPublicProfileEnabled?: unknown;
  visibility?: unknown;
}

export interface PetRecord {
  id: number;
  ownerUserId: number;
  name: string;
  slug: string | null;
  animalTypeId: number;
  breedId: number | null;
  subBreedId: number | null;
  colorId: number | null;
  coatPatternId: number | null;
  sizeId: number | null;
  customBreedText: string | null;
  customColorText: string | null;
  animalTypeName: string | null;
  breedName: string | null;
  colorName: string | null;
  sizeName: string | null;
  coatPatternName: string | null;
  dateOfBirth: Date | null;
  sex: PetSex;
  microchipNumber: string | null;
  isRescue: boolean;
  isNeutered: boolean;
  foodHabits: string | null;
  healthDisorders: string | null;
  notes: string | null;
  bloodType: string | null;
  allergies: string[];
  profilePicId: number | null;
  coverMediaId: number | null;
  bio: string | null;
  isPublicProfileEnabled: boolean;
  visibility: PetVisibility;
  followersCount: number;
  likesCount: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  version?: number;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WeightRecord {
  id: number;
  petId: number;
  weightKg: number;
  notes: string | null;
  recordedAt: Date;
  createdAt: Date;
}

interface VaccinationRecord {
  id: number;
  petId: number;
  vaccineTypeId: number | null;
  vaccineName: string | null;
  status: 'ACTIVE' | 'VOIDED';
  administeredAt: Date | null;
  nextDueDate: Date | null;
  batchNumber: string | null;
  manufacturer: string | null;
  vetClinic: string | null;
  notes: string | null;
  createdAt: Date;
}

interface MedicalHistoryRecord {
  id: number;
  petId: number;
  condition: string;
  treatment: string | null;
  doctorName: string | null;
  clinicName: string | null;
  visitDate: Date | null;
  followUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DewormingRecord {
  id: number;
  petId: number;
  medicationName: string;
  dosage: string | null;
  weightAtTime: number | null;
  administeredAt: Date | null;
  nextDueDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DocumentRecord {
  id: number;
  petId: number;
  mediaId: number;
  category: PetDocumentCategory;
  title: string;
  documentDate: Date | null;
  notes: string | null;
  uploadedByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PetPostRecord {
  id: number;
  petId: number;
  authorUserId: number;
  caption: string | null;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL';
  privacy: 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
  mediaIds: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PetSocialStatus {
  isFollowing: boolean;
  isLiked: boolean;
  isOwner: boolean;
  canManage: boolean;
  followersCount: number;
  likesCount: number;
}

export interface PetProfilePayload {
  id: number;
  name: string;
  photoUrl: string | null;
  ageYears: number | null;
  gender: string | null;
  breed: string | null;
  weightKg: number | null;
  healthStatus: {
    vaccinated: boolean;
    nextDueDate: string | null;
  };
  pawPoints: number;
  tier: string | null;
  familyMembers: Array<Record<string, unknown>>;
}

export interface PetPayload {
  id: number;
  name: string;
  slug: string | null;
  animalTypeId: number;
  breedId: number | null;
  subBreedId: number | null;
  colorId: number | null;
  coatPatternId: number | null;
  sizeId: number | null;
  customBreedText: string | null;
  customColorText: string | null;
  animalTypeName: string | null;
  breedName: string | null;
  colorName: string | null;
  sizeName: string | null;
  coatPatternName: string | null;
  dateOfBirth: string | null;
  sex: PetSex;
  microchipNumber: string | null;
  isRescue: boolean;
  isNeutered: boolean;
  foodHabits: string | null;
  healthDisorders: string | null;
  notes: string | null;
  weightKg: number | null;
  photoUrl: string | null;
  profilePicId: number | null;
  bloodType: string | null;
  allergies: string[];
  bio: string | null;
  coverMediaId: number | null;
  coverMediaUrl: string | null;
  isPublicProfileEnabled: boolean;
  visibility: PetVisibility;
  followersCount: number;
  likesCount: number;
  isFollowing: boolean | null;
  isLiked: boolean | null;
  isOwner: boolean | null;
  canManage: boolean | null;
  canViewFullProfile: boolean;
}

export interface PetListPayload {
  pets: PetPayload[];
}

export interface PetMedicalHistoryPayload {
  pet: PetPayload;
  profile: Record<string, unknown>;
  vaccinations: ReturnType<InMemoryPetClient['listVaccinations']> extends Promise<infer T>
    ? T extends { data: infer D }
      ? D
      : never
    : never;
  medicalHistory: ReturnType<InMemoryPetClient['listMedicalHistory']> extends Promise<infer T>
    ? T extends { data: infer D }
      ? D
      : never
    : never;
  dewormingHistory: ReturnType<InMemoryPetClient['listDewormingRecords']> extends Promise<infer T>
    ? T extends { data: infer D }
      ? D
      : never
    : never;
  weightHistory: ReturnType<InMemoryPetClient['listWeightRecords']> extends Promise<infer T>
    ? T extends { data: infer D }
      ? D
      : never
    : never;
  documents: ReturnType<InMemoryPetClient['listDocuments']> extends Promise<infer T>
    ? T extends { data: infer D }
      ? D
      : never
    : never;
}

export interface PetPostsPayload {
  items: Array<Record<string, unknown>>;
  nextCursor: number | null;
  hasMore: boolean;
}

export interface PetContractClient {
  listMyPets(userId: number): Promise<PetListPayload>;
  getOwnedPet(userId: number, petId: number): Promise<PetPayload>;
  getPetById(viewerId: number | null, petId: number): Promise<PetPayload>;
  getPetBySlug(viewerId: number | null, slug: string): Promise<PetPayload>;
  createPet(userId: number, input: PetCreateInput): Promise<PetPayload>;
  updatePet(userId: number, petId: number, input: PetUpdateInput): Promise<PetPayload>;
  deletePet(userId: number, petId: number): Promise<{ id: number; deleted: true }>;
  updatePetProfile(
    userId: number,
    petId: number,
    input: PetProfileUpdateInput,
  ): Promise<PetPayload>;
  followPet(userId: number, petId: number): Promise<{ followed: true }>;
  unfollowPet(userId: number, petId: number): Promise<{ followed: false }>;
  likePet(userId: number, petId: number): Promise<{ liked: true }>;
  unlikePet(userId: number, petId: number): Promise<{ liked: false }>;
  getPetSocialStatus(userId: number, petId: number): Promise<PetSocialStatus>;
  getPetPosts(
    viewerId: number | null,
    petId: number,
    limit: number,
    cursor?: unknown,
  ): Promise<PetPostsPayload>;
  createPetPost(
    userId: number,
    petId: number,
    input: { caption?: unknown; type?: unknown; mediaIds?: unknown; privacy?: unknown },
  ): Promise<Record<string, unknown>>;
  getPetProfile(userId: number, petId: number): Promise<PetProfilePayload>;
  listVaccinations(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; vaccinations: Record<string, unknown>[] }>;
  getVaccination(
    userId: number,
    petId: number,
    vaccinationId: number,
  ): Promise<Record<string, unknown>>;
  createVaccination(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateVaccination(
    userId: number,
    petId: number,
    vaccinationId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteVaccination(
    userId: number,
    petId: number,
    vaccinationId: number,
  ): Promise<{ id: number; deleted: true }>;
  listMedicalHistory(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; medicalHistory: Record<string, unknown>[] }>;
  getMedicalHistoryRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<Record<string, unknown>>;
  createMedicalHistoryRecord(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateMedicalHistoryRecord(
    userId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteMedicalHistoryRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<{ id: number; deleted: true }>;
  listDewormingRecords(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; dewormingHistory: Record<string, unknown>[] }>;
  getDewormingRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<Record<string, unknown>>;
  createDewormingRecord(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateDewormingRecord(
    userId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteDewormingRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<{ id: number; deleted: true }>;
  listWeightRecords(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; weightHistory: Record<string, unknown>[] }>;
  getWeightRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<Record<string, unknown>>;
  createWeightRecord(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateWeightRecord(
    userId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteWeightRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<{ id: number; deleted: true }>;
  listDocuments(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; documents: Record<string, unknown>[] }>;
  getDocument(userId: number, petId: number, documentId: number): Promise<Record<string, unknown>>;
  createDocument(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateDocument(
    userId: number,
    petId: number,
    documentId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteDocument(
    userId: number,
    petId: number,
    documentId: number,
  ): Promise<{ id: number; deleted: true }>;
  getPetMedicalHistory(
    userId: number,
    petId: number,
  ): Promise<{
    pet: PetPayload;
    profile: Record<string, unknown>;
    vaccinations: Record<string, unknown>[];
    medicalHistory: Record<string, unknown>[];
    dewormingHistory: Record<string, unknown>[];
    weightHistory: Record<string, unknown>[];
    documents: Record<string, unknown>[];
  }>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function normalizeText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: unknown, fallback = false): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toSex(value: unknown): PetSex {
  const normalized = String(value ?? 'UNKNOWN')
    .trim()
    .toUpperCase();
  return normalized === 'MALE' || normalized === 'FEMALE' ? (normalized as PetSex) : 'UNKNOWN';
}

function toVisibility(value: unknown, fallback: PetVisibility = 'PRIVATE'): PetVisibility {
  const normalized = String(value ?? fallback)
    .trim()
    .toUpperCase();
  return normalized === 'PUBLIC' || normalized === 'FOLLOWERS_ONLY' || normalized === 'PRIVATE'
    ? (normalized as PetVisibility)
    : fallback;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function computeAgeYears(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const now = new Date();
  let years = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) years -= 1;
  return years >= 0 ? years : null;
}

function mediaUrl(media: SocialMediaLookupPayload | null): string | null {
  return media?.url ?? null;
}

function mapMimetypeCategory(mimetype: string): 'VIDEO' | 'IMAGE' | 'FILE' {
  if (mimetype.startsWith('video/')) return 'VIDEO';
  if (mimetype.startsWith('image/')) return 'IMAGE';
  return 'FILE';
}

function buildRecordError(kind: PetErrorKind, message: string, details?: Record<string, unknown>) {
  return new PetContractError(kind, message, details);
}

export class InMemoryPetClient implements PetContractClient {
  private nextPetId = 1;
  private nextWeightId = 1;
  private nextVaccinationId = 1;
  private nextMedicalHistoryId = 1;
  private nextDewormingId = 1;
  private nextDocumentId = 1;
  private nextPostId = 1;

  private readonly pets = new Map<number, PetRecord>();
  private readonly weights = new Map<number, WeightRecord[]>();
  private readonly vaccinations = new Map<number, VaccinationRecord[]>();
  private readonly medicalHistory = new Map<number, MedicalHistoryRecord[]>();
  private readonly deworming = new Map<number, DewormingRecord[]>();
  private readonly documents = new Map<number, DocumentRecord[]>();
  private readonly posts = new Map<number, PetPostRecord[]>();
  private readonly follows = new Set<string>();
  private readonly likes = new Set<string>();

  constructor(private readonly mediaLookup: PetMediaLookup) {
    this.seed();
  }

  reset(): void {
    this.nextPetId = 1;
    this.nextWeightId = 1;
    this.nextVaccinationId = 1;
    this.nextMedicalHistoryId = 1;
    this.nextDewormingId = 1;
    this.nextDocumentId = 1;
    this.nextPostId = 1;
    this.pets.clear();
    this.weights.clear();
    this.vaccinations.clear();
    this.medicalHistory.clear();
    this.deworming.clear();
    this.documents.clear();
    this.posts.clear();
    this.follows.clear();
    this.likes.clear();
    this.seed();
  }

  async listMyPets(userId: number): Promise<PetListPayload> {
    return {
      pets: [...this.pets.values()]
        .filter((pet) => this.isOwnedActivePet(userId, pet))
        .map((pet) => this.serializePet(userId, pet, true)),
    };
  }

  async getOwnedPet(userId: number, petId: number): Promise<PetPayload> {
    return this.serializePet(userId, this.requireOwnedPet(userId, petId), true);
  }

  async getPetById(viewerId: number | null, petId: number): Promise<PetPayload> {
    const pet = this.requirePet(petId);
    return this.serializePet(viewerId, pet, false);
  }

  async getPetBySlug(viewerId: number | null, slug: string): Promise<PetPayload> {
    const clean = normalizeText(slug)?.toLowerCase();
    if (!clean) throw buildRecordError('VALIDATION', 'Slug is required');
    const pet = [...this.pets.values()].find(
      (item) => item.slug?.toLowerCase() === clean && item.status === 'ACTIVE',
    );
    if (!pet) throw buildRecordError('NOT_FOUND', 'Pet not found');
    return this.serializePet(viewerId, pet, false);
  }

  async createPet(userId: number, input: PetCreateInput): Promise<PetPayload> {
    const name = normalizeText(input.name);
    if (!name) throw buildRecordError('VALIDATION', 'Pet name is required');
    const animalTypeId = toInt(input.animalTypeId);
    const animalTypeLabel = normalizeText(input.petType ?? input.species);
    const resolvedAnimalTypeId = animalTypeId ?? this.resolveAnimalTypeId(animalTypeLabel);
    if (!resolvedAnimalTypeId) throw buildRecordError('VALIDATION', 'Animal type is required');
    const slug = this.resolveSlug(input.slug, name);
    this.ensureSlugAvailable(slug, null);
    const microchipNumber = normalizeText(input.microchipNumber);
    if (microchipNumber) this.ensureMicrochipAvailable(microchipNumber, null);

    const pet: PetRecord = {
      id: this.nextPetId++,
      ownerUserId: userId,
      name,
      slug,
      animalTypeId: resolvedAnimalTypeId,
      breedId: toInt(input.breedId),
      subBreedId: toInt(input.subBreedId),
      colorId: toInt(input.colorId),
      coatPatternId: toInt(input.coatPatternId),
      sizeId: toInt(input.sizeId),
      customBreedText: normalizeText(input.customBreedText),
      customColorText: normalizeText(input.customColorText),
      animalTypeName: this.resolveAnimalTypeName(resolvedAnimalTypeId),
      breedName: this.resolveBreedName(resolvedAnimalTypeId, input.breedId, input.customBreedText),
      colorName: normalizeText(input.customColorText),
      sizeName: this.resolveSizeName(input.sizeId),
      coatPatternName: this.resolveCoatPatternName(input.coatPatternId),
      dateOfBirth: parseDate(input.dateOfBirth),
      sex: toSex(input.sex ?? input.gender),
      microchipNumber,
      isRescue: toBool(input.isRescue),
      isNeutered: toBool(input.isNeutered),
      foodHabits: normalizeText(input.foodHabits),
      healthDisorders: normalizeText(input.healthDisorders),
      notes: normalizeText(input.notes),
      bloodType: normalizeText(input.bloodType),
      allergies: stringArray(input.allergies),
      profilePicId: toInt(input.profilePicId ?? input.profileImageId),
      coverMediaId: toInt(input.coverMediaId),
      bio: normalizeText(input.bio),
      isPublicProfileEnabled: toBool(input.isPublicProfileEnabled, true),
      visibility: toVisibility(input.visibility, 'PUBLIC'),
      followersCount: 0,
      likesCount: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.validatePetMedia(userId, pet.profilePicId, 'profile image');
    this.validatePetMedia(userId, pet.coverMediaId, 'cover image');
    this.pets.set(pet.id, pet);
    if (toNumber(input.weightKg) !== null) {
      void this.createWeightRecord(userId, pet.id, {
        weightKg: input.weightKg,
        recordedAt: new Date().toISOString(),
      });
    }
    const historicalVaccinations = Array.isArray(input.historicalVaccinations)
      ? input.historicalVaccinations
      : [];
    for (const item of historicalVaccinations) {
      if (item && typeof item === 'object') {
        void this.createVaccination(userId, pet.id, item as Record<string, unknown>);
      }
    }
    return this.serializePet(userId, pet, true);
  }

  async updatePet(userId: number, petId: number, input: PetUpdateInput): Promise<PetPayload> {
    const pet = this.requireOwnedPet(userId, petId);
    if (input.name !== undefined) {
      const nextName = normalizeText(input.name);
      if (!nextName) throw buildRecordError('VALIDATION', 'Pet name is required');
      pet.name = nextName;
    }
    if (
      input.animalTypeId !== undefined ||
      input.petType !== undefined ||
      input.species !== undefined
    ) {
      const nextAnimalTypeId =
        toInt(input.animalTypeId) ??
        this.resolveAnimalTypeId(normalizeText(input.petType ?? input.species));
      if (!nextAnimalTypeId) throw buildRecordError('VALIDATION', 'Animal type is required');
      pet.animalTypeId = nextAnimalTypeId;
      pet.animalTypeName = this.resolveAnimalTypeName(nextAnimalTypeId);
    }
    if (input.breedId !== undefined) pet.breedId = toInt(input.breedId);
    if (input.subBreedId !== undefined) pet.subBreedId = toInt(input.subBreedId);
    if (input.colorId !== undefined) pet.colorId = toInt(input.colorId);
    if (input.coatPatternId !== undefined) pet.coatPatternId = toInt(input.coatPatternId);
    if (input.sizeId !== undefined) pet.sizeId = toInt(input.sizeId);
    if (input.customBreedText !== undefined)
      pet.customBreedText = normalizeText(input.customBreedText);
    if (input.customColorText !== undefined)
      pet.customColorText = normalizeText(input.customColorText);
    if (input.dateOfBirth !== undefined) pet.dateOfBirth = parseDate(input.dateOfBirth);
    if (input.sex !== undefined || input.gender !== undefined)
      pet.sex = toSex(input.sex ?? input.gender);
    if (input.microchipNumber !== undefined) {
      const microchip = normalizeText(input.microchipNumber);
      if (microchip) this.ensureMicrochipAvailable(microchip, petId);
      pet.microchipNumber = microchip;
    }
    if (input.isRescue !== undefined) pet.isRescue = toBool(input.isRescue);
    if (input.isNeutered !== undefined) pet.isNeutered = toBool(input.isNeutered);
    if (input.foodHabits !== undefined) pet.foodHabits = normalizeText(input.foodHabits);
    if (input.healthDisorders !== undefined)
      pet.healthDisorders = normalizeText(input.healthDisorders);
    if (input.notes !== undefined) pet.notes = normalizeText(input.notes);
    if (input.bloodType !== undefined) pet.bloodType = normalizeText(input.bloodType);
    if (input.allergies !== undefined) pet.allergies = stringArray(input.allergies);
    if (input.profilePicId !== undefined || input.profileImageId !== undefined) {
      pet.profilePicId = toInt(input.profilePicId ?? input.profileImageId);
      this.validatePetMedia(userId, pet.profilePicId, 'profile image');
    }
    if (input.coverMediaId !== undefined) {
      pet.coverMediaId = toInt(input.coverMediaId);
      this.validatePetMedia(userId, pet.coverMediaId, 'cover image');
    }
    if (input.bio !== undefined) pet.bio = normalizeText(input.bio);
    if (input.isPublicProfileEnabled !== undefined)
      pet.isPublicProfileEnabled = toBool(input.isPublicProfileEnabled);
    if (input.visibility !== undefined)
      pet.visibility = toVisibility(input.visibility, pet.visibility);
    pet.breedName = this.resolveBreedName(pet.animalTypeId, pet.breedId, pet.customBreedText);
    pet.colorName = pet.customColorText;
    pet.sizeName = this.resolveSizeName(pet.sizeId);
    pet.coatPatternName = this.resolveCoatPatternName(pet.coatPatternId);
    pet.updatedAt = new Date();
    return this.serializePet(userId, pet, true);
  }

  async deletePet(userId: number, petId: number): Promise<{ id: number; deleted: true }> {
    const pet = this.requireOwnedPet(userId, petId);
    pet.status = 'DELETED';
    pet.updatedAt = new Date();
    return { id: petId, deleted: true };
  }

  async updatePetProfile(
    userId: number,
    petId: number,
    input: PetProfileUpdateInput,
  ): Promise<PetPayload> {
    const pet = this.requireOwnedPet(userId, petId);
    if (input.slug !== undefined) {
      const slug = this.resolveSlug(input.slug, pet.name);
      this.ensureSlugAvailable(slug, petId);
      pet.slug = slug;
    }
    if (input.bio !== undefined) pet.bio = normalizeText(input.bio);
    if (input.coverMediaId !== undefined) {
      pet.coverMediaId = toInt(input.coverMediaId);
      this.validatePetMedia(userId, pet.coverMediaId, 'cover image');
    }
    if (input.isPublicProfileEnabled !== undefined)
      pet.isPublicProfileEnabled = toBool(input.isPublicProfileEnabled);
    if (input.visibility !== undefined)
      pet.visibility = toVisibility(input.visibility, pet.visibility);
    pet.updatedAt = new Date();
    return this.serializePet(userId, pet, true);
  }

  async followPet(userId: number, petId: number): Promise<{ followed: true }> {
    const pet = this.requirePet(petId);
    if (!this.canFollowOrLike(pet))
      throw buildRecordError('NOT_FOUND', 'Pet not found or profile not public');
    if (pet.ownerUserId === userId)
      throw buildRecordError('VALIDATION', 'You cannot follow your own pet');
    const key = this.socialKey(userId, petId, 'follow');
    if (this.follows.has(key)) throw buildRecordError('CONFLICT', 'Already following');
    this.follows.add(key);
    pet.followersCount += 1;
    pet.updatedAt = new Date();
    return { followed: true };
  }

  async unfollowPet(userId: number, petId: number): Promise<{ followed: false }> {
    const pet = this.requirePet(petId);
    const key = this.socialKey(userId, petId, 'follow');
    if (!this.follows.has(key)) throw buildRecordError('NOT_FOUND', 'Not following');
    this.follows.delete(key);
    pet.followersCount = Math.max(0, pet.followersCount - 1);
    pet.updatedAt = new Date();
    return { followed: false };
  }

  async likePet(userId: number, petId: number): Promise<{ liked: true }> {
    const pet = this.requirePet(petId);
    if (!this.canFollowOrLike(pet))
      throw buildRecordError('NOT_FOUND', 'Pet not found or profile not public');
    if (pet.ownerUserId === userId)
      throw buildRecordError('VALIDATION', 'You cannot like your own pet');
    const key = this.socialKey(userId, petId, 'like');
    if (this.likes.has(key)) throw buildRecordError('CONFLICT', 'Already liked');
    this.likes.add(key);
    pet.likesCount += 1;
    pet.updatedAt = new Date();
    return { liked: true };
  }

  async unlikePet(userId: number, petId: number): Promise<{ liked: false }> {
    const pet = this.requirePet(petId);
    const key = this.socialKey(userId, petId, 'like');
    if (!this.likes.has(key)) throw buildRecordError('NOT_FOUND', 'Not liked');
    this.likes.delete(key);
    pet.likesCount = Math.max(0, pet.likesCount - 1);
    pet.updatedAt = new Date();
    return { liked: false };
  }

  async getPetSocialStatus(userId: number, petId: number): Promise<PetSocialStatus> {
    const pet = this.requirePet(petId);
    return {
      isFollowing: this.follows.has(this.socialKey(userId, petId, 'follow')),
      isLiked: this.likes.has(this.socialKey(userId, petId, 'like')),
      isOwner: pet.ownerUserId === userId,
      canManage: pet.ownerUserId === userId,
      followersCount: pet.followersCount,
      likesCount: pet.likesCount,
    };
  }

  async getPetPosts(
    viewerId: number | null,
    petId: number,
    limit: number,
    cursor?: unknown,
  ): Promise<PetPostsPayload> {
    const pet = this.requirePet(petId);
    if (!this.canViewPublicProfile(pet, viewerId)) {
      return { items: [], nextCursor: null, hasMore: false };
    }
    const take = Math.max(1, Math.min(Number(limit) || 20, 50));
    const items = [...(this.posts.get(petId) ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
    );
    const cursorId = toInt(cursor);
    const filtered = cursorId ? items.filter((post) => post.id < cursorId) : items;
    const page = filtered.slice(0, take);
    const last = page.at(-1);
    return {
      items: page.map((post) => this.serializePost(post, viewerId)),
      nextCursor: page.length === take && last ? last.id : null,
      hasMore: filtered.length > take,
    };
  }

  async createPetPost(
    userId: number,
    petId: number,
    input: { caption?: unknown; type?: unknown; mediaIds?: unknown; privacy?: unknown },
  ): Promise<Record<string, unknown>> {
    const pet = this.requireOwnedPet(userId, petId);
    const caption = normalizeText(input.caption);
    const mediaIds = Array.isArray(input.mediaIds)
      ? input.mediaIds.map((item) => toInt(item)).filter((value): value is number => value !== null)
      : [];
    if (!caption && mediaIds.length === 0)
      throw buildRecordError('VALIDATION', 'Post must have caption or media');
    const type = this.parsePostType(input.type);
    const privacy = this.parsePrivacy(input.privacy);
    const post: PetPostRecord = {
      id: this.nextPostId++,
      petId: pet.id,
      authorUserId: userId,
      caption,
      type,
      privacy,
      mediaIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.validatePostMedia(userId, mediaIds);
    const list = this.posts.get(petId) ?? [];
    list.unshift(post);
    this.posts.set(petId, list);
    return this.serializePost(post, userId);
  }

  async getPetProfile(userId: number, petId: number): Promise<PetProfilePayload> {
    const pet = this.requireOwnedPet(userId, petId);
    return this.serializePetProfile(pet, userId);
  }

  async listVaccinations(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; vaccinations: Record<string, unknown>[] }> {
    this.requirePetAccess(userId, petId);
    return {
      petId,
      vaccinations: [...(this.vaccinations.get(petId) ?? [])]
        .sort(this.sortByDateDesc)
        .map((item) => this.serializeVaccination(item)),
    };
  }

  async getVaccination(
    userId: number,
    petId: number,
    vaccinationId: number,
  ): Promise<Record<string, unknown>> {
    this.requirePetAccess(userId, petId);
    return this.serializeVaccination(this.requireVaccination(petId, vaccinationId));
  }

  async createVaccination(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const vaccination = this.buildVaccination(petId, input);
    const list = this.vaccinations.get(petId) ?? [];
    list.unshift(vaccination);
    this.vaccinations.set(petId, list);
    return this.serializeVaccination(vaccination);
  }

  async updateVaccination(
    userId: number,
    petId: number,
    vaccinationId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const vaccination = this.requireVaccination(petId, vaccinationId);
    if (input.vaccineTypeId !== undefined || input.vaccineName !== undefined) {
      vaccination.vaccineTypeId = toInt(input.vaccineTypeId);
      vaccination.vaccineName = normalizeText(input.vaccineName);
    }
    if (input.administeredAt !== undefined)
      vaccination.administeredAt = parseDate(input.administeredAt);
    if (input.nextDueDate !== undefined) vaccination.nextDueDate = parseDate(input.nextDueDate);
    if (input.batchNumber !== undefined) vaccination.batchNumber = normalizeText(input.batchNumber);
    if (input.manufacturer !== undefined)
      vaccination.manufacturer = normalizeText(input.manufacturer);
    if (input.vetClinic !== undefined) vaccination.vetClinic = normalizeText(input.vetClinic);
    if (input.notes !== undefined) vaccination.notes = normalizeText(input.notes);
    vaccination.createdAt = vaccination.createdAt ?? new Date();
    return this.serializeVaccination(vaccination);
  }

  async deleteVaccination(
    userId: number,
    petId: number,
    vaccinationId: number,
  ): Promise<{ id: number; deleted: true }> {
    this.requireOwnedPet(userId, petId);
    const list = this.vaccinations.get(petId) ?? [];
    const index = list.findIndex((item) => item.id === vaccinationId);
    if (index < 0) throw buildRecordError('NOT_FOUND', 'Vaccination not found');
    list.splice(index, 1);
    this.vaccinations.set(petId, list);
    return { id: vaccinationId, deleted: true };
  }

  async listMedicalHistory(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; medicalHistory: Record<string, unknown>[] }> {
    this.requirePetAccess(userId, petId);
    return {
      petId,
      medicalHistory: [...(this.medicalHistory.get(petId) ?? [])]
        .sort(this.sortByDateDesc)
        .map((item) => this.serializeMedicalHistory(item)),
    };
  }

  async getMedicalHistoryRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<Record<string, unknown>> {
    this.requirePetAccess(userId, petId);
    return this.serializeMedicalHistory(this.requireMedicalHistory(petId, recordId));
  }

  async createMedicalHistoryRecord(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const record = this.buildMedicalHistory(petId, input);
    const list = this.medicalHistory.get(petId) ?? [];
    list.unshift(record);
    this.medicalHistory.set(petId, list);
    return this.serializeMedicalHistory(record);
  }

  async updateMedicalHistoryRecord(
    userId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const record = this.requireMedicalHistory(petId, recordId);
    if (input.condition !== undefined) {
      const next = normalizeText(input.condition);
      if (!next) throw buildRecordError('VALIDATION', 'Condition is required');
      record.condition = next;
    }
    if (input.treatment !== undefined) record.treatment = normalizeText(input.treatment);
    if (input.doctorName !== undefined) record.doctorName = normalizeText(input.doctorName);
    if (input.clinicName !== undefined) record.clinicName = normalizeText(input.clinicName);
    if (input.visitDate !== undefined) record.visitDate = parseDate(input.visitDate);
    if (input.followUpDate !== undefined) record.followUpDate = parseDate(input.followUpDate);
    record.updatedAt = new Date();
    return this.serializeMedicalHistory(record);
  }

  async deleteMedicalHistoryRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<{ id: number; deleted: true }> {
    this.requireOwnedPet(userId, petId);
    const list = this.medicalHistory.get(petId) ?? [];
    const index = list.findIndex((item) => item.id === recordId);
    if (index < 0) throw buildRecordError('NOT_FOUND', 'Medical history record not found');
    list.splice(index, 1);
    this.medicalHistory.set(petId, list);
    return { id: recordId, deleted: true };
  }

  async listDewormingRecords(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; dewormingHistory: Record<string, unknown>[] }> {
    this.requirePetAccess(userId, petId);
    return {
      petId,
      dewormingHistory: [...(this.deworming.get(petId) ?? [])]
        .sort(this.sortByDateDesc)
        .map((item) => this.serializeDeworming(item)),
    };
  }

  async getDewormingRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<Record<string, unknown>> {
    this.requirePetAccess(userId, petId);
    return this.serializeDeworming(this.requireDeworming(petId, recordId));
  }

  async createDewormingRecord(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const record = this.buildDeworming(petId, input);
    const list = this.deworming.get(petId) ?? [];
    list.unshift(record);
    this.deworming.set(petId, list);
    return this.serializeDeworming(record);
  }

  async updateDewormingRecord(
    userId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const record = this.requireDeworming(petId, recordId);
    if (input.medicationName !== undefined) {
      const next = normalizeText(input.medicationName);
      if (!next) throw buildRecordError('VALIDATION', 'Medication name is required');
      record.medicationName = next;
    }
    if (input.dosage !== undefined) record.dosage = normalizeText(input.dosage);
    if (input.weightAtTime !== undefined) record.weightAtTime = toNumber(input.weightAtTime);
    if (input.administeredAt !== undefined) record.administeredAt = parseDate(input.administeredAt);
    if (input.nextDueDate !== undefined) record.nextDueDate = parseDate(input.nextDueDate);
    if (input.notes !== undefined) record.notes = normalizeText(input.notes);
    record.updatedAt = new Date();
    return this.serializeDeworming(record);
  }

  async deleteDewormingRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<{ id: number; deleted: true }> {
    this.requireOwnedPet(userId, petId);
    const list = this.deworming.get(petId) ?? [];
    const index = list.findIndex((item) => item.id === recordId);
    if (index < 0) throw buildRecordError('NOT_FOUND', 'Deworming record not found');
    list.splice(index, 1);
    this.deworming.set(petId, list);
    return { id: recordId, deleted: true };
  }

  async listWeightRecords(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; weightHistory: Record<string, unknown>[] }> {
    this.requirePetAccess(userId, petId);
    return {
      petId,
      weightHistory: [...(this.weights.get(petId) ?? [])]
        .sort(this.sortByDateDesc)
        .map((item) => this.serializeWeight(item)),
    };
  }

  async getWeightRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<Record<string, unknown>> {
    this.requirePetAccess(userId, petId);
    return this.serializeWeight(this.requireWeight(petId, recordId));
  }

  async createWeightRecord(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const record = this.buildWeight(petId, input);
    const list = this.weights.get(petId) ?? [];
    list.unshift(record);
    this.weights.set(petId, list);
    return this.serializeWeight(record);
  }

  async updateWeightRecord(
    userId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const record = this.requireWeight(petId, recordId);
    if (input.weightKg !== undefined) {
      const next = toNumber(input.weightKg);
      if (next === null) throw buildRecordError('VALIDATION', 'Weight is required');
      record.weightKg = next;
    }
    if (input.notes !== undefined) record.notes = normalizeText(input.notes);
    if (input.recordedAt !== undefined)
      record.recordedAt = parseDate(input.recordedAt) ?? record.recordedAt;
    return this.serializeWeight(record);
  }

  async deleteWeightRecord(
    userId: number,
    petId: number,
    recordId: number,
  ): Promise<{ id: number; deleted: true }> {
    this.requireOwnedPet(userId, petId);
    const list = this.weights.get(petId) ?? [];
    const index = list.findIndex((item) => item.id === recordId);
    if (index < 0) throw buildRecordError('NOT_FOUND', 'Weight record not found');
    list.splice(index, 1);
    this.weights.set(petId, list);
    return { id: recordId, deleted: true };
  }

  async listDocuments(
    userId: number,
    petId: number,
  ): Promise<{ petId: number; documents: Record<string, unknown>[] }> {
    this.requirePetAccess(userId, petId);
    return {
      petId,
      documents: [...(this.documents.get(petId) ?? [])]
        .sort(this.sortDocuments)
        .map((item) => this.serializeDocument(item)),
    };
  }

  async getDocument(
    userId: number,
    petId: number,
    documentId: number,
  ): Promise<Record<string, unknown>> {
    this.requirePetAccess(userId, petId);
    return this.serializeDocument(this.requireDocument(petId, documentId));
  }

  async createDocument(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const document = this.buildDocument(userId, petId, input);
    const list = this.documents.get(petId) ?? [];
    list.unshift(document);
    this.documents.set(petId, list);
    return this.serializeDocument(document);
  }

  async updateDocument(
    userId: number,
    petId: number,
    documentId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.requireOwnedPet(userId, petId);
    const document = this.requireDocument(petId, documentId);
    if (input.mediaId !== undefined) {
      const mediaId = toInt(input.mediaId);
      this.validateDocumentMedia(userId, mediaId, document.category);
      document.mediaId = mediaId ?? document.mediaId;
    }
    if (input.category !== undefined) {
      const category = this.parseDocumentCategory(input.category);
      this.validateDocumentMedia(userId, document.mediaId, category);
      document.category = category;
    }
    if (input.title !== undefined) {
      const next = normalizeText(input.title);
      if (!next) throw buildRecordError('VALIDATION', 'Title is required');
      document.title = next;
    }
    if (input.documentDate !== undefined) document.documentDate = parseDate(input.documentDate);
    if (input.notes !== undefined) document.notes = normalizeText(input.notes);
    document.updatedAt = new Date();
    return this.serializeDocument(document);
  }

  async deleteDocument(
    userId: number,
    petId: number,
    documentId: number,
  ): Promise<{ id: number; deleted: true }> {
    this.requireOwnedPet(userId, petId);
    const list = this.documents.get(petId) ?? [];
    const index = list.findIndex((item) => item.id === documentId);
    if (index < 0) throw buildRecordError('NOT_FOUND', 'Pet document not found');
    list.splice(index, 1);
    this.documents.set(petId, list);
    return { id: documentId, deleted: true };
  }

  async getPetMedicalHistory(
    userId: number,
    petId: number,
  ): Promise<{
    pet: PetPayload;
    profile: Record<string, unknown>;
    vaccinations: Record<string, unknown>[];
    medicalHistory: Record<string, unknown>[];
    dewormingHistory: Record<string, unknown>[];
    weightHistory: Record<string, unknown>[];
    documents: Record<string, unknown>[];
  }> {
    const pet = this.requireOwnedPet(userId, petId);
    const payload = this.serializePet(userId, pet, true);
    const vaccinations = (await this.listVaccinations(userId, petId)).vaccinations;
    const medicalHistory = (await this.listMedicalHistory(userId, petId)).medicalHistory;
    const dewormingHistory = (await this.listDewormingRecords(userId, petId)).dewormingHistory;
    const weightHistory = (await this.listWeightRecords(userId, petId)).weightHistory;
    const documents = (await this.listDocuments(userId, petId)).documents;
    return {
      pet: payload,
      profile: {
        allergies: payload.allergies,
        bloodType: payload.bloodType,
        foodHabits: payload.foodHabits,
        healthDisorders: payload.healthDisorders,
        notes: payload.notes,
        healthCard: {},
        identityDetails: {},
      },
      vaccinations,
      medicalHistory,
      dewormingHistory,
      weightHistory,
      documents,
    };
  }

  private seed(): void {
    const luna = this.createSeedPet({
      ownerUserId: 1,
      name: 'Luna',
      slug: 'luna',
      animalTypeId: 1,
      breedId: 11,
      customBreedText: null,
      dateOfBirth: new Date('2021-03-14T00:00:00.000Z'),
      sex: 'FEMALE',
      microchipNumber: 'LUNA001',
      isRescue: false,
      isNeutered: true,
      foodHabits: 'Dry food and chicken',
      healthDisorders: null,
      notes: 'Friendly and active',
      bloodType: 'DEA 1.1+',
      allergies: ['pollen'],
      profilePicId: 1,
      coverMediaId: 2,
      bio: 'A calm and playful family dog.',
      isPublicProfileEnabled: true,
      visibility: 'PUBLIC',
    });
    this.createSeedWeight(luna.id, 18.2, '2025-05-20T00:00:00.000Z');
    this.createSeedVaccination(luna.id, {
      vaccineName: 'Rabies',
      administeredAt: '2025-01-02T00:00:00.000Z',
      nextDueDate: '2026-01-02T00:00:00.000Z',
    });
    this.createSeedMedicalHistory(luna.id, {
      condition: 'Annual checkup',
      visitDate: '2025-01-02T00:00:00.000Z',
    });
    this.createSeedDeworming(luna.id, {
      medicationName: 'Ivermectin',
      administeredAt: '2025-03-02T00:00:00.000Z',
      nextDueDate: '2025-09-02T00:00:00.000Z',
    });
    this.createSeedDocument(luna.id, {
      mediaId: 2,
      category: 'PROFILE_IMAGE',
      title: 'Luna profile image',
      documentDate: '2025-03-14T00:00:00.000Z',
    });
    this.createSeedPost(luna.id, {
      caption: 'Morning walk',
      mediaIds: [1],
      type: 'IMAGE',
      privacy: 'PUBLIC',
    });

    const max = this.createSeedPet({
      ownerUserId: 1,
      name: 'Max',
      slug: 'max',
      animalTypeId: 1,
      breedId: 12,
      customBreedText: null,
      dateOfBirth: new Date('2020-09-01T00:00:00.000Z'),
      sex: 'MALE',
      microchipNumber: 'MAX002',
      isRescue: true,
      isNeutered: true,
      foodHabits: 'Home cooked',
      healthDisorders: 'Skin sensitivity',
      notes: 'Private pet',
      bloodType: null,
      allergies: [],
      profilePicId: null,
      coverMediaId: null,
      bio: 'Private family companion.',
      isPublicProfileEnabled: false,
      visibility: 'PRIVATE',
    });
    this.createSeedWeight(max.id, 24.1, '2025-06-01T00:00:00.000Z');
  }

  private createSeedPet(input: {
    ownerUserId: number;
    name: string;
    slug: string | null;
    animalTypeId: number;
    breedId: number | null;
    customBreedText: string | null;
    dateOfBirth: Date | null;
    sex: PetSex;
    microchipNumber: string | null;
    isRescue: boolean;
    isNeutered: boolean;
    foodHabits: string | null;
    healthDisorders: string | null;
    notes: string | null;
    bloodType: string | null;
    allergies: string[];
    profilePicId: number | null;
    coverMediaId: number | null;
    bio: string | null;
    isPublicProfileEnabled: boolean;
    visibility: PetVisibility;
  }): PetRecord {
    const pet: PetRecord = {
      id: this.nextPetId++,
      ownerUserId: input.ownerUserId,
      name: input.name,
      slug: input.slug,
      animalTypeId: input.animalTypeId,
      breedId: input.breedId,
      subBreedId: null,
      colorId: null,
      coatPatternId: null,
      sizeId: null,
      customBreedText: input.customBreedText,
      customColorText: null,
      animalTypeName: this.resolveAnimalTypeName(input.animalTypeId),
      breedName: this.resolveBreedName(input.animalTypeId, input.breedId, input.customBreedText),
      colorName: null,
      sizeName: null,
      coatPatternName: null,
      dateOfBirth: input.dateOfBirth,
      sex: input.sex,
      microchipNumber: input.microchipNumber,
      isRescue: input.isRescue,
      isNeutered: input.isNeutered,
      foodHabits: input.foodHabits,
      healthDisorders: input.healthDisorders,
      notes: input.notes,
      bloodType: input.bloodType,
      allergies: input.allergies,
      profilePicId: input.profilePicId,
      coverMediaId: input.coverMediaId,
      bio: input.bio,
      isPublicProfileEnabled: input.isPublicProfileEnabled,
      visibility: input.visibility,
      followersCount: 0,
      likesCount: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.pets.set(pet.id, pet);
    return pet;
  }

  private createSeedWeight(petId: number, weightKg: number, recordedAt: string) {
    const item: WeightRecord = {
      id: this.nextWeightId++,
      petId,
      weightKg,
      notes: null,
      recordedAt: new Date(recordedAt),
      createdAt: new Date(recordedAt),
    };
    this.weights.set(petId, [item, ...(this.weights.get(petId) ?? [])]);
  }

  private createSeedVaccination(
    petId: number,
    input: { vaccineName: string; administeredAt: string; nextDueDate?: string | null },
  ) {
    const item: VaccinationRecord = {
      id: this.nextVaccinationId++,
      petId,
      vaccineTypeId: null,
      vaccineName: input.vaccineName,
      status: 'ACTIVE',
      administeredAt: new Date(input.administeredAt),
      nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
      batchNumber: null,
      manufacturer: null,
      vetClinic: null,
      notes: null,
      createdAt: new Date(input.administeredAt),
    };
    this.vaccinations.set(petId, [item, ...(this.vaccinations.get(petId) ?? [])]);
  }

  private createSeedMedicalHistory(petId: number, input: { condition: string; visitDate: string }) {
    const item: MedicalHistoryRecord = {
      id: this.nextMedicalHistoryId++,
      petId,
      condition: input.condition,
      treatment: null,
      doctorName: null,
      clinicName: null,
      visitDate: new Date(input.visitDate),
      followUpDate: null,
      createdAt: new Date(input.visitDate),
      updatedAt: new Date(input.visitDate),
    };
    this.medicalHistory.set(petId, [item, ...(this.medicalHistory.get(petId) ?? [])]);
  }

  private createSeedDeworming(
    petId: number,
    input: { medicationName: string; administeredAt: string; nextDueDate: string },
  ) {
    const item: DewormingRecord = {
      id: this.nextDewormingId++,
      petId,
      medicationName: input.medicationName,
      dosage: null,
      weightAtTime: null,
      administeredAt: new Date(input.administeredAt),
      nextDueDate: new Date(input.nextDueDate),
      notes: null,
      createdAt: new Date(input.administeredAt),
      updatedAt: new Date(input.administeredAt),
    };
    this.deworming.set(petId, [item, ...(this.deworming.get(petId) ?? [])]);
  }

  private createSeedDocument(
    petId: number,
    input: { mediaId: number; category: PetDocumentCategory; title: string; documentDate: string },
  ) {
    const item: DocumentRecord = {
      id: this.nextDocumentId++,
      petId,
      mediaId: input.mediaId,
      category: input.category,
      title: input.title,
      documentDate: new Date(input.documentDate),
      notes: null,
      uploadedByUserId: 1,
      createdAt: new Date(input.documentDate),
      updatedAt: new Date(input.documentDate),
    };
    this.documents.set(petId, [item, ...(this.documents.get(petId) ?? [])]);
  }

  private createSeedPost(
    petId: number,
    input: {
      caption: string;
      mediaIds: number[];
      type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL';
      privacy: 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
    },
  ) {
    const item: PetPostRecord = {
      id: this.nextPostId++,
      petId,
      authorUserId: this.requirePet(petId).ownerUserId,
      caption: input.caption,
      type: input.type,
      privacy: input.privacy,
      mediaIds: [...input.mediaIds],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.posts.set(petId, [item, ...(this.posts.get(petId) ?? [])]);
  }

  private resolveAnimalTypeId(label: string | null): number | null {
    if (!label) return null;
    const normalized = label.trim().toLowerCase();
    const entry = this.animalTypes.find((item) => item.name.toLowerCase() === normalized);
    return entry?.id ?? null;
  }

  private resolveAnimalTypeName(id: number | null): string | null {
    if (!id) return null;
    return this.animalTypes.find((item) => item.id === id)?.name ?? null;
  }

  private resolveBreedName(
    animalTypeId: number,
    breedId: unknown,
    customBreedText: unknown,
  ): string | null {
    if (normalizeText(customBreedText)) return normalizeText(customBreedText);
    const id = toInt(breedId);
    if (!id) return null;
    return this.breeds.get(animalTypeId)?.find((item) => item.id === id)?.name ?? null;
  }

  private resolveSizeName(sizeId: unknown): string | null {
    const id = toInt(sizeId);
    if (!id) return null;
    return this.sizes.find((item) => item.id === id)?.name ?? null;
  }

  private resolveCoatPatternName(coatPatternId: unknown): string | null {
    const id = toInt(coatPatternId);
    if (!id) return null;
    return this.coatPatterns.find((item) => item.id === id)?.name ?? null;
  }

  private resolveSlug(inputSlug: unknown, fallbackName: string): string | null {
    const raw = normalizeText(inputSlug);
    return slugify(raw ?? fallbackName) || null;
  }

  private ensureSlugAvailable(slug: string | null, excludePetId: number | null): void {
    if (!slug) return;
    const conflict = [...this.pets.values()].find(
      (pet) =>
        pet.slug?.toLowerCase() === slug.toLowerCase() &&
        pet.id !== excludePetId &&
        pet.status === 'ACTIVE',
    );
    if (conflict)
      throw buildRecordError('CONFLICT', 'This username is already taken', { field: 'slug' });
  }

  private ensureMicrochipAvailable(microchip: string, excludePetId: number | null): void {
    const normalized = microchip.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const conflict = [...this.pets.values()].find((pet) => {
      if (pet.id === excludePetId || pet.status !== 'ACTIVE' || !pet.microchipNumber) return false;
      return pet.microchipNumber.replace(/[^a-z0-9]/gi, '').toUpperCase() === normalized;
    });
    if (conflict)
      throw buildRecordError('CONFLICT', 'This microchip number is already used', {
        field: 'microchipNumber',
      });
  }

  private requirePet(petId: number): PetRecord {
    const pet = this.pets.get(petId);
    if (!pet || pet.status === 'DELETED') throw buildRecordError('NOT_FOUND', 'Pet not found');
    return pet;
  }

  private requireOwnedPet(userId: number, petId: number): PetRecord {
    const pet = this.requirePet(petId);
    if (pet.ownerUserId !== userId) throw buildRecordError('FORBIDDEN', 'You do not own this pet');
    return pet;
  }

  private requirePetAccess(userId: number, petId: number): PetRecord {
    const pet = this.requirePet(petId);
    if (pet.ownerUserId !== userId && !this.canViewPublicProfile(pet, userId)) {
      throw buildRecordError('FORBIDDEN', 'This profile is private');
    }
    return pet;
  }

  private isOwnedActivePet(userId: number, pet: PetRecord): boolean {
    return pet.ownerUserId === userId && pet.status === 'ACTIVE';
  }

  private canViewPublicProfile(pet: PetRecord, viewerId: number | null): boolean {
    if (pet.status === 'DELETED') return false;
    if (viewerId !== null && pet.ownerUserId === viewerId) return true;
    if (!pet.isPublicProfileEnabled) return false;
    return pet.visibility === 'PUBLIC' || pet.visibility === 'FOLLOWERS_ONLY';
  }

  private validatePetMedia(userId: number, mediaId: number | null, label: string): void {
    if (mediaId === null) return;
    const media = this.mediaLookup.getMedia(mediaId);
    if (!media) throw buildRecordError('NOT_FOUND', `${label} media not found`);
    if (media.ownerUserId !== userId) {
      throw buildRecordError(
        'OWNERSHIP_VIOLATION',
        `${label} media is not owned by the current user`,
      );
    }
  }

  private validatePostMedia(userId: number, mediaIds: number[]): void {
    for (const mediaId of mediaIds) {
      this.validatePetMedia(userId, mediaId, 'Post');
    }
  }

  private parseDocumentCategory(value: unknown): PetDocumentCategory {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    const allowed: PetDocumentCategory[] = [
      'PROFILE_IMAGE',
      'VACCINATION_CARD',
      'VACCINE_CERTIFICATE',
      'PRESCRIPTION',
      'LAB_REPORT',
      'XRAY',
      'ULTRASOUND',
      'SURGERY_DOCUMENT',
      'DISCHARGE_SUMMARY',
      'MEDICAL_OTHER',
    ];
    if (!allowed.includes(normalized as PetDocumentCategory)) {
      throw buildRecordError('VALIDATION', 'Invalid pet document category');
    }
    return normalized as PetDocumentCategory;
  }

  private validateDocumentMedia(
    userId: number,
    mediaId: number | null,
    category: PetDocumentCategory,
  ): void {
    if (mediaId === null) throw buildRecordError('VALIDATION', 'mediaId is required');
    const media = this.mediaLookup.getMedia(mediaId);
    if (!media) throw buildRecordError('NOT_FOUND', 'Media not found for this user');
    if (media.ownerUserId !== userId)
      throw buildRecordError('OWNERSHIP_VIOLATION', 'Media is not owned by the current user');
    const mime = String(media.mimetype || '')
      .toLowerCase()
      .trim();
    const imageOnly = ['PROFILE_IMAGE'];
    const imageOrPdf = [
      'VACCINATION_CARD',
      'VACCINE_CERTIFICATE',
      'PRESCRIPTION',
      'LAB_REPORT',
      'XRAY',
      'ULTRASOUND',
      'SURGERY_DOCUMENT',
      'DISCHARGE_SUMMARY',
      'MEDICAL_OTHER',
    ];
    if (imageOnly.includes(category) && !mime.startsWith('image/')) {
      throw buildRecordError('VALIDATION', 'Invalid media type for profile image');
    }
    if (
      imageOrPdf.includes(category) &&
      !(mime.startsWith('image/') || mime === 'application/pdf')
    ) {
      throw buildRecordError('VALIDATION', 'Invalid media type for pet document');
    }
  }

  private buildVaccination(petId: number, input: Record<string, unknown>): VaccinationRecord {
    const vaccineTypeId = toInt(input.vaccineTypeId);
    const vaccineName = normalizeText(input.vaccineName);
    if (!vaccineTypeId && !vaccineName)
      throw buildRecordError('VALIDATION', 'vaccineTypeId or vaccineName is required');
    return {
      id: this.nextVaccinationId++,
      petId,
      vaccineTypeId,
      vaccineName,
      status: 'ACTIVE',
      administeredAt: parseDate(input.administeredAt),
      nextDueDate: parseDate(input.nextDueDate),
      batchNumber: normalizeText(input.batchNumber),
      manufacturer: normalizeText(input.manufacturer),
      vetClinic: normalizeText(input.vetClinic),
      notes: normalizeText(input.notes),
      createdAt: new Date(),
    };
  }

  private buildMedicalHistory(petId: number, input: Record<string, unknown>): MedicalHistoryRecord {
    const condition = normalizeText(input.condition);
    if (!condition) throw buildRecordError('VALIDATION', 'Condition is required');
    return {
      id: this.nextMedicalHistoryId++,
      petId,
      condition,
      treatment: normalizeText(input.treatment),
      doctorName: normalizeText(input.doctorName),
      clinicName: normalizeText(input.clinicName),
      visitDate: parseDate(input.visitDate),
      followUpDate: parseDate(input.followUpDate),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private buildDeworming(petId: number, input: Record<string, unknown>): DewormingRecord {
    const medicationName = normalizeText(input.medicationName);
    if (!medicationName) throw buildRecordError('VALIDATION', 'Medication name is required');
    return {
      id: this.nextDewormingId++,
      petId,
      medicationName,
      dosage: normalizeText(input.dosage),
      weightAtTime: toNumber(input.weightAtTime),
      administeredAt: parseDate(input.administeredAt),
      nextDueDate: parseDate(input.nextDueDate),
      notes: normalizeText(input.notes),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private buildWeight(petId: number, input: Record<string, unknown>): WeightRecord {
    const weightKg = toNumber(input.weightKg);
    if (weightKg === null) throw buildRecordError('VALIDATION', 'Weight is required');
    return {
      id: this.nextWeightId++,
      petId,
      weightKg,
      notes: normalizeText(input.notes),
      recordedAt: parseDate(input.recordedAt) ?? new Date(),
      createdAt: new Date(),
    };
  }

  private buildDocument(
    userId: number,
    petId: number,
    input: Record<string, unknown>,
  ): DocumentRecord {
    const mediaId = toInt(input.mediaId);
    const category = this.parseDocumentCategory(input.category);
    this.validateDocumentMedia(userId, mediaId, category);
    const title = normalizeText(input.title) ?? `${titleCase(category)} Document`;
    return {
      id: this.nextDocumentId++,
      petId,
      mediaId: mediaId ?? 0,
      category,
      title,
      documentDate: parseDate(input.documentDate),
      notes: normalizeText(input.notes),
      uploadedByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private requireVaccination(petId: number, vaccinationId: number): VaccinationRecord {
    const record = (this.vaccinations.get(petId) ?? []).find((item) => item.id === vaccinationId);
    if (!record) throw buildRecordError('NOT_FOUND', 'Vaccination not found');
    return record;
  }

  private requireMedicalHistory(petId: number, recordId: number): MedicalHistoryRecord {
    const record = (this.medicalHistory.get(petId) ?? []).find((item) => item.id === recordId);
    if (!record) throw buildRecordError('NOT_FOUND', 'Medical history record not found');
    return record;
  }

  private requireDeworming(petId: number, recordId: number): DewormingRecord {
    const record = (this.deworming.get(petId) ?? []).find((item) => item.id === recordId);
    if (!record) throw buildRecordError('NOT_FOUND', 'Deworming record not found');
    return record;
  }

  private requireWeight(petId: number, recordId: number): WeightRecord {
    const record = (this.weights.get(petId) ?? []).find((item) => item.id === recordId);
    if (!record) throw buildRecordError('NOT_FOUND', 'Weight record not found');
    return record;
  }

  private requireDocument(petId: number, documentId: number): DocumentRecord {
    const record = (this.documents.get(petId) ?? []).find((item) => item.id === documentId);
    if (!record) throw buildRecordError('NOT_FOUND', 'Pet document not found');
    return record;
  }

  private serializePet(
    viewerId: number | null,
    pet: PetRecord,
    canViewFullProfile: boolean,
  ): PetPayload {
    const isOwner = viewerId !== null && viewerId === pet.ownerUserId;
    const allowed = canViewFullProfile || isOwner || this.canViewPublicProfile(pet, viewerId);
    const latestWeight = [...(this.weights.get(pet.id) ?? [])].sort(this.sortByDateDesc)[0] ?? null;
    const profilePic = pet.profilePicId ? this.mediaLookup.getMedia(pet.profilePicId) : null;
    const coverMedia = pet.coverMediaId ? this.mediaLookup.getMedia(pet.coverMediaId) : null;
    return {
      id: pet.id,
      name: pet.name,
      slug: pet.slug,
      animalTypeId: pet.animalTypeId,
      breedId: pet.breedId,
      subBreedId: pet.subBreedId,
      colorId: pet.colorId,
      coatPatternId: pet.coatPatternId,
      sizeId: pet.sizeId,
      customBreedText: pet.customBreedText,
      customColorText: pet.customColorText,
      animalTypeName: pet.animalTypeName,
      breedName: pet.breedName,
      colorName: pet.colorName,
      sizeName: pet.sizeName,
      coatPatternName: pet.coatPatternName,
      dateOfBirth: pet.dateOfBirth ? pet.dateOfBirth.toISOString() : null,
      sex: pet.sex,
      microchipNumber: pet.microchipNumber,
      isRescue: pet.isRescue,
      isNeutered: pet.isNeutered,
      foodHabits: pet.foodHabits,
      healthDisorders: pet.healthDisorders,
      notes: pet.notes,
      weightKg: latestWeight ? latestWeight.weightKg : null,
      photoUrl: mediaUrl(profilePic),
      profilePicId: pet.profilePicId,
      bloodType: pet.bloodType,
      allergies: [...pet.allergies],
      bio: pet.bio,
      coverMediaId: pet.coverMediaId,
      coverMediaUrl: mediaUrl(coverMedia),
      isPublicProfileEnabled: pet.isPublicProfileEnabled,
      visibility: pet.visibility,
      followersCount: pet.followersCount,
      likesCount: pet.likesCount,
      isFollowing:
        viewerId === null ? null : this.follows.has(this.socialKey(viewerId, pet.id, 'follow')),
      isLiked: viewerId === null ? null : this.likes.has(this.socialKey(viewerId, pet.id, 'like')),
      isOwner: viewerId === null ? null : isOwner,
      canManage: viewerId === null ? null : isOwner,
      canViewFullProfile: allowed,
    };
  }

  private serializePetProfile(pet: PetRecord, _viewerId: number): PetProfilePayload {
    const weights = this.weights.get(pet.id) ?? [];
    const vaccinations = this.vaccinations.get(pet.id) ?? [];
    const latestWeight = [...weights].sort(this.sortByDateDesc)[0] ?? null;
    const nextDue =
      [...vaccinations]
        .map((item) => item.nextDueDate)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: pet.id,
      name: pet.name,
      photoUrl: mediaUrl(pet.profilePicId ? this.mediaLookup.getMedia(pet.profilePicId) : null),
      ageYears: computeAgeYears(pet.dateOfBirth),
      gender: pet.sex,
      breed: pet.breedName ?? pet.customBreedText ?? null,
      weightKg: latestWeight ? latestWeight.weightKg : null,
      healthStatus: {
        vaccinated: vaccinations.length > 0,
        nextDueDate: nextDue ? nextDue.toISOString() : null,
      },
      pawPoints: this.totalPawPoints(pet.id),
      tier: null,
      familyMembers: [{ id: pet.ownerUserId, relation: 'OWNER', name: 'Owner', avatarUrl: null }],
    };
  }

  private serializeWeight(record: WeightRecord): Record<string, unknown> {
    return {
      id: record.id,
      weightKg: record.weightKg,
      notes: record.notes,
      recordedAt: record.recordedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }

  private serializeVaccination(record: VaccinationRecord): Record<string, unknown> {
    return {
      id: record.id,
      vaccineTypeId: record.vaccineTypeId,
      vaccineName: record.vaccineName,
      status: record.status,
      verificationState: 'SELF_REPORTED',
      administeredAt: record.administeredAt ? record.administeredAt.toISOString() : null,
      nextDueDate: record.nextDueDate ? record.nextDueDate.toISOString() : null,
      batchNumber: record.batchNumber,
      manufacturer: record.manufacturer,
      vetClinic: record.vetClinic,
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private serializeMedicalHistory(record: MedicalHistoryRecord): Record<string, unknown> {
    return {
      id: record.id,
      condition: record.condition,
      treatment: record.treatment,
      doctorName: record.doctorName,
      clinicName: record.clinicName,
      visitDate: record.visitDate ? record.visitDate.toISOString() : null,
      followUpDate: record.followUpDate ? record.followUpDate.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private serializeDeworming(record: DewormingRecord): Record<string, unknown> {
    return {
      id: record.id,
      medicationName: record.medicationName,
      dosage: record.dosage,
      weightAtTime: record.weightAtTime,
      administeredAt: record.administeredAt ? record.administeredAt.toISOString() : null,
      nextDueDate: record.nextDueDate ? record.nextDueDate.toISOString() : null,
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private serializeDocument(record: DocumentRecord): Record<string, unknown> {
    const media = this.mediaLookup.getMedia(record.mediaId);
    const fileUrl = media?.url ?? null;
    return {
      id: record.id,
      petId: record.petId,
      category: record.category,
      title: record.title,
      mediaId: record.mediaId,
      fileUrl,
      url: fileUrl,
      mimeType: media?.mimetype ?? null,
      sizeBytes: media?.size ?? null,
      documentDate: record.documentDate ? record.documentDate.toISOString() : null,
      notes: record.notes,
      uploadedBy: {
        id: record.uploadedByUserId,
        displayName: 'Owner',
        username: 'owner',
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private serializePost(post: PetPostRecord, viewerId: number | null): Record<string, unknown> {
    const media = post.mediaIds.map((mediaId) => {
      const lookup = this.mediaLookup.getMedia(mediaId);
      return {
        id: mediaId,
        media: lookup
          ? {
              id: lookup.id,
              url: lookup.url,
              hlsUrl: lookup.hlsUrl,
              type: mapMimetypeCategory(lookup.mimetype),
              status: lookup.status,
              thumbnailUrl: lookup.thumbnailUrl,
            }
          : null,
      };
    });
    return {
      id: post.id,
      type: post.type,
      category: 'GENERAL',
      caption: post.caption,
      context: null,
      createdAt: post.createdAt.toISOString(),
      author: {
        id: post.authorUserId,
        profile: {
          displayName: 'Owner',
          username: 'owner',
          avatarMedia: null,
        },
      },
      media,
      likeCount: 0,
      commentCount: 0,
      isLikedByMe: viewerId !== null ? false : false,
      isBookmarkedByMe: false,
      privacy: post.privacy,
      backgroundStyle: null,
      feelingId: null,
      feelingLabel: null,
      feelingEmoji: null,
      activityId: null,
      activityLabel: null,
      activityEmoji: null,
      shareCount: 0,
      viewCount: 0,
      isReportedByMe: false,
      isFollowingAuthor: false,
      sponsoredLabel: null,
      locationTag: null,
      postType: null,
      lostPetName: null,
      lostPetLocation: null,
      lostPetContactVisible: false,
      taggedPetIds: [post.petId],
      taggedPets: [{ id: post.petId, name: this.requirePet(post.petId).name, photo: null }],
      songTitle: null,
      songArtist: null,
      songStartMs: null,
      songDurationMs: null,
      _count: { likes: 0, comments: 0 },
    };
  }

  private sortByDateDesc = (a: { createdAt: Date }, b: { createdAt: Date }) =>
    b.createdAt.getTime() - a.createdAt.getTime();

  private sortDocuments = (a: DocumentRecord, b: DocumentRecord) =>
    (b.documentDate?.getTime() ?? 0) - (a.documentDate?.getTime() ?? 0) || b.id - a.id;

  private parsePostType(value: unknown): 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL' {
    const normalized = String(value ?? 'TEXT')
      .trim()
      .toUpperCase();
    return normalized === 'IMAGE' || normalized === 'VIDEO' || normalized === 'REEL'
      ? normalized
      : 'TEXT';
  }

  private parsePrivacy(value: unknown): 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE' {
    const normalized = String(value ?? 'PUBLIC')
      .trim()
      .toUpperCase();
    return normalized === 'FOLLOWERS_ONLY' || normalized === 'PRIVATE' ? normalized : 'PUBLIC';
  }

  private canFollowOrLike(pet: PetRecord): boolean {
    return (
      pet.isPublicProfileEnabled &&
      (pet.visibility === 'PUBLIC' || pet.visibility === 'FOLLOWERS_ONLY')
    );
  }

  private socialKey(userId: number, petId: number, kind: 'follow' | 'like') {
    return `${kind}:${userId}:${petId}`;
  }

  private totalPawPoints(petId: number): number {
    const weightCount = (this.weights.get(petId) ?? []).length;
    const vaccinationCount = (this.vaccinations.get(petId) ?? []).length;
    return 100 + weightCount * 25 + vaccinationCount * 35;
  }

  private animalTypes = [
    { id: 1, name: 'Dog' },
    { id: 2, name: 'Cat' },
    { id: 3, name: 'Bird' },
    { id: 4, name: 'Rabbit' },
  ];

  private breeds = new Map<number, Array<{ id: number; name: string }>>([
    [
      1,
      [
        { id: 11, name: 'Labrador Retriever' },
        { id: 12, name: 'German Shepherd' },
        { id: 13, name: 'Mixed Breed' },
      ],
    ],
    [
      2,
      [
        { id: 21, name: 'Persian' },
        { id: 22, name: 'Siamese' },
        { id: 23, name: 'Domestic Shorthair' },
      ],
    ],
  ]);

  private sizes = [
    { id: 1, name: 'Small' },
    { id: 2, name: 'Medium' },
    { id: 3, name: 'Large' },
  ];

  private coatPatterns = [
    { id: 1, name: 'Solid' },
    { id: 2, name: 'Spotted' },
    { id: 3, name: 'Striped' },
  ];
}

export function createInMemoryPetClient(mediaLookup: PetMediaLookup): InMemoryPetClient {
  return new InMemoryPetClient(mediaLookup);
}
