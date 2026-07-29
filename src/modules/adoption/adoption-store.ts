import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';

type MediaLookup = {
  getMedia(mediaId: number): { id: number; url: string; thumbnailUrl?: string | null; hlsUrl?: string | null; type?: string; mimeType?: string | null } | null;
};

export type AdoptionApplicationStatus =
  | 'SUBMITTED'
  | 'VIEWED'
  | 'SHORTLISTED'
  | 'OWNER_REVIEW'
  | 'INTERVIEW_SCHEDULED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface AdoptionListingInput {
  petName?: string | null;
  animalTypeId?: number | null;
  breedId?: number | null;
  sex?: string | null;
  ageText?: string | null;
  ageYears?: number | null;
  ageMonths?: number | null;
  ageDays?: number | null;
  totalAgeDays?: number | null;
  approximateDateOfBirth?: Date | null;
  size?: string | null;
  colors?: string | null;
  story?: string | null;
  adoptionReason?: string | null;
  vaccinated?: boolean;
  dewormed?: boolean;
  neutered?: boolean;
  microchipped?: boolean;
  healthInfo?: string | null;
  countryId?: number | null;
  bdDivisionId?: number | null;
  bdDistrictId?: number | null;
  bdAddressMode?: string | null;
  bdCityCorporationId?: number | null;
  bdZoneId?: number | null;
  bdWardId?: number | null;
  bdUpazilaId?: number | null;
  bdUnionId?: number | null;
  bdAreaId?: number | null;
  ownerCityAreaText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ownerContactPhone?: string | null;
  ownerWhatsappPhone?: string | null;
  pickupLocationNotes?: string | null;
  serviceAreaType?: string | null;
  serviceAreaNotes?: string | null;
  customServiceAreas?: any;
  allowInternationalAdoption?: boolean;
  adopterConditions?: any;
  adoptionExperienceRequired?: boolean;
  homeCheckRequired?: boolean;
  vetReferenceRequired?: boolean;
  identityVerificationRequired?: boolean;
  landlordApprovalRequired?: boolean;
  minimumMonthlyIncomeRange?: string | null;
  maximumMonthlyIncomeRange?: string | null;
  notes?: string | null;
  mediaIds?: number[];
}

/**
 * Whitelisted, writable form fields — deliberately excludes `ownerUserId`,
 * `status`, `id`, `publishedAt`, `archivedAt`, `markedForDeletionAt`,
 * `idempotencyKey`, and any other server-managed column. `updateListing`
 * spreads the caller's JSON body into a Prisma update; without this
 * allowlist, a request body carrying an unexpected extra key (e.g.
 * `status` or `ownerUserId`) would silently be written straight to the
 * database, bypassing `publishListing`/`setStatus`'s own transition rules
 * and ownership.
 */
const WRITABLE_LISTING_FIELDS = [
  'petName',
  'animalTypeId',
  'breedId',
  'sex',
  'ageText',
  'ageYears',
  'ageMonths',
  'ageDays',
  'totalAgeDays',
  'approximateDateOfBirth',
  'size',
  'colors',
  'story',
  'adoptionReason',
  'vaccinated',
  'dewormed',
  'neutered',
  'microchipped',
  'healthInfo',
  'countryId',
  'bdDivisionId',
  'bdDistrictId',
  'bdAddressMode',
  'bdCityCorporationId',
  'bdZoneId',
  'bdWardId',
  'bdUpazilaId',
  'bdUnionId',
  'bdAreaId',
  'ownerCityAreaText',
  'latitude',
  'longitude',
  'ownerContactPhone',
  'ownerWhatsappPhone',
  'pickupLocationNotes',
  'serviceAreaType',
  'serviceAreaNotes',
  'customServiceAreas',
  'allowInternationalAdoption',
  'adopterConditions',
  'adoptionExperienceRequired',
  'homeCheckRequired',
  'vetReferenceRequired',
  'identityVerificationRequired',
  'landlordApprovalRequired',
  'minimumMonthlyIncomeRange',
  'maximumMonthlyIncomeRange',
  'notes',
] as const satisfies readonly (keyof AdoptionListingInput)[];

function pickWritableListingFields(input: AdoptionListingInput): Partial<AdoptionListingInput> {
  const picked: Partial<AdoptionListingInput> = {};
  for (const key of WRITABLE_LISTING_FIELDS) {
    if (key in input) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (picked as any)[key] = input[key];
    }
  }
  return picked;
}

