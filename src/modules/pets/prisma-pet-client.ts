import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import {
  PetContractError,
  type PetContractClient,
  type PetCreateInput,
  type PetDocumentCategory,
  type PetProfileUpdateInput,
  type PetSex,
  type PetUpdateInput,
  type PetVisibility,
} from './pet-client';

const ACTIVE_PET_STATUS = 'ACTIVE';
const ARCHIVED_PET_STATUS = 'ARCHIVED';

type PetWithRelations = Prisma.PetGetPayload<{
  include: {
    animalType: true;
    breed: true;
    profilePic: true;
    coverMedia: true;
    weightRecords: {
      orderBy: { measuredAt: 'desc' };
      take: 1;
    };
  };
}>;

export function createPrismaPetClient(prisma: PrismaClient): PetContractClient {
  return new PrismaPetClient(prisma);
}

class PrismaPetClient implements PetContractClient {
  constructor(private readonly prisma: PrismaClient) {}

  async listMyPets(ownerUserId: number) {
    const pets = await this.prisma.pet.findMany({
      where: {
        ownerUserId,
        status: ACTIVE_PET_STATUS,
        deletedAt: null,
        archivedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.petInclude(),
    });

    return { pets: pets.map((pet) => this.toPetPayload(pet)) };
  }

  async getOwnedPet(ownerUserId: number, petId: number) {
    const pet = await this.findOwnedActivePet(ownerUserId, petId);
    return this.toPetPayload(pet);
  }

  async getPetById(viewerUserId: number | null, petId: number) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, status: ACTIVE_PET_STATUS, deletedAt: null },
      include: this.petInclude(),
    });
    if (!pet || !this.canViewPet(pet, viewerUserId ?? null)) {
      throw new PetContractError('NOT_FOUND', 'Pet not found');
    }
    return this.toPetPayload(pet);
  }

  async getPetBySlug(viewerUserId: number | null, slug: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { slug, status: ACTIVE_PET_STATUS, deletedAt: null },
      include: this.petInclude(),
    });
    if (!pet || !this.canViewPet(pet, viewerUserId ?? null)) {
      throw new PetContractError('NOT_FOUND', 'Pet not found');
    }
    return this.toPetPayload(pet);
  }

  async createPet(ownerUserId: number, input: PetCreateInput) {
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);
    if (idempotencyKey) {
      const existing = await this.prisma.petCreateIdempotencyKey.findUnique({
        where: {
          scope_ownerUserId_key: {
            scope: 'pet.create',
            ownerUserId,
            key: idempotencyKey,
          },
        },
        include: {
          pet: {
            include: this.petInclude(),
          },
        },
      });
      if (existing) return this.toPetPayload(existing.pet);
    }

    const data = await this.buildPetData(ownerUserId, input, null);
    const requestHash = idempotencyKey ? hashRequest(input) : null;

    const createdId = await this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.create({
        data,
      });

      await this.seedHistoricalRecords(tx, pet.id, input);

      if (idempotencyKey) {
        await tx.petCreateIdempotencyKey.create({
          data: {
            ownerUserId,
            scope: 'pet.create',
            key: idempotencyKey,
            requestHash,
            petId: pet.id,
          },
        });
      }

      return pet.id;
    });

    const created = await this.findOwnedActivePet(ownerUserId, createdId);
    return this.toPetPayload(created);
  }

  async updatePet(ownerUserId: number, petId: number, input: PetUpdateInput) {
    const current = await this.findOwnedActivePet(ownerUserId, petId);
    this.assertVersion(current.version, input.version);
    const data = await this.buildPetData(ownerUserId, input, current);

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        ...data,
        version: { increment: 1 },
      },
      include: this.petInclude(),
    });

    return this.toPetPayload(updated);
  }

  async deletePet(ownerUserId: number, petId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    await this.prisma.pet.update({
      where: { id: petId },
      data: {
        status: ARCHIVED_PET_STATUS,
        archivedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return { id: petId, deleted: true as const };
  }

  async updatePetProfile(ownerUserId: number, petId: number, input: PetProfileUpdateInput) {
    const current = await this.findOwnedActivePet(ownerUserId, petId);
    this.assertVersion(current.version, (input as PetUpdateInput).version);
    const coverMediaId = toOptionalPositiveInt(input.coverMediaId);
    if (coverMediaId !== undefined) {
      await this.assertOwnedMedia(ownerUserId, coverMediaId);
    }

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        slug: normalizeOptionalString(input.slug) ?? current.slug,
        bio: normalizeOptionalString(input.bio) ?? current.bio,
        coverMediaId: coverMediaId ?? current.coverMediaId,
        isPublicProfileEnabled:
          typeof input.isPublicProfileEnabled === 'boolean'
            ? input.isPublicProfileEnabled
            : current.isPublicProfileEnabled,
        visibility: normalizeVisibility(input.visibility, current.visibility),
        version: { increment: 1 },
      },
      include: this.petInclude(),
    });

    return this.toPetPayload(updated);
  }

  async followPet(viewerUserId: number, petId: number) {
    const pet = await this.findViewablePet(petId, viewerUserId);
    if (pet.ownerUserId !== viewerUserId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.petFollow.upsert({
          where: { petId_userId: { petId, userId: viewerUserId } },
          update: {},
          create: { petId, userId: viewerUserId },
        });
        const count = await tx.petFollow.count({ where: { petId } });
        await tx.pet.update({ where: { id: petId }, data: { followersCount: count } });
      });
    }
    return { followed: true as const };
  }

  async unfollowPet(viewerUserId: number, petId: number) {
    await this.findViewablePet(petId, viewerUserId);
    await this.prisma.$transaction(async (tx) => {
      await tx.petFollow.deleteMany({ where: { petId, userId: viewerUserId } });
      const count = await tx.petFollow.count({ where: { petId } });
      await tx.pet.update({ where: { id: petId }, data: { followersCount: count } });
    });
    return { followed: false as const };
  }

  async likePet(viewerUserId: number, petId: number) {
    const pet = await this.findViewablePet(petId, viewerUserId);
    if (pet.ownerUserId !== viewerUserId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.petLike.upsert({
          where: { petId_userId: { petId, userId: viewerUserId } },
          update: {},
          create: { petId, userId: viewerUserId },
        });
        const count = await tx.petLike.count({ where: { petId } });
        await tx.pet.update({ where: { id: petId }, data: { likesCount: count } });
      });
    }
    return { liked: true as const };
  }

  async unlikePet(viewerUserId: number, petId: number) {
    await this.findViewablePet(petId, viewerUserId);
    await this.prisma.$transaction(async (tx) => {
      await tx.petLike.deleteMany({ where: { petId, userId: viewerUserId } });
      const count = await tx.petLike.count({ where: { petId } });
      await tx.pet.update({ where: { id: petId }, data: { likesCount: count } });
    });
    return { liked: false as const };
  }

  async getPetSocialStatus(viewerUserId: number, petId: number) {
    const pet = await this.findViewablePet(petId, viewerUserId);
    const [follow, like] = await Promise.all([
      this.prisma.petFollow.findUnique({
        where: { petId_userId: { petId, userId: viewerUserId } },
      }),
      this.prisma.petLike.findUnique({ where: { petId_userId: { petId, userId: viewerUserId } } }),
    ]);

    return {
      isFollowing: Boolean(follow),
      isLiked: Boolean(like),
      isOwner: pet.ownerUserId === viewerUserId,
      canManage: pet.ownerUserId === viewerUserId,
      followersCount: pet.followersCount,
      likesCount: pet.likesCount,
    };
  }

  async getPetPosts(
    viewerUserId: number | null,
    petId: number,
    limitInput: number,
    cursorInput?: unknown,
  ) {
    await this.findViewablePet(petId, viewerUserId ?? null);
    const limit = Math.min(Math.max(limitInput || 20, 1), 50);
    const cursor = toOptionalPositiveInt(cursorInput) ?? null;
    if (cursorInput !== undefined && cursorInput !== null && cursor === null) {
      throw new PetContractError('MALFORMED_CURSOR', 'Invalid pet posts cursor');
    }
    if (cursor !== null && (!Number.isInteger(cursor) || cursor <= 0)) {
      throw new PetContractError('MALFORMED_CURSOR', 'Invalid pet posts cursor');
    }
    const posts = await this.prisma.petPost.findMany({
      where: {
        petId,
        status: ACTIVE_PET_STATUS,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: limit + 1,
    });
    const page = posts.slice(0, limit);
    return {
      items: page.map((post) => ({
        id: post.id,
        petId: post.petId,
        authorUserId: post.authorId,
        caption: post.caption,
        type: 'IMAGE' as const,
        privacy: 'PUBLIC' as const,
        mediaIds: toNumberArray(post.mediaIds),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      })),
      nextCursor: posts.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      hasMore: posts.length > limit,
    };
  }

  async createPetPost(
    ownerUserId: number,
    petId: number,
    input: { caption?: unknown; mediaIds?: unknown },
  ) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const mediaIds = toNumberArray(input.mediaIds);
    for (const mediaId of mediaIds) {
      await this.assertOwnedMedia(ownerUserId, mediaId);
    }
    const created = await this.prisma.petPost.create({
      data: {
        petId,
        authorId: ownerUserId,
        caption: normalizeOptionalString(input.caption),
        mediaIds: mediaIds as Prisma.InputJsonValue,
      },
    });
    return {
      id: created.id,
      petId,
      authorUserId: ownerUserId,
      caption: created.caption,
      type: 'IMAGE' as const,
      privacy: 'PUBLIC' as const,
      mediaIds,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async getPetProfile(ownerUserId: number, petId: number) {
    const pet = await this.findOwnedActivePet(ownerUserId, petId);
    return this.toProfilePayload(pet);
  }

  async listVaccinations(ownerUserId: number, petId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const vaccinations = await this.prisma.petVaccination
      .findMany({
        where: { petId },
        orderBy: [{ administeredAt: 'desc' }, { id: 'desc' }],
      })
      .then((items) =>
        items.map((item) => ({
          id: item.id,
          petId,
          vaccineTypeId: null,
          vaccineName: item.vaccineName,
          status: 'ACTIVE' as const,
          administeredAt: item.administeredAt,
          nextDueDate: item.nextDueAt,
          batchNumber: item.batchNumber,
          manufacturer: null,
          vetClinic: item.veterinarian,
          notes: item.notes,
          createdAt: item.createdAt,
        })),
      );
    return { petId, vaccinations };
  }

  async getVaccination(ownerUserId: number, petId: number, vaccinationId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const item = await this.prisma.petVaccination.findFirst({
      where: { id: vaccinationId, petId },
    });
    if (!item) throw new PetContractError('NOT_FOUND', 'Vaccination record not found');
    return {
      id: item.id,
      petId,
      vaccineTypeId: null,
      vaccineName: item.vaccineName,
      status: 'ACTIVE' as const,
      administeredAt: item.administeredAt,
      nextDueDate: item.nextDueAt,
      batchNumber: item.batchNumber,
      manufacturer: null,
      vetClinic: item.veterinarian,
      notes: item.notes,
      createdAt: item.createdAt,
    };
  }

  async createVaccination(ownerUserId: number, petId: number, input: Record<string, unknown>) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const vaccineName = normalizeRequiredString(input.vaccineName ?? input.name, 'vaccineName');
    const item = await this.prisma.petVaccination.create({
      data: {
        petId,
        vaccineName,
        administeredAt: parseOptionalDate(input.administeredAt),
        nextDueAt: parseOptionalDate(input.nextDueAt ?? input.nextDueDate),
        veterinarian: normalizeOptionalString(input.veterinarian ?? input.vetClinic),
        batchNumber: normalizeOptionalString(input.batchNumber),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getVaccination(ownerUserId, petId, item.id);
  }

  async updateVaccination(
    ownerUserId: number,
    petId: number,
    vaccinationId: number,
    input: Record<string, unknown>,
  ) {
    await this.getVaccination(ownerUserId, petId, vaccinationId);
    await this.prisma.petVaccination.update({
      where: { id: vaccinationId },
      data: {
        vaccineName: normalizeOptionalString(input.vaccineName ?? input.name) ?? undefined,
        administeredAt: parseOptionalDate(input.administeredAt),
        nextDueAt: parseOptionalDate(input.nextDueAt ?? input.nextDueDate),
        veterinarian: normalizeOptionalString(input.veterinarian ?? input.vetClinic),
        batchNumber: normalizeOptionalString(input.batchNumber),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getVaccination(ownerUserId, petId, vaccinationId);
  }

  async deleteVaccination(ownerUserId: number, petId: number, vaccinationId: number) {
    await this.getVaccination(ownerUserId, petId, vaccinationId);
    await this.prisma.petVaccination.delete({ where: { id: vaccinationId } });
    return { id: vaccinationId, deleted: true as const };
  }

  async listMedicalHistory(ownerUserId: number, petId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const items = await this.prisma.petMedicalHistoryRecord.findMany({
      where: { petId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const medicalHistory = items.map((item) => ({
      id: item.id,
      petId,
      condition: item.title,
      treatment: item.treatment,
      doctorName: null,
      clinicName: item.clinic,
      visitDate: item.occurredAt,
      followUpDate: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
    return { petId, medicalHistory };
  }

  async getMedicalHistory(ownerUserId: number, petId: number, recordId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const item = await this.prisma.petMedicalHistoryRecord.findFirst({
      where: { id: recordId, petId },
    });
    if (!item) throw new PetContractError('NOT_FOUND', 'Medical record not found');
    return {
      id: item.id,
      petId,
      condition: item.title,
      treatment: item.treatment,
      doctorName: null,
      clinicName: item.clinic,
      visitDate: item.occurredAt,
      followUpDate: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async createMedicalHistory(ownerUserId: number, petId: number, input: Record<string, unknown>) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const title = normalizeRequiredString(input.condition ?? input.title, 'condition');
    const item = await this.prisma.petMedicalHistoryRecord.create({
      data: {
        petId,
        title,
        occurredAt: parseOptionalDate(input.visitDate ?? input.occurredAt),
        clinic: normalizeOptionalString(input.clinicName ?? input.clinic),
        treatment: normalizeOptionalString(input.treatment),
        diagnosis: normalizeOptionalString(input.diagnosis),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getMedicalHistoryRecord(ownerUserId, petId, item.id);
  }

  async getMedicalHistoryRecord(ownerUserId: number, petId: number, recordId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const item = await this.prisma.petMedicalHistoryRecord.findFirst({
      where: { id: recordId, petId },
    });
    if (!item) throw new PetContractError('NOT_FOUND', 'Medical record not found');
    return {
      id: item.id,
      petId,
      condition: item.title,
      treatment: item.treatment,
      doctorName: null,
      clinicName: item.clinic,
      visitDate: item.occurredAt,
      followUpDate: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async createMedicalHistoryRecord(
    ownerUserId: number,
    petId: number,
    input: Record<string, unknown>,
  ) {
    return this.createMedicalHistory(ownerUserId, petId, input);
  }

  async updateMedicalHistoryRecord(
    ownerUserId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ) {
    await this.getMedicalHistoryRecord(ownerUserId, petId, recordId);
    await this.prisma.petMedicalHistoryRecord.update({
      where: { id: recordId },
      data: {
        title: normalizeOptionalString(input.condition ?? input.title) ?? undefined,
        occurredAt: parseOptionalDate(input.visitDate ?? input.occurredAt),
        clinic: normalizeOptionalString(input.clinicName ?? input.clinic),
        treatment: normalizeOptionalString(input.treatment),
        diagnosis: normalizeOptionalString(input.diagnosis),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getMedicalHistoryRecord(ownerUserId, petId, recordId);
  }

  async deleteMedicalHistoryRecord(ownerUserId: number, petId: number, recordId: number) {
    await this.getMedicalHistoryRecord(ownerUserId, petId, recordId);
    await this.prisma.petMedicalHistoryRecord.delete({ where: { id: recordId } });
    return { id: recordId, deleted: true as const };
  }

  async listDewormingRecords(ownerUserId: number, petId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const items = await this.prisma.petDewormingRecord.findMany({
      where: { petId },
      orderBy: [{ administeredAt: 'desc' }, { id: 'desc' }],
    });
    const dewormingHistory = items.map((item) => ({
      id: item.id,
      petId,
      medicationName: item.medicationName,
      dosage: item.dosage,
      weightAtTime: null,
      administeredAt: item.administeredAt,
      nextDueDate: item.nextDueAt,
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
    return { petId, dewormingHistory };
  }

  async getDewormingRecord(ownerUserId: number, petId: number, recordId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const item = await this.prisma.petDewormingRecord.findFirst({ where: { id: recordId, petId } });
    if (!item) throw new PetContractError('NOT_FOUND', 'Deworming record not found');
    return {
      id: item.id,
      petId,
      medicationName: item.medicationName,
      dosage: item.dosage,
      weightAtTime: null,
      administeredAt: item.administeredAt,
      nextDueDate: item.nextDueAt,
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async createDewormingRecord(ownerUserId: number, petId: number, input: Record<string, unknown>) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const medicationName = normalizeRequiredString(input.medicationName, 'medicationName');
    const item = await this.prisma.petDewormingRecord.create({
      data: {
        petId,
        medicationName,
        administeredAt: parseOptionalDate(input.administeredAt),
        nextDueAt: parseOptionalDate(input.nextDueAt ?? input.nextDueDate),
        dosage: normalizeOptionalString(input.dosage),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getDewormingRecord(ownerUserId, petId, item.id);
  }

  async updateDewormingRecord(
    ownerUserId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ) {
    await this.getDewormingRecord(ownerUserId, petId, recordId);
    await this.prisma.petDewormingRecord.update({
      where: { id: recordId },
      data: {
        medicationName: normalizeOptionalString(input.medicationName) ?? undefined,
        administeredAt: parseOptionalDate(input.administeredAt),
        nextDueAt: parseOptionalDate(input.nextDueAt ?? input.nextDueDate),
        dosage: normalizeOptionalString(input.dosage),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getDewormingRecord(ownerUserId, petId, recordId);
  }

  async deleteDewormingRecord(ownerUserId: number, petId: number, recordId: number) {
    await this.getDewormingRecord(ownerUserId, petId, recordId);
    await this.prisma.petDewormingRecord.delete({ where: { id: recordId } });
    return { id: recordId, deleted: true as const };
  }

  async listWeightRecords(ownerUserId: number, petId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const items = await this.prisma.petWeightRecord.findMany({
      where: { petId },
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
    });
    const weightHistory = items.map((item) => ({
      id: item.id,
      petId,
      weightKg: Number(item.weightKg),
      notes: item.notes,
      recordedAt: item.measuredAt,
      createdAt: item.createdAt,
    }));
    return { petId, weightHistory };
  }

  async getWeightRecord(ownerUserId: number, petId: number, recordId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const item = await this.prisma.petWeightRecord.findFirst({ where: { id: recordId, petId } });
    if (!item) throw new PetContractError('NOT_FOUND', 'Weight record not found');
    return {
      id: item.id,
      petId,
      weightKg: Number(item.weightKg),
      notes: item.notes,
      recordedAt: item.measuredAt,
      createdAt: item.createdAt,
    };
  }

  async createWeightRecord(ownerUserId: number, petId: number, input: Record<string, unknown>) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const weightKg = toRequiredPositiveNumber(input.weightKg, 'weightKg');
    const item = await this.prisma.petWeightRecord.create({
      data: {
        petId,
        weightKg,
        measuredAt: parseOptionalDate(input.recordedAt ?? input.measuredAt) ?? new Date(),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getWeightRecord(ownerUserId, petId, item.id);
  }

  async updateWeightRecord(
    ownerUserId: number,
    petId: number,
    recordId: number,
    input: Record<string, unknown>,
  ) {
    await this.getWeightRecord(ownerUserId, petId, recordId);
    await this.prisma.petWeightRecord.update({
      where: { id: recordId },
      data: {
        weightKg: toOptionalPositiveNumber(input.weightKg) ?? undefined,
        measuredAt: parseOptionalDate(input.recordedAt ?? input.measuredAt) ?? undefined,
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getWeightRecord(ownerUserId, petId, recordId);
  }

  async deleteWeightRecord(ownerUserId: number, petId: number, recordId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const deleted = await this.prisma.petWeightRecord.deleteMany({
      where: { id: recordId, petId },
    });
    if (deleted.count === 0) throw new PetContractError('NOT_FOUND', 'Weight record not found');
    return { id: recordId, deleted: true as const };
  }

  async listDocuments(ownerUserId: number, petId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const documents = await this.prisma.petDocument
      .findMany({
        where: { petId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      .then((items) => items.map((item) => this.toDocumentRecord(item)));
    return { petId, documents };
  }

  async getDocument(ownerUserId: number, petId: number, documentId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const item = await this.prisma.petDocument.findFirst({
      where: { id: documentId, petId, uploadedById: ownerUserId },
    });
    if (!item) throw new PetContractError('NOT_FOUND', 'Document not found');
    return this.toDocumentRecord(item);
  }

  async createDocument(ownerUserId: number, petId: number, input: Record<string, unknown>) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const mediaId = toRequiredPositiveInt(input.mediaId, 'mediaId');
    await this.assertOwnedMedia(ownerUserId, mediaId);
    const item = await this.prisma.petDocument.create({
      data: {
        petId,
        mediaId,
        uploadedById: ownerUserId,
        title: normalizeRequiredString(input.title, 'title'),
        documentType: normalizeDocumentCategory(input.category ?? input.documentType),
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.toDocumentRecord(item);
  }

  async updateDocument(
    ownerUserId: number,
    petId: number,
    documentId: number,
    input: Record<string, unknown>,
  ) {
    await this.getDocument(ownerUserId, petId, documentId);
    const mediaId = toOptionalPositiveInt(input.mediaId);
    if (mediaId !== undefined) await this.assertOwnedMedia(ownerUserId, mediaId);
    await this.prisma.petDocument.update({
      where: { id: documentId },
      data: {
        mediaId: mediaId ?? undefined,
        title: normalizeOptionalString(input.title) ?? undefined,
        documentType: normalizeDocumentCategory(input.category ?? input.documentType) ?? undefined,
        notes: normalizeOptionalString(input.notes),
      },
    });
    return this.getDocument(ownerUserId, petId, documentId);
  }

  async deleteDocument(ownerUserId: number, petId: number, documentId: number) {
    await this.findOwnedActivePet(ownerUserId, petId);
    const deleted = await this.prisma.petDocument.deleteMany({
      where: { id: documentId, petId, uploadedById: ownerUserId },
    });
    if (deleted.count === 0) throw new PetContractError('NOT_FOUND', 'Document not found');
    return { id: documentId, deleted: true as const };
  }

  async getPetMedicalHistory(ownerUserId: number, petId: number) {
    const [pet, vaccinations, medicalHistory, deworming, weights, documents] = await Promise.all([
      this.findOwnedActivePet(ownerUserId, petId),
      this.listVaccinations(ownerUserId, petId),
      this.listMedicalHistory(ownerUserId, petId),
      this.listDewormingRecords(ownerUserId, petId),
      this.listWeightRecords(ownerUserId, petId),
      this.listDocuments(ownerUserId, petId),
    ]);

    return {
      pet: this.toPetPayload(pet),
      profile: this.toProfilePayload(pet),
      vaccinations: vaccinations.vaccinations,
      medicalHistory: medicalHistory.medicalHistory,
      dewormingHistory: deworming.dewormingHistory,
      weightHistory: weights.weightHistory,
      documents: documents.documents,
    };
  }

  private petInclude() {
    return {
      animalType: true,
      breed: true,
      profilePic: true,
      coverMedia: true,
      weightRecords: {
        orderBy: { measuredAt: 'desc' },
        take: 1,
      },
    } as const;
  }

  private async buildPetData(
    ownerUserId: number,
    input: PetCreateInput,
    current: PetWithRelations | null,
  ) {
    const name = normalizeOptionalString(input.name) ?? current?.name;
    if (!name) throw new PetContractError('VALIDATION', 'Pet name is required', { field: 'name' });

    const animalTypeId = await this.resolveAnimalTypeId(input, current?.animalTypeId ?? null);
    const breedId = toOptionalPositiveInt(input.breedId) ?? current?.breedId ?? null;
    await this.assertTaxonomy(animalTypeId, breedId);

    const profilePicId = resolveProfilePicId(input, current);
    const coverMediaId = toOptionalPositiveInt(input.coverMediaId) ?? current?.coverMediaId ?? null;
    if (profilePicId) await this.assertOwnedMedia(ownerUserId, profilePicId);
    if (coverMediaId) await this.assertOwnedMedia(ownerUserId, coverMediaId);

    return {
      ownerUserId,
      name,
      animalTypeId,
      breedId,
      subBreedId: toOptionalPositiveInt(input.subBreedId) ?? current?.subBreedId ?? null,
      colorId: toOptionalPositiveInt(input.colorId) ?? current?.colorId ?? null,
      coatPatternId: toOptionalPositiveInt(input.coatPatternId) ?? current?.coatPatternId ?? null,
      sizeId: toOptionalPositiveInt(input.sizeId) ?? current?.sizeId ?? null,
      customBreedText:
        normalizeOptionalString(input.customBreedText) ?? current?.customBreedText ?? null,
      customColorText:
        normalizeOptionalString(input.customColorText) ?? current?.customColorText ?? null,
      dateOfBirth: parseOptionalDate(input.dateOfBirth) ?? current?.dateOfBirth ?? null,
      sex: normalizeSex(input.sex, current?.sex),
      gender: normalizeOptionalString(input.gender) ?? current?.gender ?? null,
      microchipNumber:
        normalizeOptionalString(input.microchipNumber) ?? current?.microchipNumber ?? null,
      isRescue: toOptionalBoolean(input.isRescue) ?? current?.isRescue ?? false,
      isNeutered: toOptionalBoolean(input.isNeutered) ?? current?.isNeutered ?? false,
      foodHabits: normalizeOptionalString(input.foodHabits) ?? current?.foodHabits ?? null,
      healthDisorders:
        normalizeOptionalString(input.healthDisorders) ?? current?.healthDisorders ?? null,
      notes: normalizeOptionalString(input.notes) ?? current?.notes ?? null,
      bloodType: normalizeOptionalString(input.bloodType) ?? current?.bloodType ?? null,
      allergies:
        normalizeStringArray(input.allergies) ??
        (current?.allergies as Prisma.InputJsonValue | null) ??
        Prisma.JsonNull,
      profilePicId,
      coverMediaId,
      slug: normalizeOptionalString(input.slug) ?? current?.slug ?? null,
      bio: normalizeOptionalString(input.bio) ?? current?.bio ?? null,
      isPublicProfileEnabled:
        toOptionalBoolean(input.isPublicProfileEnabled) ?? current?.isPublicProfileEnabled ?? false,
      visibility: normalizeVisibility(input.visibility, current?.visibility),
      identityDetails:
        normalizeJsonObject(input.identityDetails) ??
        (current?.identityDetails as Prisma.InputJsonValue | null) ??
        Prisma.JsonNull,
      originatingClientId:
        normalizeOptionalString(input.originatingClientId) ?? current?.originatingClientId ?? null,
      originatingClientAudience:
        normalizeOptionalString(input.originatingClientAudience) ??
        current?.originatingClientAudience ??
        null,
    };
  }

  private async resolveAnimalTypeId(input: PetCreateInput, currentAnimalTypeId: number | null) {
    const explicit = toOptionalPositiveInt(input.animalTypeId);
    if (explicit) return explicit;
    if (currentAnimalTypeId) return currentAnimalTypeId;

    const legacy = normalizeOptionalString(input.petType ?? input.species);
    if (!legacy) {
      throw new PetContractError('ANIMAL_TYPE_NOT_FOUND', 'Animal type is required', {
        field: 'animalTypeId',
      });
    }

    const normalized = legacy.trim().toLowerCase();
    const animalType = await this.prisma.animalType.findFirst({
      where: {
        isActive: true,
        OR: [
          { code: { equals: normalized, mode: 'insensitive' } },
          { name: { equals: legacy, mode: 'insensitive' } },
        ],
      },
    });
    if (!animalType) {
      throw new PetContractError(
        'UNSUPPORTED_LEGACY_VALUE',
        'Unsupported legacy animal type value',
        {
          field: 'petType',
          value: legacy,
        },
      );
    }
    return animalType.id;
  }

  private async assertTaxonomy(animalTypeId: number, breedId: number | null) {
    const animalType = await this.prisma.animalType.findFirst({
      where: { id: animalTypeId, isActive: true },
    });
    if (!animalType) {
      throw new PetContractError('ANIMAL_TYPE_NOT_FOUND', 'Animal type not found or inactive', {
        animalTypeId,
      });
    }
    if (!breedId) return;
    const breed = await this.prisma.breed.findFirst({ where: { id: breedId, isActive: true } });
    if (!breed) {
      throw new PetContractError('ANIMAL_BREED_NOT_FOUND', 'Breed not found or inactive', {
        breedId,
      });
    }
    if (breed.animalTypeId !== animalTypeId) {
      throw new PetContractError(
        'ANIMAL_BREED_SPECIES_MISMATCH',
        'Breed does not belong to selected animal type',
        {
          animalTypeId,
          breedId,
        },
      );
    }
  }

  private async assertOwnedMedia(ownerUserId: number, mediaId: number) {
    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, ownerUserId, status: 'READY' },
    });
    if (!media) {
      throw new PetContractError(
        'INVALID_MEDIA_OWNERSHIP',
        'Media does not belong to the authenticated user',
        {
          mediaId,
        },
      );
    }
  }

  private async findOwnedActivePet(ownerUserId: number, petId: number) {
    const pet = await this.prisma.pet.findFirst({
      where: {
        id: petId,
        ownerUserId,
        status: ACTIVE_PET_STATUS,
        deletedAt: null,
        archivedAt: null,
      },
      include: this.petInclude(),
    });
    if (!pet) throw new PetContractError('NOT_FOUND', 'Pet not found');
    return pet;
  }

  private async findViewablePet(petId: number, viewerUserId: number | null) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, status: ACTIVE_PET_STATUS, deletedAt: null },
      include: this.petInclude(),
    });
    if (!pet || !this.canViewPet(pet, viewerUserId))
      throw new PetContractError('NOT_FOUND', 'Pet not found');
    return pet;
  }

  private canViewPet(pet: PetWithRelations, viewerUserId: number | null) {
    if (pet.ownerUserId === viewerUserId) return true;
    return (
      pet.isPublicProfileEnabled &&
      pet.visibility === 'PUBLIC' &&
      pet.status === ACTIVE_PET_STATUS &&
      !pet.deletedAt
    );
  }

  private assertVersion(currentVersion: number, incoming: unknown) {
    const expected = toOptionalPositiveInt(incoming);
    if (expected !== undefined && expected !== currentVersion) {
      throw new PetContractError('VERSION_CONFLICT', 'Pet version conflict', {
        currentVersion,
        expectedVersion: expected,
      });
    }
  }

  private async seedHistoricalRecords(
    tx: Prisma.TransactionClient,
    petId: number,
    input: PetCreateInput,
  ) {
    const weightKg = toOptionalPositiveNumber(input.weightKg);
    if (weightKg !== undefined) {
      await tx.petWeightRecord.create({
        data: { petId, weightKg, measuredAt: new Date(), notes: null },
      });
    }

    if (Array.isArray(input.historicalVaccinations)) {
      for (const raw of input.historicalVaccinations) {
        if (!raw || typeof raw !== 'object') continue;
        const record = raw as Record<string, unknown>;
        const vaccineName = normalizeOptionalString(record.vaccineName ?? record.name);
        if (!vaccineName) continue;
        await tx.petVaccination.create({
          data: {
            petId,
            vaccineName,
            administeredAt: parseOptionalDate(record.administeredAt),
            nextDueAt: parseOptionalDate(record.nextDueDate ?? record.nextDueAt),
            batchNumber: normalizeOptionalString(record.batchNumber),
            veterinarian: normalizeOptionalString(record.vetClinic ?? record.veterinarian),
            notes: normalizeOptionalString(record.notes),
          },
        });
      }
    }
  }

  private toPetPayload(pet: PetWithRelations) {
    const latestWeight = this.latestWeightKg(pet);
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
      animalTypeName: pet.animalType.name,
      breedName: pet.breed?.name ?? null,
      colorName: null,
      sizeName: null,
      coatPatternName: null,
      dateOfBirth: pet.dateOfBirth?.toISOString() ?? null,
      sex: normalizeSex(pet.sex),
      microchipNumber: pet.microchipNumber,
      isRescue: pet.isRescue,
      isNeutered: pet.isNeutered,
      foodHabits: pet.foodHabits,
      healthDisorders: pet.healthDisorders,
      notes: pet.notes,
      weightKg: latestWeight,
      bloodType: pet.bloodType,
      allergies: normalizeStringArray(pet.allergies) ?? [],
      profilePicId: pet.profilePicId,
      coverMediaId: pet.coverMediaId,
      bio: pet.bio,
      isPublicProfileEnabled: pet.isPublicProfileEnabled,
      visibility: normalizeVisibility(pet.visibility),
      followersCount: pet.followersCount,
      likesCount: pet.likesCount,
      isFollowing: null,
      isLiked: null,
      isOwner: true,
      canManage: true,
      canViewFullProfile: true,
      status: normalizePetStatus(pet.status),
      version: pet.version,
      archivedAt: pet.archivedAt,
      deletedAt: pet.deletedAt,
      createdAt: pet.createdAt,
      updatedAt: pet.updatedAt,
      photoUrl: pet.profilePic?.url ?? null,
      profileImageUrl: pet.profilePic?.url ?? null,
      coverMediaUrl: pet.coverMedia?.url ?? null,
    };
  }

  private toProfilePayload(pet: PetWithRelations) {
    const latestWeight = this.latestWeightKg(pet);
    return {
      id: pet.id,
      name: pet.name,
      photoUrl: pet.profilePic?.url ?? null,
      ageYears: calculateAgeYears(pet.dateOfBirth),
      gender: pet.gender ?? pet.sex,
      breed: pet.breed?.name ?? pet.customBreedText ?? null,
      weightKg: latestWeight,
      healthStatus: {
        vaccinated: false,
        nextDueDate: null,
      },
      pawPoints: 0,
      tier: null,
      familyMembers: [],
    };
  }

  private latestWeightKg(pet: Pick<PetWithRelations, 'weightRecords'>): number | null {
    const latest = pet.weightRecords[0] ?? null;
    return latest ? Number(latest.weightKg) : null;
  }

  private toDocumentRecord(item: {
    id: number;
    petId: number;
    mediaId: number;
    documentType: string | null;
    title: string;
    notes: string | null;
    uploadedById: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: item.id,
      petId: item.petId,
      mediaId: item.mediaId,
      category: normalizeDocumentCategory(item.documentType) ?? 'MEDICAL_OTHER',
      title: item.title,
      documentDate: null,
      notes: item.notes,
      uploadedByUserId: item.uploadedById,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new PetContractError('VALIDATION', `${field} is required`, { field });
  return normalized;
}

function resolveProfilePicId(
  input: PetCreateInput,
  current: PetWithRelations | null,
): number | null {
  const hasProfilePicId = hasOwn(input, 'profilePicId');
  const hasProfileImageId = hasOwn(input, 'profileImageId');
  if (!hasProfilePicId && !hasProfileImageId) return current?.profilePicId ?? null;

  const value = hasProfilePicId ? input.profilePicId : input.profileImageId;
  if (value === null) return null;

  const parsed = toOptionalPositiveInt(value);
  if (parsed === undefined) {
    throw new PetContractError(
      'INVALID_MEDIA_OWNERSHIP',
      'Media does not belong to the authenticated user',
      { mediaId: value },
    );
  }
  return parsed;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function toRequiredPositiveInt(value: unknown, field: string): number {
  const parsed = toOptionalPositiveInt(value);
  if (parsed === undefined)
    throw new PetContractError('VALIDATION', `${field} is required`, { field });
  return parsed;
}

function toOptionalPositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toRequiredPositiveNumber(value: unknown, field: string): number {
  const parsed = toOptionalPositiveNumber(value);
  if (parsed === undefined)
    throw new PetContractError('VALIDATION', `${field} is required`, { field });
  return parsed;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return undefined;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new PetContractError('VALIDATION', 'Invalid date value');
}

function normalizeSex(value: unknown, fallback: unknown = 'UNKNOWN'): PetSex {
  const raw = normalizeOptionalString(value) ?? normalizeOptionalString(fallback) ?? 'UNKNOWN';
  const normalized = raw.toUpperCase();
  if (normalized === 'MALE' || normalized === 'FEMALE') return normalized;
  return 'UNKNOWN';
}

function normalizeVisibility(value: unknown, fallback: unknown = 'PRIVATE'): PetVisibility {
  const raw = normalizeOptionalString(value) ?? normalizeOptionalString(fallback) ?? 'PRIVATE';
  const normalized = raw.toUpperCase();
  if (normalized === 'PUBLIC' || normalized === 'FOLLOWERS_ONLY' || normalized === 'PRIVATE') {
    return normalized;
  }
  return 'PRIVATE';
}

function normalizePetStatus(value: unknown): 'ACTIVE' | 'ARCHIVED' | 'DELETED' {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (normalized === 'ARCHIVED' || normalized === 'DELETED') return normalized;
  return 'ACTIVE';
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeOptionalString(item))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
}

function normalizeJsonObject(value: unknown): Prisma.InputJsonValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Prisma.InputJsonValue;
}

function normalizeDocumentCategory(value: unknown): PetDocumentCategory | null {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
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
  return allowed.includes(normalized as PetDocumentCategory)
    ? (normalized as PetDocumentCategory)
    : null;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'number' ? item : Number.parseInt(String(item), 10)))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.trunc(item));
}

function calculateAgeYears(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const now = new Date();
  let years = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) years -= 1;
  return Math.max(years, 0);
}

function hashRequest(input: PetCreateInput): string {
  const serializable = { ...input, idempotencyKey: undefined };
  return createHash('sha256').update(JSON.stringify(serializable)).digest('hex');
}