export interface AdoptionApplicationInput {
  applicantName?: string | null;
  applicantPhone?: string | null;
  applicantWhatsappPhone?: string | null;
  applicantLocationText?: string | null;
  applicantCityAreaText?: string | null;
  applicantEmail?: string | null;
  applicantHouseholdSummary?: string | null;
  applicantExperienceSummary?: string | null;
  applicantOtherPetsSummary?: string | null;
  applicantIncomeRange?: string | null;
  messageToOwner?: string | null;
  answers?: unknown;
  consentToHomeCheck?: boolean;
  consentToFollowUp?: boolean;
}

interface AdoptionCommentRecord {
  id: number;
  adoptionListingId: number;
  authorUserId: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface AdoptionFavoriteRecord {
  adoptionListingId: number;
  userId: number;
  createdAt: Date;
}

interface AdoptionReportRecord {
  id: number;
  adoptionListingId: number;
  reporterUserId: number;
  reasonCode: string;
  details: string | null;
  createdAt: Date;
}

interface AdoptionApplicationRecord {
  id: number;
  adoptionListingId: number;
  applicantUserId: number;
  ownerUserId: number;
  status: AdoptionApplicationStatus;
  applicantName: string;
  applicantPhone: string;
  applicantWhatsappPhone: string | null;
  applicantLocationText: string | null;
  applicantCityAreaText: string | null;
  applicantEmail: string | null;
  applicantHouseholdSummary: string | null;
  applicantExperienceSummary: string | null;
  applicantOtherPetsSummary: string | null;
  applicantIncomeRange: string | null;
  messageToOwner: string | null;
  answers: unknown;
  consentToHomeCheck: boolean;
  consentToFollowUp: boolean;
  ownerNotes: string | null;
  rejectedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  closedAt: Date | null;
}

function normalizeText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export class AdoptionStore {
  private nextCommentId = 1;
  private nextReportId = 1;
  private nextApplicationId = 1;
  private readonly favorites = new Map<number, Set<number>>();
  private readonly comments = new Map<number, AdoptionCommentRecord>();
  private readonly reports = new Map<number, AdoptionReportRecord>();
  private readonly applications = new Map<number, AdoptionApplicationRecord>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly mediaLookup: MediaLookup | null = null,
  ) {}

  async createDraft(userId: number, input: AdoptionListingInput, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.adoptionListing.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return this.serializeListing(existing, userId);
    }

    if (input.mediaIds && input.mediaIds.length > 0) {
      const alreadyBound = await this.prisma.adoptionListing.findFirst({
        where: {
          mediaIds: {
            hasSome: input.mediaIds,
          },
        },
      });
      if (alreadyBound) {
        throw AppError.adoptionMediaAlreadyBound();
      }
    }

    const listing = await this.prisma.adoptionListing.create({
      data: {
        ...pickWritableListingFields(input),
        ownerUserId: userId,
        status: 'DRAFT',
        idempotencyKey,
        mediaIds: input.mediaIds ?? [],
      },
    });

    return this.serializeListing(listing, userId);
  }

  async getListing(userId: number, id: number, isManager = false) {
    const listing = await this.prisma.adoptionListing.findUnique({
      where: { id },
    });
    if (!listing) throw AppError.adoptionNotFound();

    const isOwner = listing.ownerUserId === userId;
    const isPublic = ['PUBLISHED', 'ADOPTED'].includes(listing.status);

    if (!isPublic && !isOwner && !isManager) {
      throw AppError.adoptionNotPublic();
    }
    return this.serializeListing(listing, userId);
  }

  async updateListing(userId: number, id: number, input: AdoptionListingInput) {
    const listing = await this.prisma.adoptionListing.findUnique({ where: { id } });
    if (!listing) throw AppError.adoptionNotFound();
    if (listing.ownerUserId !== userId) throw AppError.adoptionAccessDenied();

    if (listing.status === 'DELETED') {
      throw AppError.adoptionInvalidStatus('Cannot edit deleted listing');
    }

    if (input.mediaIds && input.mediaIds.length > 0) {
      const alreadyBound = await this.prisma.adoptionListing.findFirst({
        where: {
          id: { not: id },
          mediaIds: {
            hasSome: input.mediaIds,
          },
        },
      });
      if (alreadyBound) {
        throw AppError.adoptionMediaAlreadyBound();
      }
    }

    const updated = await this.prisma.adoptionListing.update({
      where: { id },
      data: {
        ...pickWritableListingFields(input),
        ...(input.mediaIds ? { mediaIds: input.mediaIds } : {}),
      },
    });
    return this.serializeListing(updated, userId);
  }

  async hardDeleteListing(userId: number, id: number) {
    const listing = await this.prisma.adoptionListing.findUnique({ where: { id } });
    if (!listing) throw AppError.adoptionNotFound();
    if (listing.ownerUserId !== userId) {
      throw AppError.adoptionStatusChangeForbidden('You do not own this listing');
    }
    await this.prisma.adoptionListing.delete({ where: { id } });
    return { deleted: true, id };
  }

  async publishListing(userId: number, id: number) {
    const listing = await this.prisma.adoptionListing.findUnique({ where: { id } });
    if (!listing) throw AppError.adoptionNotFound();
    if (listing.ownerUserId !== userId) {
      throw AppError.adoptionStatusChangeForbidden('You do not own this listing');
    }

    if (listing.status === 'PUBLISHED') {
      return this.serializeListing(listing, userId);
    }

    if (listing.status !== 'DRAFT' && listing.status !== 'PAUSED') {
      throw AppError.adoptionStatusTransitionInvalid(
        'Only DRAFT or PAUSED listings can be published',
      );
    }

    if (!listing.petName || !listing.animalTypeId || !listing.breedId) {
      throw AppError.adoptionValidationFailed('Missing required fields for publish');
    }

    const updated = await this.prisma.adoptionListing.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return this.serializeListing(updated, userId);
  }

  async setStatus(
    userId: number,
    id: number,
    status:
      | 'DRAFT'
      | 'PENDING_REVIEW'
      | 'PUBLISHED'
      | 'PAUSED'
      | 'ADOPTED'
      | 'REJECTED'
      | 'ARCHIVED'
      | 'DELETED',
  ) {
    const listing = await this.prisma.adoptionListing.findUnique({ where: { id } });
    if (!listing) throw AppError.adoptionNotFound();
    if (listing.ownerUserId !== userId) {
      throw AppError.adoptionStatusChangeForbidden('You do not own this listing');
    }

    const currentStatus = listing.status;

    if (currentStatus === status) {
      return this.serializeListing(listing, userId);
    }

    if (currentStatus === 'ADOPTED' && !['ARCHIVED', 'DELETED'].includes(status)) {
      throw AppError.adoptionAlreadyClosed();
    }

    if (currentStatus === 'ARCHIVED' || currentStatus === 'DELETED') {
      throw AppError.adoptionStatusTransitionInvalid(
        `Cannot change status of an archived or deleted listing`,
      );
    }

    const allowed: Record<string, string[]> = {
      DRAFT: ['PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED', 'DELETED'],
      PENDING_REVIEW: ['PUBLISHED', 'REJECTED', 'ARCHIVED', 'DELETED'],
      PUBLISHED: ['PAUSED', 'ADOPTED', 'ARCHIVED', 'DELETED'],
      PAUSED: ['PUBLISHED', 'ADOPTED', 'ARCHIVED', 'DELETED'],
      REJECTED: ['DRAFT', 'DELETED'],
      ADOPTED: ['ARCHIVED', 'DELETED'],
      ARCHIVED: [],
      DELETED: [],
    };

    const nextStatuses = allowed[currentStatus] ?? [];
    if (!nextStatuses.includes(status)) {
      throw AppError.adoptionStatusTransitionInvalid(
        `Invalid transition from ${currentStatus} to ${status}`,
      );
    }

    const updated = await this.prisma.adoptionListing.update({
      where: { id },
      data: {
        status,
        ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
      },
    });
    return this.serializeListing(updated, userId);
  }

  async favoriteListing(userId: number, id: number) {
    await this.assertVisibleToViewer(userId, id, false);
    const favorites = this.favorites.get(id) ?? new Set<number>();
    favorites.add(userId);
    this.favorites.set(id, favorites);
    return this.getListing(userId, id, false);
  }

  async unfavoriteListing(userId: number, id: number) {
    await this.assertVisibleToViewer(userId, id, false);
    this.favorites.get(id)?.delete(userId);
    return this.getListing(userId, id, false);
  }

  async listComments(userId: number, id: number, limit = 50) {
    await this.assertVisibleToViewer(userId, id, false);
    const items = [...this.comments.values()]
      .filter((comment) => comment.adoptionListingId === id && comment.deletedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((comment) => this.commentPayload(comment));
    return {
      items,
      meta: {
        commentCount: this.commentCount(id),
      },
    };
  }

  async addComment(userId: number, id: number, text: string) {
    await this.assertVisibleToViewer(userId, id, false);
    const comment: AdoptionCommentRecord = {
      id: this.nextCommentId++,
      adoptionListingId: id,
      authorUserId: userId,
      text: text.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.comments.set(comment.id, comment);
    return {
      comment: this.commentPayload(comment),
      commentCount: this.commentCount(id),
    };
  }

  async deleteComment(userId: number, id: number, commentId: number) {
    const comment = this.comments.get(commentId);
    if (!comment || comment.adoptionListingId !== id || comment.deletedAt !== null) {
      throw AppError.notFound('Comment not found');
    }
    const listing = await this.mustLoadListing(id);
    if (listing.ownerUserId !== userId && comment.authorUserId !== userId) {
      throw AppError.adoptionAccessDenied();
    }
    comment.deletedAt = new Date();
    comment.updatedAt = new Date();
    return {
      deleted: true,
      id: commentId,
      commentCount: this.commentCount(id),
    };
  }

  async reportListing(userId: number, id: number, reasonCode: string, details?: string) {
    await this.assertVisibleToViewer(userId, id, false);
    const report: AdoptionReportRecord = {
      id: this.nextReportId++,
      adoptionListingId: id,
      reporterUserId: userId,
      reasonCode: reasonCode.trim(),
      details: details?.trim() || null,
      createdAt: new Date(),
    };
    this.reports.set(report.id, report);
    return {
      id: report.id,
      reasonCode: report.reasonCode,
      details: report.details,
    };
  }

  async createApplication(userId: number, listingId: number, input: AdoptionApplicationInput) {
    const listing = await this.mustLoadListing(listingId);
    if (listing.ownerUserId === userId) throw AppError.adoptionAccessDenied();
    if (listing.status !== 'PUBLISHED') throw AppError.adoptionNotPublic();

    const existing = [...this.applications.values()].find(
      (item) =>
        item.adoptionListingId === listingId &&
        item.applicantUserId === userId &&
        item.status !== 'CANCELLED',
    );
    if (existing) {
      return this.applicationPayload(existing);
    }

    const application: AdoptionApplicationRecord = {
      id: this.nextApplicationId++,
      adoptionListingId: listingId,
      applicantUserId: userId,
      ownerUserId: listing.ownerUserId,
      status: 'SUBMITTED',
      applicantName: normalizeText(input.applicantName) ?? `User ${userId}`,
      applicantPhone: normalizeText(input.applicantPhone) ?? '',
      applicantWhatsappPhone: normalizeText(input.applicantWhatsappPhone),
      applicantLocationText: normalizeText(input.applicantLocationText),
      applicantCityAreaText: normalizeText(input.applicantCityAreaText),
      applicantEmail: normalizeText(input.applicantEmail),
      applicantHouseholdSummary: normalizeText(input.applicantHouseholdSummary),
      applicantExperienceSummary: normalizeText(input.applicantExperienceSummary),
      applicantOtherPetsSummary: normalizeText(input.applicantOtherPetsSummary),
      applicantIncomeRange: normalizeText(input.applicantIncomeRange),
      messageToOwner: normalizeText(input.messageToOwner),
      answers: input.answers ?? [],
      consentToHomeCheck: Boolean(input.consentToHomeCheck),
      consentToFollowUp: Boolean(input.consentToFollowUp),
      ownerNotes: null,
      rejectedReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      closedAt: null,
    };
    this.applications.set(application.id, application);
    return this.applicationPayload(application);
  }

  async listApplicantApplications(userId: number) {
    return [...this.applications.values()]
      .filter((application) => application.applicantUserId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((application) => this.applicationPayload(application));
  }

  async listListingApplications(userId: number, listingId: number) {
    const listing = await this.mustLoadListing(listingId);
    if (listing.ownerUserId !== userId) throw AppError.adoptionAccessDenied();
    return [...this.applications.values()]
      .filter((application) => application.adoptionListingId === listingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((application) => this.applicationPayload(application));
  }

  async getApplication(userId: number, applicationId: number, isManager = false) {
    const application = this.applications.get(applicationId);
    if (!application) throw AppError.adoptionNotFound();
    if (
      application.applicantUserId !== userId &&
      application.ownerUserId !== userId &&
      !isManager
    ) {
      throw AppError.adoptionAccessDenied();
    }
    return this.applicationPayload(application);
  }

  async updateApplicationStatus(
    userId: number,
    applicationId: number,
    status: AdoptionApplicationStatus,
    note?: string,
    isManager = false,
  ) {
    const application = this.applications.get(applicationId);
    if (!application) throw AppError.adoptionNotFound();
    if (application.ownerUserId !== userId && !isManager) {
      throw AppError.adoptionAccessDenied();
    }
    application.status = status;
    application.updatedAt = new Date();
    application.reviewedAt = new Date();
    if (status === 'APPROVED') {
      application.closedAt = new Date();
    }
    if (status === 'REJECTED') {
      application.rejectedReason = note?.trim() || application.rejectedReason;
    }
    if (note && status !== 'REJECTED') {
      application.ownerNotes = note.trim();
    }
    return this.applicationPayload(application);
  }

  async updateApplicationNotes(userId: number, applicationId: number, notes: string) {
    const application = this.applications.get(applicationId);
    if (!application) throw AppError.adoptionNotFound();
    if (application.ownerUserId !== userId) throw AppError.adoptionAccessDenied();
    application.ownerNotes = notes.trim();
    application.updatedAt = new Date();
    return this.applicationPayload(application);
  }

  async listPublic(query: any, viewerUserId = 0) {
    void query;
    const listings = await this.prisma.adoptionListing.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(listings.map((listing) => this.serializeListing(listing, viewerUserId)));
  }

  async listOwned(userId: number) {
    const listings = await this.prisma.adoptionListing.findMany({
      where: { ownerUserId: userId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(listings.map((listing) => this.serializeListing(listing, userId)));
  }

  private async assertVisibleToViewer(
    userId: number,
    id: number,
    isManager = false,
  ): Promise<void> {
    const listing = await this.mustLoadListing(id);
    const isOwner = listing.ownerUserId === userId;
    const isPublic = ['PUBLISHED', 'ADOPTED'].includes(listing.status);
    if (!isPublic && !isOwner && !isManager) {
      throw AppError.adoptionNotPublic();
    }
  }

  private async mustLoadListing(id: number): Promise<any> {
    const listing = await this.prisma.adoptionListing.findUnique({
      where: { id },
      include: {
        ownerUser: {
          include: {
            profile: {
              include: {
                avatarMedia: true,
                coverMedia: true,
              },
            },
          },
        },
        animalType: true,
        breed: true,
        country: true,
        bdDivision: true,
        bdDistrict: true,
        bdUpazila: true,
        bdArea: true,
      },
    });
    if (!listing) throw AppError.adoptionNotFound();
    return listing;
  }

  private async serializeListing(listing: any, viewerUserId: number) {
    if (
      !listing.ownerUser ||
      !listing.animalType ||
      !listing.breed ||
      listing.country === undefined
    ) {
      try {
        listing = await this.mustLoadListing(listing.id);
      } catch {
        // Unit tests and minimal Prisma mocks may only return the bare row.
        // Keep the original listing and fall back to safe defaults below.
      }
    }
    const mediaIds: number[] = Array.isArray(listing.mediaIds) ? listing.mediaIds : [];
    const mediaRows =
      mediaIds.length && this.prisma.media && typeof this.prisma.media.findMany === 'function'
        ? await this.prisma.media.findMany({ where: { id: { in: mediaIds } } })
        : [];
    const mediaMap = new Map<number, any>(mediaRows.map((media) => [media.id, media]));
    const resolvedMedia = mediaIds
      .map((mediaId) => mediaMap.get(mediaId) ?? this.mediaLookup?.getMedia(mediaId) ?? null)
      .filter((media): media is any => Boolean(media));
    const favoriteCount = this.favoriteCount(listing.id);
    const commentCount = this.commentCount(listing.id);
    const applicationCount = this.applicationCount(listing.id);
    const isFavoritedByMe = this.favorites.get(listing.id)?.has(viewerUserId) ?? false;

    const [bdAreaRow, bdWardRow, bdZoneRow, bdCityCorporationRow, bdUnionRow, bdUpazilaRow] =
      await Promise.all([
        listing.bdAreaId ? this.prisma.bdArea.findUnique({ where: { id: listing.bdAreaId } }) : null,
        listing.bdWardId ? this.prisma.bdArea.findUnique({ where: { id: listing.bdWardId } }) : null,
        listing.bdZoneId ? this.prisma.bdArea.findUnique({ where: { id: listing.bdZoneId } }) : null,
        listing.bdCityCorporationId
          ? this.prisma.bdArea.findUnique({ where: { id: listing.bdCityCorporationId } })
          : null,
        listing.bdUnionId ? this.prisma.bdUnion.findUnique({ where: { id: listing.bdUnionId } }) : null,
        listing.bdUpazilaId
          ? this.prisma.bdUpazila.findUnique({ where: { id: listing.bdUpazilaId } })
          : null,
      ]);
    const locationLabel =
      listing.ownerCityAreaText ??
      bdAreaRow?.nameEn ??
      bdWardRow?.nameEn ??
      bdZoneRow?.nameEn ??
      bdCityCorporationRow?.nameEn ??
      bdUnionRow?.nameEn ??
      bdUpazilaRow?.nameEn ??
      listing.bdDistrict?.nameEn ??
      listing.bdDivision?.nameEn ??
      listing.country?.name ??
      'Bangladesh';

    return {
      id: listing.id,
      petName: listing.petName ?? 'Unnamed pet',
      name: listing.petName ?? 'Unnamed pet',
      species: listing.animalType?.code ?? listing.animalType?.name ?? '',
      breed: listing.breed?.name ?? '',
      ageLabel: listing.ageText ?? 'Age unavailable',
      gender: listing.sex ?? 'Unknown',
      location: locationLabel,
      description: listing.story ?? listing.adoptionReason ?? '',
      ownerType: 'PERSONAL',
      owner: {
        id: listing.ownerUserId,
        profile: {
          displayName:
            listing.ownerUser?.profile?.displayName ??
            listing.ownerUser?.profile?.username ??
            `User ${listing.ownerUserId}`,
          username: listing.ownerUser?.profile?.username ?? `user${listing.ownerUserId}`,
          avatarMedia: listing.ownerUser?.profile?.avatarMedia
            ? {
                id: listing.ownerUser.profile.avatarMedia.id,
                url: listing.ownerUser.profile.avatarMedia.url,
                thumbnailUrl: listing.ownerUser.profile.avatarMedia.thumbnailUrl,
                hlsUrl: listing.ownerUser.profile.avatarMedia.hlsUrl,
                type: listing.ownerUser.profile.avatarMedia.mimetype?.startsWith('video/')
                  ? 'VIDEO'
                  : 'IMAGE',
                mimeType: listing.ownerUser.profile.avatarMedia.mimetype,
              }
            : null,
        },
      },
      shelterProfile: {
        displayName: '',
        verificationStatus: null,
      },
      country: listing.country
        ? { id: listing.country.id, name: listing.country.name, iso2: listing.country.iso2 }
        : {},
      criteria: {},
      vaccinated: Boolean(listing.vaccinated),
      dewormed: Boolean(listing.dewormed),
      neutered: Boolean(listing.neutered),
      microchipped: Boolean(listing.microchipped),
      isShelter: false,
      ownerName:
        listing.ownerUser?.profile?.displayName ??
        listing.ownerUser?.profile?.username ??
        `User ${listing.ownerUserId}`,
      ownerUserId: listing.ownerUserId,
      ownerAvatarUrl: listing.ownerUser?.profile?.avatarMedia?.url ?? null,
      ownerRoleLabel: 'Owner',
      ownerVerified: false,
      viewerIsOwner: viewerUserId === listing.ownerUserId,
      status: listing.status,
      ownerContactPhone: listing.ownerContactPhone,
      ownerWhatsappPhone: listing.ownerWhatsappPhone,
      ownerCityAreaText: listing.ownerCityAreaText,
      pickupLocationNotes: listing.pickupLocationNotes,
      galleryLabels: mediaIds.length
        ? mediaIds.map((_, index) => `Media ${index + 1}`)
        : ['Media placeholder'],
      personalityTags: [],
      compatibilityTags: [],
      serviceAreas: listing.serviceAreaNotes ? [listing.serviceAreaNotes] : ['Bangladesh'],
      adopterConditions: [],
      story: listing.story ?? '',
      healthNotes: listing.healthInfo ?? '',
      coverImageUrl:
        resolvedMedia.find((media) => (media?.thumbnailUrl ?? media?.url ?? '').trim().length > 0)
          ?.thumbnailUrl ??
        resolvedMedia[0]?.url ??
        null,
      galleryImageUrls: resolvedMedia
        .map((media) => media?.url ?? '')
        .filter((url) => url.trim().length > 0),
      media: resolvedMedia.map((media) => ({
        id: media.id,
        media: {
          id: media.id,
          url: media.url ?? '',
          hlsUrl: media.hlsUrl ?? null,
          thumbnailUrl: media.thumbnailUrl ?? null,
          type:
            media.type?.toString?.().toUpperCase?.() === 'VIDEO' ||
            media.mimeType?.toString?.().toLowerCase?.().startsWith('video/')
              ? 'VIDEO'
              : 'IMAGE',
          mimeType: media.mimeType ?? media.mimetype ?? null,
          status: media.status ?? 'READY',
        },
      })),
      favoriteCount,
      commentCount,
      isFavoritedByMe,
      favorites: isFavoritedByMe ? [{ userId: viewerUserId }] : [],
      bdDivisionId: listing.bdDivisionId,
      bdDistrictId: listing.bdDistrictId,
      bdAddressMode: listing.bdAddressMode,
      bdCityCorporationId: listing.bdCityCorporationId,
      bdZoneId: listing.bdZoneId,
      bdWardId: listing.bdWardId,
      bdUpazilaId: listing.bdUpazilaId,
      bdUnionId: listing.bdUnionId,
      bdAreaId: listing.bdAreaId,
      latitude: listing.latitude ?? null,
      longitude: listing.longitude ?? null,
      serviceAreaType: listing.serviceAreaType,
      applicationCount,
      sizeText: listing.size,
      colorText: listing.colors,
      ageYears: listing.ageYears,
      ageMonths: listing.ageMonths,
      ageDays: listing.ageDays,
      totalAgeDays: listing.totalAgeDays,
      approximateDateOfBirth: listing.approximateDateOfBirth?.toISOString?.() ?? null,
      _count: {
        favorites: favoriteCount,
        comments: commentCount,
        applications: applicationCount,
      },
    };
  }

  private commentCount(listingId: number): number {
    return [...this.comments.values()].filter(
      (comment) => comment.adoptionListingId === listingId && comment.deletedAt === null,
    ).length;
  }

  private favoriteCount(listingId: number): number {
    return this.favorites.get(listingId)?.size ?? 0;
  }

  private applicationCount(listingId: number): number {
    return [...this.applications.values()].filter(
      (application) => application.adoptionListingId === listingId,
    ).length;
  }

  private commentPayload(comment: AdoptionCommentRecord) {
    return {
      id: comment.id,
      adoptionListingId: comment.adoptionListingId,
      authorUserId: comment.authorUserId,
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      user: {
        id: comment.authorUserId,
        profile: {
          displayName: `User ${comment.authorUserId}`,
          username: `user${comment.authorUserId}`,
          avatarMedia: null,
        },
      },
      canDelete: true,
    };
  }

  private applicationPayload(application: AdoptionApplicationRecord) {
    return {
      id: application.id,
      adoptionListingId: application.adoptionListingId,
      applicantUserId: application.applicantUserId,
      ownerUserId: application.ownerUserId,
      status: application.status,
      submittedAt: application.createdAt.toISOString(),
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
      applicantName: application.applicantName,
      applicantUsername: `user${application.applicantUserId}`,
      applicantAvatarUrl: '',
      applicantPhone: application.applicantPhone,
      applicantWhatsappPhone: application.applicantWhatsappPhone ?? '',
      applicantCityAreaText: application.applicantCityAreaText ?? '',
      applicantAddress: application.applicantLocationText ?? '',
      messageToOwner: application.messageToOwner ?? '',
      answers: Array.isArray(application.answers) ? application.answers : [],
      consentToHomeCheck: application.consentToHomeCheck,
      consentToFollowUp: application.consentToFollowUp,
      applicantExperienceSummary: application.applicantExperienceSummary ?? '',
      applicantHouseholdSummary: application.applicantHouseholdSummary ?? '',
      applicantOtherPetsSummary: application.applicantOtherPetsSummary ?? '',
      applicantOccupation: '',
      ownerNotes: application.ownerNotes ?? '',
      rejectedReason: application.rejectedReason ?? '',
      applicant: {
        id: application.applicantUserId,
        profile: {
          displayName: application.applicantName,
          username: `user${application.applicantUserId}`,
          avatarMedia: null,
        },
      },
    };
  }
}
