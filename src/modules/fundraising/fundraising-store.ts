import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { SocialCoreStore } from '../social/social-store';
import type { AuthenticatedPrincipal } from '../../security/principal';
import { hasPermission, hasRole } from '../../security/authorization';
import { getPrisma } from '../../infrastructure/db/prisma-client';
import { encryptKycField, decryptKycField, looksLikeKycEnvelope } from './kyc-encryption';
import {
  canWithdrawFunds,
  isPublicVisibleStatus,
  isDonationAllowed,
  isDonationEligibleStatus,
  isCampaignExpired,
} from './fundraising-policy';
import {
  resolvePaymentRedirect,
  PaymentProviderUnavailableError,
  type ResolvedPaymentRedirect,
} from './payment-provider';
import { epsCheckTransactionStatus, type EpsTransactionOutcome } from './eps-client';

export type FundraisingAccountStatus = 'DRAFT' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type FundraisingFundingMode = 'ONE_TIME' | 'ONGOING' | 'RECURRING';
export type FundraisingCampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'FUNDED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'ARCHIVED'
  | 'SUSPENDED'
  | 'DELETED';
export type FundraisingDonationStatus =
  'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'ON_HOLD_REVIEW';

export interface FundraisingStoreOptions {
  webhookSecret?: string;
  now?: () => Date;
  prisma?: PrismaClient;
}

export class FundraisingContractError extends Error {
  readonly code:
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'MEDIA_NOT_OWNED'
    | 'MEDIA_BINDING_CONFLICT'
    | 'UPLOAD_INCOMPLETE'
    | 'INVALID_DRAFT_STATE'
    | 'RETRYABLE_UPLOAD_FAILURE'
    | 'CONFLICT'
    | 'UNAVAILABLE'
    | 'BAD_SIGNATURE'
    | 'INVALID_TRANSITION'
    | 'ACCESS_DENIED'
    | 'NOT_PUBLIC'
    | 'EDIT_FORBIDDEN'
    | 'NOT_DONATABLE'
    | 'ACCOUNT_NOT_VERIFIED'
    | 'PAYMENT_PROVIDER_UNAVAILABLE';

  readonly statusCode: number;

  constructor(
    code:
      | 'VALIDATION'
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'MEDIA_NOT_OWNED'
      | 'MEDIA_BINDING_CONFLICT'
      | 'UPLOAD_INCOMPLETE'
      | 'INVALID_DRAFT_STATE'
      | 'RETRYABLE_UPLOAD_FAILURE'
      | 'CONFLICT'
      | 'UNAVAILABLE'
      | 'BAD_SIGNATURE'
      | 'INVALID_TRANSITION'
      | 'ACCESS_DENIED'
      | 'NOT_PUBLIC'
      | 'EDIT_FORBIDDEN'
      | 'NOT_DONATABLE'
      | 'ACCOUNT_NOT_VERIFIED'
      | 'PAYMENT_PROVIDER_UNAVAILABLE',
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = 'FundraisingContractError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface MediaRef {
  id: number;
  url: string;
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  mimetype: string;
  type: string;
  status: 'READY' | 'PROCESSING' | 'FAILED';
}

interface FundraisingAccountDocumentRecord {
  id: number;
  accountId: number;
  mediaId: number;
  title: string;
  media: MediaRef;
  createdAt: Date;
  deletedAt: Date | null;
  documentType?: 'PRIMARY' | 'SUPPORTING';
}

interface FundraisingVerificationAccountDbRecord {
  id: number;
  ownerUserId: number;
  status: string;
  accountType: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  occupation: string | null;
  isInternational: boolean;
  divisionId: number | null;
  districtId: number | null;
  upazilaId: number | null;
  unionId: number | null;
  areaId: number | null;
  area: string | null;
  countryCode: string | null;
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
  addressLine: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  formattedAddress: string | null;
  primaryDocumentType: string | null;
  nationalIdNumber: string | null;
  birthRegNumber: string | null;
  passportNumber: string | null;
  studentIdNumber: string | null;
  drivingLicenceNumber: string | null;
  verificationDraftJson: Prisma.JsonValue | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByUserId: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  documents?: FundraisingVerificationDocumentDbRecord[];
}

interface FundraisingVerificationDocumentDbRecord {
  id: number;
  accountId: number;
  mediaId: number;
  title: string;
  documentType: string;
  createdAt: Date;
  deletedAt: Date | null;
}

interface FundraisingAccountRecord {
  id: number;
  ownerUserId: number;
  status: FundraisingAccountStatus;
  accountType: 'INDIVIDUAL' | 'ORGANIZATION' | null;
  fullName: string | null;
  dateOfBirth: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  occupation: string | null;
  isInternational: boolean;
  divisionId: number | null;
  districtId: number | null;
  upazilaId: number | null;
  unionId: number | null;
  areaId: number | null;
  verificationDraftJson: Record<string, unknown> | null;
  area: string | null;
  countryCode: string | null;
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  primaryDocumentType: string | null;
  nationalIdNumber: string | null;
  birthRegNumber: string | null;
  passportNumber: string | null;
  studentIdNumber: string | null;
  drivingLicenceNumber: string | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByUserId: number | null;
  version: number;
  documents: FundraisingAccountDocumentRecord[];
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignDraftRecord {
  id: number;
  publicId: string;
  ownerUserId: number;
  status: 'DRAFT' | 'SUBMITTED' | 'PENDING_REVIEW' | 'ARCHIVED';
  title: string | null;
  caption: string | null;
  category: string | null;
  fundingMode: FundraisingFundingMode;
  currencyCode: string;
  targetAmountMinor: bigint | null;
  monthlyGoalMinor: bigint | null;
  startsAt: Date | null;
  endsAt: Date | null;
  deadline: Date | null;
  nextReviewAt: Date | null;
  beneficiaryType: string | null;
  beneficiaryName: string | null;
  petId: number | null;
  urgency: string | null;
  treatmentProvider: string | null;
  estimatedExpenseMinor: bigint | null;
  spendingPlan: Record<string, unknown> | null;
  locationText: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  subDistrictId: number | null;
  bdAddressMode: string | null;
  bdDivisionId: number | null;
  bdDistrictId: number | null;
  bdCityCorporationId: number | null;
  bdZoneId: number | null;
  bdWardId: number | null;
  bdUpazilaId: number | null;
  bdUnionId: number | null;
  bdAreaId: number | null;
  mediaIds: number[];
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignStatsRecord {
  raisedAmountMinor: bigint;
  withdrawnAmountMinor: bigint;
  donorsCount: number;
}

interface CampaignRecord {
  id: number;
  publicId: string;
  ownerUserId: number;
  draftId: number | null;
  postId: number;
  title: string;
  caption: string | null;
  category: string | null;
  fundingMode: FundraisingFundingMode;
  currencyCode: string;
  targetAmountMinor: bigint | null;
  monthlyGoalMinor: bigint | null;
  startsAt: Date | null;
  endsAt: Date | null;
  deadline: Date | null;
  nextReviewAt: Date | null;
  publishedAt: Date | null;
  status: FundraisingCampaignStatus;
  beneficiaryType: string | null;
  beneficiaryName: string | null;
  petId: number | null;
  urgency: string | null;
  treatmentProvider: string | null;
  estimatedExpenseMinor: bigint | null;
  spendingPlan: Record<string, unknown> | null;
  locationText: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  subDistrictId: number | null;
  bdAddressMode: string | null;
  bdDivisionId: number | null;
  bdDistrictId: number | null;
  bdCityCorporationId: number | null;
  bdZoneId: number | null;
  bdWardId: number | null;
  bdUpazilaId: number | null;
  bdUnionId: number | null;
  bdAreaId: number | null;
  mediaIds: number[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  stats: CampaignStatsRecord;
}

interface CampaignUpdateRecord {
  id: number;
  publicId: string;
  postId: number;
  campaignId: number;
  authorId: number;
  title: string | null;
  caption: string | null;
  mediaIds: number[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'DELETED';
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface CampaignUpdateDbRecord {
  id: number;
  publicId: string;
  campaignId: number;
  authorUserId: number;
  title: string | null;
  caption: string | null;
  mediaIds: number[];
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface DonationPaymentAttemptRecord {
  id: number;
  attemptId: string;
  intentId: number;
  provider: string;
  providerPaymentId: string | null;
  redirectUrl: string | null;
  logId: string;
  status: FundraisingDonationStatus;
  requestFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DonationIntentRecord {
  id: number;
  publicId: string;
  referenceId: string;
  status: FundraisingDonationStatus;
  donorUserId: number;
  campaignId: number;
  campaignTitle: string;
  amountMinor: bigint;
  currencyCode: string;
  isAnonymous: boolean;
  supportMessage: string;
  paymentMethodLabel: string;
  consentAccepted: boolean;
  expiresAt: Date;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  idempotencyKey: string;
  paymentAttemptId: number;
}

interface DonationReceiptRecord {
  id: number;
  intentId: number;
  receiptNumber: string;
  amountMinor: bigint;
  currencyCode: string;
  issuedAt: Date;
}

interface WebhookRecord {
  id: number;
  provider: string;
  eventId: string;
  referenceId: string;
  signature: string;
  processedAt: Date | null;
  payloadHash: string;
  outcome: 'RECEIVED' | 'PROCESSED' | 'FAILED';
}

interface DonationLedgerSnapshot {
  donation: DonationIntentRecord;
  payment: DonationPaymentAttemptRecord | null;
  receipt: DonationReceiptRecord | null;
}

interface DonationDbRecord {
  id: number;
  publicId: string;
  referenceId: string;
  campaignId: number;
  donorUserId: number;
  status: string;
  amountMinor: bigint;
  currencyCode: string;
  isAnonymous: boolean;
  supportMessage: string;
  paymentMethodLabel: string;
  consentAccepted: boolean;
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAt: Date;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DonationPaymentAttemptDbRecord {
  id: number;
  attemptId: string;
  donationId: number;
  provider: string;
  providerPaymentId: string | null;
  redirectUrl: string | null;
  logId: string;
  status: string;
  providerMetadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DonationReceiptDbRecord {
  id: number;
  receiptNumber: string;
  donationId: number;
  amountMinor: bigint;
  currencyCode: string;
  issuedAt: Date;
}

interface FundraisingCampaignDbRecord {
  id: number;
  publicId: string;
  ownerUserId: number;
  draftId: number | null;
  title: string;
  caption: string | null;
  category: string | null;
  fundingMode: string;
  currencyCode: string;
  targetAmountMinor: bigint | null;
  monthlyGoalMinor: bigint | null;
  raisedAmountMinor: bigint;
  withdrawnAmountMinor: bigint;
  donorsCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  deadline: Date | null;
  nextReviewAt: Date | null;
  publishedAt: Date | null;
  status: string;
  beneficiaryType: string | null;
  beneficiaryName: string | null;
  petId: number | null;
  urgency: string | null;
  treatmentProvider: string | null;
  estimatedExpenseMinor: bigint | null;
  spendingPlan: Prisma.JsonValue | null;
  locationText: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  subDistrictId: number | null;
  bdAddressMode: string | null;
  bdDivisionId: number | null;
  bdDistrictId: number | null;
  bdCityCorporationId: number | null;
  bdZoneId: number | null;
  bdWardId: number | null;
  bdUpazilaId: number | null;
  bdUnionId: number | null;
  bdAreaId: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FundraisingCampaignMediaDbRecord {
  campaignId: number;
  mediaId: number;
  position: number;
}

interface FundraisingCampaignDraftDbRecord {
  id: number;
  publicId: string;
  ownerUserId: number;
  status: string;
  title: string | null;
  caption: string | null;
  category: string | null;
  fundingMode: string;
  currencyCode: string;
  targetAmountMinor: bigint | null;
  monthlyGoalMinor: bigint | null;
  startsAt: Date | null;
  endsAt: Date | null;
  deadline: Date | null;
  nextReviewAt: Date | null;
  beneficiaryType: string | null;
  beneficiaryName: string | null;
  petId: number | null;
  urgency: string | null;
  treatmentProvider: string | null;
  estimatedExpenseMinor: bigint | null;
  spendingPlan: Prisma.JsonValue | null;
  locationText: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  subDistrictId: number | null;
  bdAddressMode: string | null;
  bdDivisionId: number | null;
  bdDistrictId: number | null;
  bdCityCorporationId: number | null;
  bdZoneId: number | null;
  bdWardId: number | null;
  bdUpazilaId: number | null;
  bdUnionId: number | null;
  bdAreaId: number | null;
  mediaIds: number[];
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  campaign?: FundraisingCampaignDbRecord | null;
}

interface StoreState {
  nextAccountId: number;
  nextDocumentId: number;
  nextDraftId: number;
  nextCampaignId: number;
  nextPostId: number;
  nextUpdateId: number;
  nextIntentId: number;
  nextAttemptId: number;
  nextReceiptId: number;
  nextWebhookId: number;
  accounts: Map<number, FundraisingAccountRecord>;
  drafts: Map<number, CampaignDraftRecord>;
  campaigns: Map<number, CampaignRecord>;
  updates: Map<number, CampaignUpdateRecord>;
  donationIntents: Map<number, DonationIntentRecord>;
  donationAttempts: Map<number, DonationPaymentAttemptRecord>;
  receipts: Map<number, DonationReceiptRecord>;
  webhooks: Map<string, WebhookRecord>;
  draftIdempotencyKeys: Map<string, number>;
  donationIdempotencyKeys: Map<string, number>;
}

export interface FundraisingDraftInput {
  title?: string;
  caption?: string;
  category?: string;
  fundingMode?: string;
  currencyCode?: string;
  targetAmountMinor?: bigint | string | number | null;
  monthlyGoalMinor?: bigint | string | number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  deadline?: string | Date | null;
  nextReviewAt?: string | Date | null;
  beneficiaryType?: string | null;
  beneficiaryName?: string | null;
  petId?: number | string | null;
  urgency?: string | null;
  treatmentProvider?: string | null;
  estimatedExpenseMinor?: bigint | string | number | null;
  spendingPlan?: Record<string, unknown> | null;
  locationText?: string | null;
  countryId?: number | string | null;
  stateId?: number | string | null;
  cityId?: number | string | null;
  subDistrictId?: number | string | null;
  bdAddressMode?: string | null;
  bdDivisionId?: number | string | null;
  bdDistrictId?: number | string | null;
  bdCityCorporationId?: number | string | null;
  bdZoneId?: number | string | null;
  bdWardId?: number | string | null;
  bdUpazilaId?: number | string | null;
  bdUnionId?: number | string | null;
  bdAreaId?: number | string | null;
  mediaIds?: Array<number | string>;
}

export interface FundraisingCampaignInput extends FundraisingDraftInput {
  publishImmediately?: boolean;
}

export interface DonationCheckoutInput {
  amountMinor: bigint | string | number;
  currencyCode?: string;
  returnUrl: string;
  cancelUrl: string;
  supportMessage?: string;
  isAnonymous?: boolean;
  consentAccepted?: boolean;
  paymentMethodLabel?: string;
  /** Best-effort donor contact details for redirect-provider checkout
   * (e.g. EPS requires a name/email/phone/address on session creation).
   * Never required — safe placeholders are used when absent. */
  donorName?: string;
  donorEmail?: string;
  donorPhone?: string;
  donorAddress?: string;
  donorCity?: string;
  /** The caller's request IP, forwarded for the provider's fraud checks. */
  ipAddress?: string;
}

export interface WebhookInput {
  provider: string;
  eventId: string;
  referenceId: string;
  status: string;
  amountMinor: bigint | string | number;
  currencyCode: string;
  providerPaymentId?: string | null;
  signature: string;
  payload: Record<string, unknown>;
}

export interface DonationCheckoutResponse {
  donationIntent: Record<string, unknown>;
  payment: Record<string, unknown> | null;
  reused: boolean;
}

export class FundraisingStore {
  private readonly socialStore: SocialCoreStore;
  private readonly webhookSecret: string;
  private readonly now: () => Date;
  private readonly prisma: PrismaClient;
  private state: StoreState;
  private seedReadyPromise: Promise<void> | null = null;

  constructor(socialStore: SocialCoreStore, options: FundraisingStoreOptions = {}) {
    this.socialStore = socialStore;
    this.webhookSecret = options.webhookSecret ?? 'local-dev-fundraising-secret';
    this.now = options.now ?? (() => new Date());
    this.prisma = options.prisma ?? getPrisma();
    this.state = this.createSeedState();
  }

  private get seedReady(): Promise<void> {
    if (!this.seedReadyPromise) {
      this.seedReadyPromise = this.ensureSeedAccount();
      this.seedReadyPromise.catch(() => {});
    }
    return this.seedReadyPromise;
  }

  reset(): void {
    this.state = this.createSeedState();
  }

  async getAccount(userId: number): Promise<Record<string, unknown> | null> {
    const account = await this.loadVerificationAccountRecord(userId);
    if (!account) return null;
    return this.accountPayload(account);
  }

  async getAccountForReview(
    requesterUserId: number,
    targetUserId: number,
    opts: { isReviewer: boolean },
  ): Promise<Record<string, unknown>> {
    if (requesterUserId !== targetUserId && !opts.isReviewer) {
      throw new FundraisingContractError(
        'FORBIDDEN',
        'You are not authorized to view this verification account',
        403,
      );
    }
    const account = await this.loadVerificationAccountRecord(targetUserId);
    if (!account)
      throw new FundraisingContractError('NOT_FOUND', 'Fundraising account not found', 404);
    return this.accountPayload(account);
  }

  async upsertAccount(
    userId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const memory = this.ensureAccountRecord(this.state, userId);
    const account = this.accountRecordFromInput(memory, userId, input);
    account.updatedAt = this.now();
    const persisted = await this.prisma.fundraisingVerificationAccount.upsert({
      where: { ownerUserId: userId },
      create: this.verificationAccountCreateData(account),
      update: this.verificationAccountUpdateData(account),
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const snapshot = this.accountRecordFromDb(persisted as FundraisingVerificationAccountDbRecord);
    this.transaction((state) => {
      this.syncAccountCacheFromSnapshot(state, snapshot);
      return undefined;
    });
    return this.accountPayload(snapshot);
  }

  async submitAccount(userId: number): Promise<Record<string, unknown>> {
    const account = await this.loadVerificationAccountRecord(userId);
    if (!account)
      throw new FundraisingContractError('NOT_FOUND', 'Fundraising account not found', 404);
    const readiness = this.accountReadinessPayload(account);
    if (!readiness.canStartFundraiser) {
      throw new FundraisingContractError('VALIDATION', 'Fundraising account is not ready', 422);
    }
    const nextStatus = account.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING';
    const persisted = await this.prisma.fundraisingVerificationAccount.update({
      where: { ownerUserId: userId },
      data: {
        status: nextStatus,
        submittedAt: this.now(),
      },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const snapshot = this.accountRecordFromDb(persisted as FundraisingVerificationAccountDbRecord);
    this.transaction((state) => {
      this.syncAccountCacheFromSnapshot(state, snapshot);
      return undefined;
    });
    return this.accountPayload(snapshot);
  }

  async addAccountDocument(
    userId: number,
    input: { title: string; mediaId: number; documentType?: string },
  ): Promise<Record<string, unknown>> {
    this.ensureOwnedMedia(userId, input.mediaId);
    const account = await this.loadVerificationAccountRecord(userId);
    const ensured = account ?? this.ensureAccountRecord(this.state, userId);
    const existing = ensured.documents.find(
      (document) => document.deletedAt === null && document.mediaId === input.mediaId,
    );
    if (existing) {
      throw new FundraisingContractError(
        'MEDIA_BINDING_CONFLICT',
        'Document already attached',
        409,
      );
    }
    const persistedAccount = await this.prisma.fundraisingVerificationAccount.upsert({
      where: { ownerUserId: userId },
      create: this.verificationAccountCreateData(ensured),
      update: this.verificationAccountUpdateData(ensured),
      select: { id: true, ownerUserId: true },
    });
    await this.prisma.fundraisingVerificationDocument.create({
      data: {
        accountId: persistedAccount.id,
        mediaId: input.mediaId,
        title: input.title.trim(),
        documentType: input.documentType === 'PRIMARY' ? 'PRIMARY' : 'SUPPORTING',
      },
    });
    const snapshot = await this.loadVerificationAccountRecord(userId);
    if (!snapshot)
      throw new FundraisingContractError('NOT_FOUND', 'Fundraising account not found', 404);
    this.transaction((state) => {
      this.syncAccountCacheFromSnapshot(state, snapshot);
      return undefined;
    });
    const doc = snapshot.documents.find((document) => document.mediaId === input.mediaId);
    if (!doc) {
      throw new FundraisingContractError('NOT_FOUND', 'Document not found', 404);
    }
    return this.documentPayload(doc);
  }

  async deleteAccountDocument(
    userId: number,
    documentId: number,
  ): Promise<Record<string, unknown>> {
    const account = await this.loadVerificationAccountRecord(userId);
    if (!account)
      throw new FundraisingContractError('NOT_FOUND', 'Fundraising account not found', 404);
    const document = account.documents.find(
      (entry) => entry.id === documentId && entry.deletedAt === null,
    );
    if (!document) throw new FundraisingContractError('NOT_FOUND', 'Document not found', 404);
    await this.prisma.fundraisingVerificationDocument.update({
      where: { id: documentId },
      data: { deletedAt: this.now() },
    });
    const snapshot = await this.loadVerificationAccountRecord(userId);
    if (snapshot) {
      this.transaction((state) => {
        this.syncAccountCacheFromSnapshot(state, snapshot);
        return undefined;
      });
    }
    return { deleted: true, id: documentId };
  }

  async createDraft(
    userId: number,
    input: FundraisingDraftInput,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const key = normalizeText(idempotencyKey);
    if (key) {
      const existingKey = await this.prisma.fundraisingIdempotencyKey.findUnique({
        where: {
          scope_ownerUserId_key: {
            scope: 'draft:create',
            ownerUserId: userId,
            key,
          },
        },
      });
      if (existingKey) {
        const existingDraft = await this.loadDraftRecord(existingKey.resourceId);
        if (existingDraft) return this.draftPayload(existingDraft);
      }
    }
    const draft = this.transaction((state) => this.createDraftRecord(state, userId, input));
    await this.prisma.$transaction(async (tx) => {
      await this.createDraftRow(tx, this.state, draft);
      if (key) {
        this.state.draftIdempotencyKeys.set(this.draftKey(userId, key), draft.id);
        await tx.fundraisingIdempotencyKey.upsert({
          where: {
            scope_ownerUserId_key: {
              scope: 'draft:create',
              ownerUserId: userId,
              key,
            },
          },
          create: {
            scope: 'draft:create',
            ownerUserId: userId,
            key,
            resourceId: draft.id,
          },
          update: {
            resourceId: draft.id,
          },
        });
      }
    });
    const snapshot = (await this.loadDraftRecord(draft.id)) ?? draft;
    return this.draftPayload(snapshot);
  }

  async getDraft(userId: number, draftId: string): Promise<Record<string, unknown>> {
    const draft = await this.mustOwnDraftRecord(userId, draftId);
    return this.draftPayload(draft);
  }

  async updateDraft(
    userId: number,
    draftId: string,
    input: FundraisingDraftInput,
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const draft = await this.mustOwnDraftRecord(userId, draftId);
    this.applyDraftInput(draft, input);
    draft.updatedAt = this.now();
    await this.prisma.fundraisingCampaignDraft.update({
      where: { id: draft.id },
      data: this.draftRowData(draft),
    });
    this.transaction((state) => {
      this.syncDraftCacheFromSnapshot(state, draft);
      return undefined;
    });
    return this.draftPayload(draft);
  }

  async submitDraft(
    userId: number,
    draftId: string,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const key = normalizeText(idempotencyKey);
    if (key) {
      const existingKey = await this.prisma.fundraisingIdempotencyKey.findUnique({
        where: {
          scope_ownerUserId_key: {
            scope: 'draft:submit',
            ownerUserId: userId,
            key,
          },
        },
      });
      if (existingKey) {
        const existingDraft = await this.loadDraftRecord(existingKey.resourceId);
        if (existingDraft) {
          const existingCampaign = await this.loadCampaignByDraftId(existingDraft.id);
          return this.draftPayload(existingDraft, existingCampaign ?? undefined);
        }
      }
    }

    const draft = await this.mustOwnDraftRecord(userId, draftId);
    const alreadySubmittedCampaign = await this.loadCampaignByDraftId(draft.id);
    if (draft.status === 'PENDING_REVIEW' && alreadySubmittedCampaign) {
      return this.draftPayload(draft, alreadySubmittedCampaign);
    }
    // Deliberately NOT gated on verification status, nor on a verification
    // account row existing at all — see `canCreateOrSubmitCampaign`.
    // Submitting for review only requires an authenticated owner and a
    // complete draft; KYC/payout state is enforced at withdrawal instead.
    this.validateDraftForPublishing(draft);
    draft.status = 'PENDING_REVIEW';
    draft.submittedAt = this.now();
    draft.updatedAt = this.now();
    const campaign = this.createCampaignFromDraft(this.state, draft, {
      status: 'PENDING_REVIEW',
      publishedAt: null,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.fundraisingCampaignDraft.update({
        where: { id: draft.id },
        data: this.draftRowData(draft),
      });
      await this.createCampaignRow(tx, campaign);
      await this.persistCampaignMedia(tx, campaign);
      if (key) {
        await tx.fundraisingIdempotencyKey.upsert({
          where: {
            scope_ownerUserId_key: {
              scope: 'draft:submit',
              ownerUserId: userId,
              key,
            },
          },
          create: {
            scope: 'draft:submit',
            ownerUserId: userId,
            key,
            resourceId: draft.id,
          },
          update: {
            resourceId: draft.id,
          },
        });
      }
    });
    this.transaction((state) => {
      this.syncDraftCacheFromSnapshot(state, draft);
      this.syncCampaignCacheFromSnapshot(state, campaign);
      return undefined;
    });
    return this.draftPayload(draft, campaign);
  }

  async createCampaign(
    userId: number,
    input: FundraisingCampaignInput,
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    // Not gated on verification status or on a verification account row
    // existing — see `canCreateOrSubmitCampaign`.
    const draft = this.transaction((state) => {
      const created = this.createDraftRecord(state, userId, input);
      created.status = 'PENDING_REVIEW';
      created.submittedAt = this.now();
      created.updatedAt = this.now();
      return created;
    });
    this.validateDraftForPublishing(draft);
    let campaign: CampaignRecord | undefined;
    await this.prisma.$transaction(async (tx) => {
      await this.createDraftRow(tx, this.state, draft);
      // Built only after the draft's real id is known, so `campaign.draftId`
      // never carries the pre-persist, potentially-stale temp id.
      campaign = this.createCampaignFromDraft(this.state, draft, {
        status: 'PENDING_REVIEW',
        publishedAt: null,
      });
      await this.createCampaignRow(tx, campaign);
      await this.persistCampaignMedia(tx, campaign);
    });
    this.transaction((state) => {
      this.syncDraftCacheFromSnapshot(state, draft);
      this.syncCampaignCacheFromSnapshot(state, campaign!);
      return undefined;
    });
    return this.campaignPayload(campaign!, userId);
  }

  async updateCampaign(
    userId: number,
    campaignId: number,
    input: FundraisingCampaignInput,
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const campaign = await this.mustOwnCampaignRecord(userId, campaignId);
    this.ensureCampaignEditable(campaign);
    if (input.title !== undefined) {
      const title = normalizeText(input.title);
      if (!title) throw new FundraisingContractError('VALIDATION', 'title is required', 422);
      campaign.title = title;
    }
    if (input.caption !== undefined) campaign.caption = normalizeText(input.caption);
    if (input.category !== undefined) campaign.category = normalizeText(input.category);
    if (input.fundingMode !== undefined) {
      campaign.fundingMode = normalizeFundingMode(input.fundingMode) ?? campaign.fundingMode;
    }
    if (input.currencyCode !== undefined)
      campaign.currencyCode = normalizeCurrency(input.currencyCode) ?? campaign.currencyCode;
    if (input.targetAmountMinor !== undefined)
      campaign.targetAmountMinor =
        input.targetAmountMinor == null
          ? null
          : parseMoneyMinor(input.targetAmountMinor, 'targetAmountMinor');
    if (input.monthlyGoalMinor !== undefined)
      campaign.monthlyGoalMinor =
        input.monthlyGoalMinor == null
          ? null
          : parseMoneyMinor(input.monthlyGoalMinor, 'monthlyGoalMinor');
    if (input.startsAt !== undefined) campaign.startsAt = parseDate(input.startsAt);
    if (input.endsAt !== undefined) campaign.endsAt = parseDate(input.endsAt);
    if (input.deadline !== undefined) campaign.deadline = parseDate(input.deadline);
    if (input.nextReviewAt !== undefined) campaign.nextReviewAt = parseDate(input.nextReviewAt);
    if (input.beneficiaryType !== undefined)
      campaign.beneficiaryType = normalizeText(input.beneficiaryType);
    if (input.beneficiaryName !== undefined)
      campaign.beneficiaryName = normalizeText(input.beneficiaryName);
    if (input.petId !== undefined) campaign.petId = parseNumber(input.petId);
    if (input.urgency !== undefined) campaign.urgency = normalizeText(input.urgency);
    if (input.treatmentProvider !== undefined)
      campaign.treatmentProvider = normalizeText(input.treatmentProvider);
    if (input.estimatedExpenseMinor !== undefined)
      campaign.estimatedExpenseMinor =
        input.estimatedExpenseMinor == null
          ? null
          : parseMoneyMinor(input.estimatedExpenseMinor, 'estimatedExpenseMinor');
    if (input.spendingPlan !== undefined)
      campaign.spendingPlan = this.extractObject(input.spendingPlan);
    if (input.locationText !== undefined) campaign.locationText = normalizeText(input.locationText);
    if (input.countryId !== undefined) campaign.countryId = parseNumber(input.countryId);
    if (input.stateId !== undefined) campaign.stateId = parseNumber(input.stateId);
    if (input.cityId !== undefined) campaign.cityId = parseNumber(input.cityId);
    if (input.subDistrictId !== undefined)
      campaign.subDistrictId = parseNumber(input.subDistrictId);
    if (input.bdDivisionId !== undefined) campaign.bdDivisionId = parseNumber(input.bdDivisionId);
    if (input.bdDistrictId !== undefined) campaign.bdDistrictId = parseNumber(input.bdDistrictId);
    if (input.bdUpazilaId !== undefined) campaign.bdUpazilaId = parseNumber(input.bdUpazilaId);
    if (input.bdAreaId !== undefined) campaign.bdAreaId = parseNumber(input.bdAreaId);
    if (Array.isArray(input.mediaIds)) {
      campaign.mediaIds = input.mediaIds
        .map((value) => parseNumber(value))
        .filter((value): value is number => value !== null);
    }
    this.ensureCampaignDates(campaign);
    campaign.updatedAt = this.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.fundraisingCampaign.update({
        where: { id: campaign.id },
        data: {
          ...this.campaignRowData(campaign),
          version: { increment: 1 },
        } as Prisma.FundraisingCampaignUncheckedUpdateInput,
      });
      await this.persistCampaignMedia(tx, campaign);
    });
    this.transaction((state) => {
      this.syncCampaignCacheFromSnapshot(state, campaign);
      return undefined;
    });
    return this.campaignPayload(campaign, userId);
  }

  async publishCampaign(userId: number, campaignId: number): Promise<Record<string, unknown>> {
    await this.seedReady;
    const campaign = await this.mustOwnCampaignRecord(userId, campaignId);
    if (campaign.status !== 'PENDING_REVIEW') {
      throw new FundraisingContractError(
        'INVALID_TRANSITION',
        'Campaign is not ready to publish',
        409,
      );
    }
    campaign.status = 'ACTIVE';
    campaign.publishedAt = this.now();
    campaign.updatedAt = this.now();
    await this.prisma.fundraisingCampaign.update({
      where: { id: campaign.id },
      data: {
        ...this.campaignRowData(campaign),
        version: { increment: 1 },
      } as Prisma.FundraisingCampaignUncheckedUpdateInput,
    });
    this.transaction((state) => {
      this.syncCampaignCacheFromSnapshot(state, campaign);
      return undefined;
    });
    return this.campaignPayload(campaign, userId);
  }

  async deleteCampaign(userId: number, campaignId: number): Promise<Record<string, unknown>> {
    await this.seedReady;
    const campaign = await this.mustOwnCampaignRecord(userId, campaignId);
    campaign.status = 'CANCELLED';
    campaign.deletedAt = this.now();
    campaign.updatedAt = this.now();
    await this.prisma.fundraisingCampaign.update({
      where: { id: campaign.id },
      data: {
        ...this.campaignRowData(campaign),
        version: { increment: 1 },
      } as Prisma.FundraisingCampaignUncheckedUpdateInput,
    });
    this.transaction((state) => {
      this.syncCampaignCacheFromSnapshot(state, campaign);
      return undefined;
    });
    return { deleted: true, id: campaignId, status: campaign.status };
  }

  async getCampaign(
    viewerUserId: number,
    campaignId: number,
    opts: { isManager?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const campaign = await this.mustGetCampaignRecord(campaignId);
    this.ensureCanViewCampaign(viewerUserId, campaign, opts.isManager);
    return this.campaignPayload(campaign, viewerUserId);
  }

  async listFeed(
    viewerUserId: number,
    query: {
      limit?: number;
      cursor?: string;
      verified?: boolean;
      category?: string;
      location?: string;
      sort?: string;
    },
    opts: { isManager?: boolean } = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    await this.seedReady;
    const rows = await this.prisma.fundraisingCampaign.findMany({
      where: { deletedAt: null },
      include: {
        media: {
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const campaigns = [];
    for (const row of rows) {
      const campaign = this.campaignRecordFromDb(
        row as unknown as FundraisingCampaignDbRecord & {
          media?: FundraisingCampaignMediaDbRecord[];
        },
      );
      const account = await this.loadVerificationAccountRecord(campaign.ownerUserId);
      if (account) {
        this.transaction((state) => {
          this.syncAccountCacheFromSnapshot(state, account);
          return undefined;
        });
      }
      if (
        this.canViewerSeeCampaign(viewerUserId, campaign, opts.isManager) &&
        this.matchesFeedFilters(campaign, query)
      ) {
        campaigns.push(campaign);
      }
    }
    const sorted = this.sortCampaigns(campaigns, query.sort);
    const sliced = this.sliceByCursor(sorted, query.limit ?? 50, query.cursor);
    return {
      items: sliced.map((campaign) => this.campaignPayload(campaign, viewerUserId)),
      nextCursor:
        sliced.length === (query.limit ?? 50) && sliced.length > 0
          ? String(sliced[sliced.length - 1]!.id)
          : null,
    };
  }

  async listMyCampaigns(userId: number, limit = 100): Promise<Record<string, unknown>[]> {
    await this.seedReady;
    const rows = await this.prisma.fundraisingCampaign.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      include: {
        media: {
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    const campaigns = rows.map((row) =>
      this.campaignRecordFromDb(
        row as unknown as FundraisingCampaignDbRecord & {
          media?: FundraisingCampaignMediaDbRecord[];
        },
      ),
    );
    return campaigns.map((campaign) => this.campaignPayload(campaign, userId));
  }

  async listUpdates(
    viewerUserId: number,
    campaignId: number,
    limit = 50,
    cursor?: string,
    opts: { isManager?: boolean } = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    await this.seedReady;
    const campaign = await this.mustGetCampaignRecord(campaignId);
    this.ensureCanViewCampaign(viewerUserId, campaign, opts.isManager);
    const cursorId = parseNumber(cursor);
    const rows = await this.prisma.fundraisingCampaignUpdate.findMany({
      where: {
        campaignId,
        deletedAt: null,
        status: 'PUBLISHED',
        ...(cursorId === null ? {} : { id: { lt: cursorId } }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(limit, 100)),
    });
    const updates = rows.map((row) => this.campaignUpdateRecordFromDb(row));
    this.transaction((state) => {
      for (const update of updates) {
        this.syncUpdateCacheFromSnapshot(state, update);
      }
      return undefined;
    });
    return {
      items: updates.map((update) => this.updatePayload(update, viewerUserId)),
      nextCursor:
        updates.length === Math.max(1, Math.min(limit, 100)) && updates.length > 0
          ? String(updates[updates.length - 1]!.id)
          : null,
    };
  }

  async createUpdate(
    userId: number,
    campaignId: number,
    input: { title?: string | null; caption?: string | null; mediaIds?: Array<number | string> },
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const campaign = await this.mustOwnCampaignRecord(userId, campaignId);
    this.ensureCampaignEditable(campaign);
    const mediaIds = Array.isArray(input.mediaIds)
      ? input.mediaIds
          .map((value) => parseNumber(value))
          .filter((value): value is number => value !== null)
      : [];
    mediaIds.forEach((mediaId) => this.ensureOwnedMedia(userId, mediaId));
    const now = this.now();
    const persisted = await this.prisma.fundraisingCampaignUpdate.create({
      data: {
        publicId: `update_${randomUUID()}`,
        campaignId,
        authorUserId: userId,
        title: normalizeText(input.title),
        caption: normalizeText(input.caption),
        mediaIds,
        status: 'PUBLISHED',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });
    const update = this.campaignUpdateRecordFromDb(persisted as CampaignUpdateDbRecord);
    this.transaction((state) => {
      this.syncUpdateCacheFromSnapshot(state, update);
      return undefined;
    });
    return this.updatePayload(update, userId);
  }

  async updateUpdate(
    userId: number,
    updateId: number,
    input: { title?: string | null; caption?: string | null; mediaIds?: Array<number | string> },
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const update = await this.mustOwnUpdateRecord(userId, updateId);
    if (update.deletedAt !== null) {
      throw new FundraisingContractError('NOT_FOUND', 'Update not found', 404);
    }
    const mediaIds = Array.isArray(input.mediaIds)
      ? input.mediaIds
          .map((value) => parseNumber(value))
          .filter((value): value is number => value !== null)
      : null;
    if (mediaIds) {
      mediaIds.forEach((mediaId) => this.ensureOwnedMedia(userId, mediaId));
    }
    const updatedAt = this.now();
    const persisted = await this.prisma.fundraisingCampaignUpdate.update({
      where: { id: update.id },
      data: {
        title: input.title === undefined ? undefined : normalizeText(input.title),
        caption: input.caption === undefined ? undefined : normalizeText(input.caption),
        ...(mediaIds === null ? {} : { mediaIds }),
        updatedAt,
      },
    });
    const snapshot = this.campaignUpdateRecordFromDb(persisted);
    this.transaction((state) => {
      this.syncUpdateCacheFromSnapshot(state, snapshot);
      return undefined;
    });
    return this.updatePayload(snapshot, userId);
  }

  async deleteUpdate(userId: number, updateId: number): Promise<Record<string, unknown>> {
    await this.seedReady;
    const update = await this.mustOwnUpdateRecord(userId, updateId);
    const updatedAt = this.now();
    const persisted = await this.prisma.fundraisingCampaignUpdate.update({
      where: { id: update.id },
      data: {
        status: 'DELETED',
        deletedAt: updatedAt,
        updatedAt,
      },
    });
    const snapshot = this.campaignUpdateRecordFromDb(persisted);
    this.transaction((state) => {
      this.syncUpdateCacheFromSnapshot(state, snapshot);
      return undefined;
    });
    return { deleted: true, id: snapshot.id };
  }

  async createDonationCheckout(
    userId: number,
    campaignId: number,
    input: DonationCheckoutInput,
    idempotencyKey: string,
  ): Promise<DonationCheckoutResponse> {
    await this.seedReady;
    const amountMinor = parseMoneyMinor(input.amountMinor, 'amount');
    if (amountMinor <= 0n) {
      throw new FundraisingContractError(
        'VALIDATION',
        'Donation amount must be greater than zero',
        422,
      );
    }
    const returnUrl = normalizeText(input.returnUrl);
    const cancelUrl = normalizeText(input.cancelUrl);
    const supportMessage = normalizeText(input.supportMessage) ?? '';
    const paymentMethodLabel = normalizeText(input.paymentMethodLabel) ?? 'Donation checkout';
    const currencyCode = normalizeCurrency(input.currencyCode);
    const fingerprint = `${campaignId}:${amountMinor.toString()}:${currencyCode ?? ''}:${returnUrl ?? ''}:${cancelUrl ?? ''}:${supportMessage}:${paymentMethodLabel}:${Boolean(input.isAnonymous)}:${input.consentAccepted !== false}`;
    const campaign = await this.loadCampaignRecord(campaignId);
    if (!campaign) {
      throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
    }
    this.ensureCanDonate(userId, campaign);
    const resolvedCurrency = currencyCode ?? campaign.currencyCode;
    if (resolvedCurrency !== campaign.currencyCode) {
      throw new FundraisingContractError('VALIDATION', 'Currency mismatch', 422);
    }

    const campaignRecord = campaign;
    await this.upsertCampaignRow(this.prisma, campaignRecord);
    const checkoutNow = this.now();
    const existing = await this.prisma.fundraisingDonation.findUnique({
      where: {
        donorUserId_campaignId_idempotencyKey: {
          donorUserId: userId,
          campaignId,
          idempotencyKey,
        },
      },
      include: {
        campaign: true,
        paymentAttempts: {
          orderBy: { createdAt: 'desc' },
        },
        receipt: true,
      },
    });

    let intent: DonationIntentRecord;
    let payment: DonationPaymentAttemptRecord | null = null;
    let receipt: DonationReceiptRecord | null = null;
    let reused = false;
    if (existing) {
      const paymentRow = existing.paymentAttempts[0] ?? null;
      payment =
        paymentRow == null
          ? null
          : this.paymentAttemptPayloadFromDb(paymentRow as DonationPaymentAttemptDbRecord);
      if (payment && payment.requestFingerprint !== fingerprint) {
        throw new FundraisingContractError(
          'CONFLICT',
          'Duplicate idempotency key with different request',
          409,
        );
      }
      intent = this.donationIntentFromDb(
        existing as DonationDbRecord,
        existing.campaign?.title ?? campaignRecord.title,
        paymentRow?.id ?? 0,
      );
      receipt = existing.receipt
        ? this.receiptPayloadFromDb(existing.receipt as DonationReceiptDbRecord)
        : null;
      reused = true;
    } else {
      const providerMetadata = this.sanitizeProviderMetadata({
        source: 'checkout',
        requestFingerprint: fingerprint,
        amountMinor: amountMinor.toString(),
        currencyCode: resolvedCurrency,
      });
      const referenceId = `ref_${campaignId}_${Date.now()}_${randomUUID()}`;
      // Resolved BEFORE any row is written — a misconfigured/unavailable
      // provider must fail the whole checkout attempt, never leave a
      // stray donation/payment-attempt row with a made-up redirect URL.
      // `referenceId` doubles as the EPS merchantTransactionId so the
      // donation row we're about to create and the session EPS just
      // opened always resolve to the same reconciliation key.
      let redirect: ResolvedPaymentRedirect;
      try {
        redirect = await resolvePaymentRedirect({
          merchantTransactionId: referenceId,
          customerOrderId: referenceId,
          totalAmount: Number(amountMinor) / 100,
          customerName: normalizeText(input.donorName) ?? 'Furtail Donor',
          customerEmail: normalizeText(input.donorEmail) ?? 'donor@furtail.app',
          customerPhone: normalizeText(input.donorPhone) ?? '01700000000',
          customerAddress:
            normalizeText(input.donorAddress) ?? campaignRecord.locationText ?? 'Dhaka',
          customerCity: normalizeText(input.donorCity) ?? 'Dhaka',
          ipAddress: normalizeText(input.ipAddress) ?? '127.0.0.1',
        });
      } catch (error) {
        if (error instanceof PaymentProviderUnavailableError) {
          throw new FundraisingContractError('PAYMENT_PROVIDER_UNAVAILABLE', error.message, 503);
        }
        throw error;
      }
      try {
        const donation = await this.prisma.fundraisingDonation.create({
          data: {
            publicId: `intent_${randomUUID()}`,
            referenceId,
            campaignId,
            donorUserId: userId,
            status: 'PENDING',
            amountMinor,
            currencyCode: resolvedCurrency,
            isAnonymous: Boolean(input.isAnonymous),
            supportMessage,
            paymentMethodLabel,
            consentAccepted: input.consentAccepted !== false,
            idempotencyKey,
            requestFingerprint: fingerprint,
            expiresAt: new Date(checkoutNow.getTime() + 30 * 60 * 1000),
          },
        });

        const createdPayment = await this.prisma.fundraisingPaymentAttempt.create({
          data: {
            attemptId: `attempt_${randomUUID()}`,
            donationId: donation.id,
            provider: redirect.provider,
            providerPaymentId: redirect.providerPaymentId,
            redirectUrl: redirect.redirectUrl,
            logId: `log_${randomUUID()}`,
            status: 'PENDING',
            ...(providerMetadata ? { providerMetadata } : {}),
          },
        });

        intent = this.donationIntentFromDb(
          donation as DonationDbRecord,
          campaignRecord.title,
          createdPayment.id,
        );
        payment = this.paymentAttemptPayloadFromDb(
          createdPayment as DonationPaymentAttemptDbRecord,
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const conflicted = await this.prisma.fundraisingDonation.findUnique({
            where: {
              donorUserId_campaignId_idempotencyKey: {
                donorUserId: userId,
                campaignId,
                idempotencyKey,
              },
            },
            include: {
              campaign: true,
              paymentAttempts: {
                orderBy: { createdAt: 'desc' },
              },
              receipt: true,
            },
          });
          if (conflicted) {
            const conflictedPaymentRow = conflicted.paymentAttempts[0] ?? null;
            const conflictedPayment =
              conflictedPaymentRow == null
                ? null
                : this.paymentAttemptPayloadFromDb(
                    conflictedPaymentRow as DonationPaymentAttemptDbRecord,
                  );
            if (conflictedPayment && conflictedPayment.requestFingerprint !== fingerprint) {
              throw new FundraisingContractError(
                'CONFLICT',
                'Duplicate idempotency key with different request',
                409,
              );
            }
            intent = this.donationIntentFromDb(
              conflicted as DonationDbRecord,
              conflicted.campaign?.title ?? campaignRecord.title,
              conflictedPaymentRow?.id ?? 0,
            );
            payment = conflictedPayment;
            receipt = conflicted.receipt
              ? this.receiptPayloadFromDb(conflicted.receipt as DonationReceiptDbRecord)
              : null;
            reused = true;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    this.transaction((state) => {
      this.syncDonationCacheFromSnapshot(state, intent, payment, receipt);
      return undefined;
    });

    return this.checkoutResponse(intent, payment, reused);
  }

  async getDonationAttemptByReference(
    viewerUserId: number,
    referenceOrAttemptId: string,
  ): Promise<Record<string, unknown>> {
    await this.seedReady;
    const snapshot = await this.loadDonationSnapshot(referenceOrAttemptId);
    if (!snapshot) throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    const campaign = await this.loadCampaignRecord(snapshot.donation.campaignId);
    if (
      snapshot.donation.donorUserId !== viewerUserId &&
      (!campaign || campaign.ownerUserId !== viewerUserId)
    ) {
      throw new FundraisingContractError('FORBIDDEN', 'Donation not found', 403);
    }
    return this.donationAttemptPayload(snapshot);
  }

  async listDonations(
    viewerUserId: number,
    campaignId: number,
    limit = 50,
    cursor?: string,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    await this.seedReady;
    const campaign = await this.loadCampaignRecord(campaignId);
    if (!campaign) {
      throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
    }
    this.ensureCanViewCampaign(viewerUserId, campaign);
    const dbDonations = await this.prisma.fundraisingDonation.findMany({
      where: {
        campaignId,
        status: 'SUCCEEDED',
      },
      include: {
        campaign: true,
        paymentAttempts: {
          orderBy: { createdAt: 'desc' },
        },
        receipt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const donations = dbDonations
      .map((entry) =>
        this.donationIntentFromDb(
          entry as DonationDbRecord,
          (entry as { campaign?: { title?: string } }).campaign?.title ?? campaign.title,
          0,
        ),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const sliced = this.sliceByCursor(donations, limit, cursor);
    return {
      items: sliced.map((intent) => this.donationItemPayload(intent, viewerUserId)),
      nextCursor:
        sliced.length === limit && sliced.length > 0 ? String(sliced[sliced.length - 1]!.id) : null,
    };
  }

  async getPaymentStatus(
    viewerUserId: number,
    referenceId: string,
  ): Promise<Record<string, unknown>> {
    return this.getDonationAttemptByReference(viewerUserId, referenceId);
  }

  /**
   * EPS has no signed server-to-server webhook push (see eps-client.ts) —
   * it only redirects the payer's browser to our success/fail/cancel URLs,
   * carrying no trustworthy payload. This is the one place that redirect is
   * used for: as a trigger to ask EPS's own status API (x-hash + bearer
   * authenticated — this call IS the cryptographic verification step) what
   * actually happened, then apply that verified outcome through the exact
   * same idempotent, atomic transition `handleWebhook` already uses for
   * every other provider. The redirect's own query string is never trusted
   * for the outcome itself — only `referenceId` is read from it, and that
   * is not privileged (it is DB-idempotency-guarded, not authorization).
   *
   * Safe to call repeatedly (button double-taps, retried redirects, a user
   * reloading the return page): `eventId` is derived from EPS's own
   * outcome, so re-resolving the same settled outcome is a no-op via the
   * existing `fundraisingWebhookEvent` dedup, and never re-increments
   * raised totals or re-creates a receipt.
   */
  async reconcileEpsPayment(referenceId: string): Promise<Record<string, unknown>> {
    await this.seedReady;
    const snapshot = await this.loadDonationSnapshot(referenceId);
    if (!snapshot) {
      throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    }
    const status = await epsCheckTransactionStatus(referenceId);
    const mappedStatus = mapEpsOutcomeToDonationStatus(status.outcome);
    const eventId = `eps:${referenceId}:${status.outcome}`;
    const amountMinor = snapshot.donation.amountMinor;
    const currencyCode = snapshot.donation.currencyCode;
    const providerPaymentId = status.epsTransactionId ?? '';
    // Only safe, non-secret fields — no credentials, tokens, or full raw
    // provider payloads are ever logged or persisted verbatim.
    const payload = {
      outcome: status.outcome,
      epsTransactionId: status.epsTransactionId,
      financialEntity: status.financialEntity,
    };
    const rawPayload = stablePayloadString(payload);
    const signature = signWebhookPayload(
      this.webhookSecret,
      'eps',
      eventId,
      referenceId,
      mappedStatus,
      amountMinor,
      currencyCode,
      providerPaymentId,
      rawPayload,
    );
    return this.handleWebhook({
      provider: 'eps',
      eventId,
      referenceId,
      status: mappedStatus,
      amountMinor,
      currencyCode,
      providerPaymentId: providerPaymentId || undefined,
      signature,
      payload,
    });
  }

  async handleWebhook(input: WebhookInput): Promise<Record<string, unknown>> {
    await this.seedReady;
    const rawPayload = stablePayloadString(input.payload);
    const expectedSignature = signWebhookPayload(
      this.webhookSecret,
      input.provider,
      input.eventId,
      input.referenceId,
      input.status,
      input.amountMinor,
      input.currencyCode,
      input.providerPaymentId ?? '',
      rawPayload,
    );
    if (!timingSafeEqualText(expectedSignature, input.signature)) {
      throw new FundraisingContractError(
        'BAD_SIGNATURE',
        'Webhook signature verification failed',
        401,
      );
    }

    const donationSnapshot = await this.loadDonationSnapshot(input.referenceId);
    if (!donationSnapshot) {
      throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    }

    const nextStatus = normalizeDonationStatus(input.status);
    const eventKey = { provider: input.provider, eventId: input.eventId };
    const handled = await this.prisma.$transaction(async (tx) => {
      const existingEvent = await tx.fundraisingWebhookEvent.findUnique({
        where: {
          provider_eventId: eventKey,
        },
      });
      if (existingEvent && existingEvent.outcome === 'PROCESSED') {
        return {
          duplicate: true as const,
          snapshot: donationSnapshot,
          receipt: await this.loadReceiptFromTx(tx, donationSnapshot.donation.id),
        };
      }

      await tx.fundraisingWebhookEvent.upsert({
        where: { provider_eventId: eventKey },
        create: {
          provider: input.provider,
          eventId: input.eventId,
          referenceId: input.referenceId,
          outcome: 'RECEIVED',
          payloadHash: hashText(rawPayload),
        },
        update: {
          referenceId: input.referenceId,
          payloadHash: hashText(rawPayload),
        },
      });

      const donationRow = await tx.fundraisingDonation.findUnique({
        where: { referenceId: input.referenceId },
        include: {
          campaign: true,
          paymentAttempts: {
            orderBy: { createdAt: 'desc' },
          },
          receipt: true,
        },
      });
      if (!donationRow) {
        throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
      }

      const campaign = donationRow.campaign;
      if (!campaign) {
        throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
      }

      const paymentRow = donationRow.paymentAttempts[0] ?? null;
      const isDonatable = this.canConfirmDonationForCampaign(
        campaign as unknown as FundraisingCampaignDbRecord,
      );
      const sanitizedProviderMetadata = this.sanitizeProviderMetadata({
        provider: input.provider,
        eventId: input.eventId,
        referenceId: input.referenceId,
        status: input.status,
        amountMinor: String(input.amountMinor),
        currencyCode: input.currencyCode,
        providerPaymentId: input.providerPaymentId,
        payload: input.payload,
      });

      let finalStatus = nextStatus;
      if (nextStatus === 'SUCCEEDED' && !isDonatable) {
        finalStatus = 'FAILED';
      }

      const transitioned = await this.tryTransitionDonation(tx, donationRow.id, finalStatus);
      const donationAfterTransition =
        transitioned ??
        (await tx.fundraisingDonation.findUniqueOrThrow({ where: { id: donationRow.id } }));

      if (paymentRow) {
        const nextPaymentMetadata = sanitizedProviderMetadata;
        await tx.fundraisingPaymentAttempt.update({
          where: { attemptId: paymentRow.attemptId },
          data: {
            status: donationAfterTransition.status,
            providerPaymentId:
              normalizeText(input.providerPaymentId) ?? paymentRow.providerPaymentId,
            ...(nextPaymentMetadata ? { providerMetadata: nextPaymentMetadata } : {}),
          },
        });
      }

      let receipt = donationRow.receipt;
      if (donationAfterTransition.status === 'SUCCEEDED' && !receipt) {
        receipt = await tx.fundraisingReceipt.create({
          data: {
            receiptNumber: `rcpt_${randomUUID()}`,
            donationId: donationRow.id,
            amountMinor: donationRow.amountMinor,
            currencyCode: donationRow.currencyCode,
          },
        });
        await tx.fundraisingCampaign.update({
          where: { id: donationRow.campaignId },
          data: {
            raisedAmountMinor: {
              increment: donationRow.amountMinor,
            },
            donorsCount: {
              increment: 1,
            },
            status:
              campaign.targetAmountMinor !== null &&
              campaign.raisedAmountMinor + donationRow.amountMinor >= campaign.targetAmountMinor
                ? 'FUNDED'
                : campaign.status,
          },
        });
      }

      await tx.fundraisingWebhookEvent.update({
        where: { provider_eventId: eventKey },
        data: {
          processedAt: this.now(),
          outcome: 'PROCESSED',
        },
      });

      const payment =
        paymentRow == null
          ? null
          : this.paymentAttemptPayloadFromDb({
              ...paymentRow,
              status: donationAfterTransition.status,
              providerPaymentId:
                normalizeText(input.providerPaymentId) ?? paymentRow.providerPaymentId,
              providerMetadata: sanitizedProviderMetadata,
            } as DonationPaymentAttemptDbRecord);
      return {
        duplicate: false as const,
        snapshot: this.donationSnapshotFromDb(
          donationAfterTransition as DonationDbRecord,
          campaign.title,
          payment,
          receipt ? this.receiptPayloadFromDb(receipt as DonationReceiptDbRecord) : null,
        ),
        receipt: receipt ? this.receiptPayloadFromDb(receipt as DonationReceiptDbRecord) : null,
      };
    });

    this.transaction((state) => {
      this.syncDonationCacheFromSnapshot(
        state,
        handled.snapshot.donation,
        handled.snapshot.payment,
        handled.snapshot.receipt,
      );
      const webhookKey = `${input.provider}:${input.eventId}`;
      state.webhooks.set(webhookKey, {
        id: state.nextWebhookId++,
        provider: input.provider,
        eventId: input.eventId,
        referenceId: input.referenceId,
        signature: input.signature,
        processedAt: this.now(),
        payloadHash: hashText(rawPayload),
        outcome: 'PROCESSED',
      });
      return undefined;
    });

    return {
      duplicate: handled.duplicate,
      status: handled.snapshot.donation.status,
      donationIntent: this.donationIntentPayload(handled.snapshot.donation),
      receipt: handled.snapshot.receipt ? this.receiptPayload(handled.snapshot.receipt) : null,
    };
  }

  private async loadDonationSnapshot(
    referenceOrAttemptId: string,
  ): Promise<DonationLedgerSnapshot | null> {
    const parsed = parseNumber(referenceOrAttemptId);
    const donation = await this.prisma.fundraisingDonation.findFirst({
      where: {
        OR: [
          { referenceId: referenceOrAttemptId },
          { publicId: referenceOrAttemptId },
          ...(parsed === null ? [] : [{ id: parsed }]),
        ],
      },
      include: {
        campaign: true,
        paymentAttempts: {
          orderBy: { createdAt: 'desc' },
        },
        receipt: true,
      },
    });
    if (!donation) return null;
    const paymentRow = donation.paymentAttempts[0] ?? null;
    const snapshot = this.donationSnapshotFromDb(
      donation as DonationDbRecord,
      (donation.campaign?.title ?? '') as string,
      paymentRow
        ? (this.paymentAttemptPayloadFromDb(
            paymentRow as DonationPaymentAttemptDbRecord,
          ) as DonationPaymentAttemptRecord)
        : null,
      donation.receipt
        ? (this.receiptPayloadFromDb(
            donation.receipt as DonationReceiptDbRecord,
          ) as DonationReceiptRecord)
        : null,
    );
    this.transaction((state) => {
      this.syncDonationCacheFromSnapshot(
        state,
        snapshot.donation,
        snapshot.payment,
        snapshot.receipt,
      );
      return undefined;
    });
    return snapshot;
  }

  private async loadReceiptFromTx(
    tx: Prisma.TransactionClient,
    donationId: number,
  ): Promise<DonationReceiptRecord | null> {
    const receipt = await tx.fundraisingReceipt.findUnique({ where: { donationId } });
    return receipt ? this.receiptPayloadFromDb(receipt as DonationReceiptDbRecord) : null;
  }

  private async loadVerificationAccountRecord(
    userId: number,
  ): Promise<FundraisingAccountRecord | null> {
    await this.seedReady;
    const row = await this.prisma.fundraisingVerificationAccount.findUnique({
      where: { ownerUserId: userId },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) return null;
    const account = this.accountRecordFromDb(row as FundraisingVerificationAccountDbRecord);
    this.transaction((state) => {
      this.syncAccountCacheFromSnapshot(state, account);
      return undefined;
    });
    return account;
  }

  private async loadCampaignRecord(campaignId: number): Promise<CampaignRecord | null> {
    await this.seedReady;
    const row = await this.prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        media: {
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!row) return null;
    const campaign = this.campaignRecordFromDb(
      row as unknown as FundraisingCampaignDbRecord & {
        media?: FundraisingCampaignMediaDbRecord[];
      },
    );
    const account = await this.loadVerificationAccountRecord(campaign.ownerUserId);
    if (account) {
      this.transaction((state) => {
        this.syncAccountCacheFromSnapshot(state, account);
        return undefined;
      });
    }
    return campaign;
  }

  private async loadDraftRecord(draftId: number): Promise<CampaignDraftRecord | null> {
    await this.seedReady;
    const row = await this.prisma.fundraisingCampaignDraft.findUnique({
      where: { id: draftId },
      include: {
        campaign: {
          include: {
            media: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
    if (!row) return null;
    const draft = this.draftRecordFromDb(
      row as unknown as FundraisingCampaignDraftDbRecord & {
        campaign?:
          (FundraisingCampaignDbRecord & { media?: FundraisingCampaignMediaDbRecord[] }) | null;
      },
    );
    this.transaction((state) => {
      this.syncDraftCacheFromSnapshot(state, draft);
      if (row.campaign) {
        const campaign = this.campaignRecordFromDb(
          row.campaign as unknown as FundraisingCampaignDbRecord & {
            media?: FundraisingCampaignMediaDbRecord[];
          },
        );
        this.syncCampaignCacheFromSnapshot(state, campaign);
      }
      return undefined;
    });
    return draft;
  }

  private async loadCampaignByDraftId(draftId: number): Promise<CampaignRecord | null> {
    await this.seedReady;
    const row = await this.prisma.fundraisingCampaign.findFirst({
      where: { draftId },
      include: {
        media: {
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!row) return null;
    const campaign = this.campaignRecordFromDb(
      row as unknown as FundraisingCampaignDbRecord & {
        media?: FundraisingCampaignMediaDbRecord[];
      },
    );
    this.transaction((state) => {
      this.syncCampaignCacheFromSnapshot(state, campaign);
      return undefined;
    });
    return campaign;
  }

  private async loadUpdateRecord(updateId: number): Promise<CampaignUpdateRecord | null> {
    await this.seedReady;
    const row = await this.prisma.fundraisingCampaignUpdate.findUnique({
      where: { id: updateId },
    });
    if (!row) return null;
    const update = this.campaignUpdateRecordFromDb(row);
    this.transaction((state) => {
      this.syncUpdateCacheFromSnapshot(state, update);
      return undefined;
    });
    return update;
  }

  private campaignRecordFromDb(
    row: FundraisingCampaignDbRecord & { media?: FundraisingCampaignMediaDbRecord[] },
  ): CampaignRecord {
    return {
      id: row.id,
      publicId: row.publicId,
      ownerUserId: row.ownerUserId,
      draftId: row.draftId,
      postId: row.id,
      title: row.title,
      caption: row.caption,
      category: row.category,
      fundingMode: row.fundingMode as FundraisingFundingMode,
      currencyCode: row.currencyCode,
      targetAmountMinor: row.targetAmountMinor,
      monthlyGoalMinor: row.monthlyGoalMinor,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      deadline: row.deadline,
      nextReviewAt: row.nextReviewAt,
      publishedAt: row.publishedAt,
      status: row.status as FundraisingCampaignStatus,
      beneficiaryType: row.beneficiaryType,
      beneficiaryName: row.beneficiaryName,
      petId: row.petId,
      urgency: row.urgency,
      treatmentProvider: row.treatmentProvider,
      estimatedExpenseMinor: row.estimatedExpenseMinor,
      spendingPlan: row.spendingPlan as Record<string, unknown> | null,
      locationText: row.locationText,
      countryId: row.countryId,
      stateId: row.stateId,
      cityId: row.cityId,
      subDistrictId: row.subDistrictId,
      bdAddressMode: row.bdAddressMode,
      bdDivisionId: row.bdDivisionId,
      bdDistrictId: row.bdDistrictId,
      bdCityCorporationId: row.bdCityCorporationId,
      bdZoneId: row.bdZoneId,
      bdWardId: row.bdWardId,
      bdUpazilaId: row.bdUpazilaId,
      bdUnionId: row.bdUnionId,
      bdAreaId: row.bdAreaId,
      mediaIds: (row.media ?? []).map((media) => media.mediaId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      stats: {
        raisedAmountMinor: row.raisedAmountMinor,
        withdrawnAmountMinor: row.withdrawnAmountMinor,
        donorsCount: row.donorsCount,
      },
    };
  }

  private draftRecordFromDb(
    row: FundraisingCampaignDraftDbRecord & {
      campaign?:
        (FundraisingCampaignDbRecord & { media?: FundraisingCampaignMediaDbRecord[] }) | null;
    },
  ): CampaignDraftRecord {
    return {
      id: row.id,
      publicId: row.publicId,
      ownerUserId: row.ownerUserId,
      status: row.status as CampaignDraftRecord['status'],
      title: row.title,
      caption: row.caption,
      category: row.category,
      fundingMode: row.fundingMode as FundraisingFundingMode,
      currencyCode: row.currencyCode,
      targetAmountMinor: row.targetAmountMinor,
      monthlyGoalMinor: row.monthlyGoalMinor,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      deadline: row.deadline,
      nextReviewAt: row.nextReviewAt,
      beneficiaryType: row.beneficiaryType,
      beneficiaryName: row.beneficiaryName,
      petId: row.petId,
      urgency: row.urgency,
      treatmentProvider: row.treatmentProvider,
      estimatedExpenseMinor: row.estimatedExpenseMinor,
      spendingPlan: row.spendingPlan as Record<string, unknown> | null,
      locationText: row.locationText,
      countryId: row.countryId,
      stateId: row.stateId,
      cityId: row.cityId,
      subDistrictId: row.subDistrictId,
      bdAddressMode: row.bdAddressMode,
      bdDivisionId: row.bdDivisionId,
      bdDistrictId: row.bdDistrictId,
      bdCityCorporationId: row.bdCityCorporationId,
      bdZoneId: row.bdZoneId,
      bdWardId: row.bdWardId,
      bdUpazilaId: row.bdUpazilaId,
      bdUnionId: row.bdUnionId,
      bdAreaId: row.bdAreaId,
      mediaIds: [...row.mediaIds],
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private campaignUpdateRecordFromDb(row: CampaignUpdateDbRecord): CampaignUpdateRecord {
    return {
      id: row.id,
      publicId: row.publicId,
      postId: row.id,
      campaignId: row.campaignId,
      authorId: row.authorUserId,
      title: row.title,
      caption: row.caption,
      mediaIds: [...row.mediaIds],
      status: row.status as CampaignUpdateRecord['status'],
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }

  private syncCampaignCacheFromSnapshot(state: StoreState, campaign: CampaignRecord): void {
    state.campaigns.set(campaign.id, campaign);
    state.nextCampaignId = Math.max(state.nextCampaignId, campaign.id + 1);
    state.nextPostId = Math.max(state.nextPostId, campaign.postId + 1);
  }

  /**
   * Creates a brand-new campaign row without pinning the in-memory
   * `nextCampaignId` counter's (potentially stale, post-restart) value as
   * the primary key — Postgres autoincrement assigns it. `campaign.id` is
   * updated in place to the real persisted id before any dependent write
   * (media bindings, idempotency record) references it. Callers must only
   * use this for a campaign confirmed not to already exist (draft-scoped
   * uniqueness is enforced by `draftId @unique` regardless).
   */
  private async createCampaignRow(
    tx: PrismaClient | Prisma.TransactionClient,
    campaign: CampaignRecord,
  ): Promise<void> {
    const persisted = await tx.fundraisingCampaign.create({
      data: this.campaignRowData(campaign),
    });
    campaign.id = persisted.id;
  }

  private syncDraftCacheFromSnapshot(state: StoreState, draft: CampaignDraftRecord): void {
    state.drafts.set(draft.id, draft);
    state.nextDraftId = Math.max(state.nextDraftId, draft.id + 1);
  }

  /**
   * Creates a brand-new draft row without pinning the in-memory
   * `nextDraftId` counter's (potentially stale, post-restart) value as the
   * primary key — Postgres autoincrement assigns it. The in-memory record
   * (and its `state.drafts` map key) is re-keyed to the real persisted id
   * before anything else references it, so the numeric id returned to the
   * client always matches the actual row.
   */
  private async createDraftRow(
    tx: PrismaClient | Prisma.TransactionClient,
    state: StoreState,
    draft: CampaignDraftRecord,
  ): Promise<void> {
    const persisted = await tx.fundraisingCampaignDraft.create({
      data: this.draftRowData(draft),
    });
    if (persisted.id !== draft.id) {
      state.drafts.delete(draft.id);
      draft.id = persisted.id;
    }
    state.drafts.set(draft.id, draft);
    state.nextDraftId = Math.max(state.nextDraftId, draft.id + 1);
  }

  private syncUpdateCacheFromSnapshot(state: StoreState, update: CampaignUpdateRecord): void {
    state.updates.set(update.id, update);
    state.nextUpdateId = Math.max(state.nextUpdateId, update.id + 1);
    state.nextPostId = Math.max(state.nextPostId, update.postId + 1);
  }

  private async mustOwnDraftRecord(userId: number, draftId: string): Promise<CampaignDraftRecord> {
    const parsed = parseNumber(draftId);
    if (parsed === null)
      throw new FundraisingContractError('VALIDATION', 'Invalid draft identifier', 422);
    const draft = await this.loadDraftRecord(parsed);
    if (!draft) throw new FundraisingContractError('NOT_FOUND', 'Draft not found', 404);
    if (draft.ownerUserId !== userId)
      throw new FundraisingContractError('FORBIDDEN', 'Draft not found', 403);
    return draft;
  }

  private async mustGetCampaignRecord(campaignId: number): Promise<CampaignRecord> {
    const campaign = await this.loadCampaignRecord(campaignId);
    if (!campaign) throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
    return campaign;
  }

  private async mustOwnCampaignRecord(userId: number, campaignId: number): Promise<CampaignRecord> {
    const campaign = await this.mustGetCampaignRecord(campaignId);
    if (campaign.ownerUserId !== userId && !this.hasManageAnyAccess(userId)) {
      throw new FundraisingContractError('EDIT_FORBIDDEN', 'Campaign not found', 403);
    }
    return campaign;
  }

  private async mustOwnUpdateRecord(
    userId: number,
    updateId: number,
  ): Promise<CampaignUpdateRecord> {
    const update = await this.loadUpdateRecord(updateId);
    if (!update || update.deletedAt !== null)
      throw new FundraisingContractError('NOT_FOUND', 'Update not found', 404);
    const campaign = await this.mustGetCampaignRecord(update.campaignId);
    if (campaign.ownerUserId !== userId && !this.hasManageAnyAccess(userId)) {
      throw new FundraisingContractError('FORBIDDEN', 'Update not found', 403);
    }
    this.ensureCampaignEditable(campaign);
    return update;
  }

  private accountRecordFromInput(
    base: FundraisingAccountRecord,
    userId: number,
    input: Record<string, unknown>,
  ): FundraisingAccountRecord {
    const account = { ...base, documents: [...base.documents] };
    account.ownerUserId = userId;
    account.accountType = normalizeAccountType(input.accountType) ?? account.accountType;
    account.presentAddress = normalizeText(input.presentAddress) ?? account.presentAddress;
    account.permanentAddress = normalizeText(input.permanentAddress) ?? account.permanentAddress;
    account.occupation = normalizeText(input.occupation) ?? account.occupation;
    account.verificationDraftJson =
      this.extractObject(input.verificationDraftJson) ?? account.verificationDraftJson;
    account.area = normalizeText(input.area) ?? account.area;
    account.divisionId = parseNumber(input.divisionId) ?? account.divisionId;
    account.districtId = parseNumber(input.districtId) ?? account.districtId;
    account.upazilaId = parseNumber(input.upazilaId) ?? account.upazilaId;
    account.unionId = parseNumber(input.unionId) ?? account.unionId;
    account.countryCode = normalizeText(input.countryCode) ?? account.countryCode;
    account.countryName = normalizeText(input.countryName) ?? account.countryName;
    account.stateName = normalizeText(input.stateName) ?? account.stateName;
    account.cityName = normalizeText(input.cityName) ?? account.cityName;
    account.addressLine = normalizeText(input.addressLine) ?? account.addressLine;
    account.latitude = parseNumber(input.latitude) ?? account.latitude;
    account.longitude = parseNumber(input.longitude) ?? account.longitude;
    account.formattedAddress = normalizeText(input.formattedAddress) ?? account.formattedAddress;
    account.fullName = normalizeText(input.fullName) ?? account.fullName;
    account.dateOfBirth = normalizeDateOnly(input.dateOfBirth) ?? account.dateOfBirth;
    account.primaryDocumentType =
      normalizeText(input.primaryDocumentType) ?? account.primaryDocumentType;
    account.nationalIdNumber = normalizeText(input.nationalIdNumber) ?? account.nationalIdNumber;
    account.birthRegNumber = normalizeText(input.birthRegNumber) ?? account.birthRegNumber;
    account.passportNumber = normalizeText(input.passportNumber) ?? account.passportNumber;
    account.studentIdNumber = normalizeText(input.studentIdNumber) ?? account.studentIdNumber;
    account.drivingLicenceNumber =
      normalizeText(input.drivingLicenceNumber) ?? account.drivingLicenceNumber;
    account.rejectionReason = normalizeText(input.rejectionReason) ?? account.rejectionReason;
    account.submittedAt = parseDate(input.submittedAt) ?? account.submittedAt;
    account.reviewedAt = parseDate(input.reviewedAt) ?? account.reviewedAt;
    account.reviewedByUserId = parseNumber(input.reviewedByUserId) ?? account.reviewedByUserId;
    account.isInternational = Boolean(input.isInternational ?? account.isInternational);
    const hasBangladeshLocationInput =
      input.divisionId !== undefined ||
      input.districtId !== undefined ||
      input.upazilaId !== undefined ||
      input.unionId !== undefined;
    const hasInternationalLocationInput =
      input.countryCode !== undefined ||
      input.countryName !== undefined ||
      input.stateName !== undefined ||
      input.cityName !== undefined ||
      input.addressLine !== undefined ||
      input.formattedAddress !== undefined;
    if (input.isInternational === true) {
      account.divisionId = null;
      account.districtId = null;
      account.upazilaId = null;
      account.unionId = null;
    } else if (hasBangladeshLocationInput) {
      account.countryCode = null;
      account.countryName = null;
      account.stateName = null;
      account.cityName = null;
      account.addressLine = null;
      account.formattedAddress = null;
      account.isInternational = false;
    } else if (hasInternationalLocationInput) {
      account.divisionId = null;
      account.districtId = null;
      account.upazilaId = null;
      account.unionId = null;
      account.isInternational = true;
    }
    return account;
  }

  private accountRecordFromDb(
    row: FundraisingVerificationAccountDbRecord,
  ): FundraisingAccountRecord {
    const documents = (row.documents ?? []).map((document) => ({
      id: document.id,
      accountId: document.accountId,
      mediaId: document.mediaId,
      title: document.title,
      media: this.mustGetMedia(document.mediaId),
      createdAt: document.createdAt,
      deletedAt: document.deletedAt,
      documentType:
        document.documentType === 'PRIMARY' ? ('PRIMARY' as const) : ('SUPPORTING' as const),
    }));
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      status: row.status as FundraisingAccountStatus,
      accountType: normalizeAccountType(row.accountType) ?? null,
      fullName: row.fullName,
      dateOfBirth: row.dateOfBirth ? this.decryptKycValue(row.dateOfBirth) : null,
      presentAddress: row.presentAddress ? this.decryptKycValue(row.presentAddress) : null,
      permanentAddress: row.permanentAddress ? this.decryptKycValue(row.permanentAddress) : null,
      occupation: row.occupation,
      isInternational: row.isInternational,
      divisionId: row.divisionId,
      districtId: row.districtId,
      upazilaId: row.upazilaId,
      unionId: row.unionId,
      areaId: row.areaId,
      verificationDraftJson: row.verificationDraftJson as Record<string, unknown> | null,
      area: row.area,
      countryCode: row.countryCode,
      countryName: row.countryName,
      stateName: row.stateName,
      cityName: row.cityName,
      addressLine: row.addressLine ? this.decryptKycValue(row.addressLine) : null,
      latitude: row.latitude === null ? null : Number(row.latitude.toString()),
      longitude: row.longitude === null ? null : Number(row.longitude.toString()),
      formattedAddress: row.formattedAddress,
      primaryDocumentType: row.primaryDocumentType,
      nationalIdNumber: row.nationalIdNumber ? this.decryptKycValue(row.nationalIdNumber) : null,
      birthRegNumber: row.birthRegNumber ? this.decryptKycValue(row.birthRegNumber) : null,
      passportNumber: row.passportNumber ? this.decryptKycValue(row.passportNumber) : null,
      studentIdNumber: row.studentIdNumber ? this.decryptKycValue(row.studentIdNumber) : null,
      drivingLicenceNumber: row.drivingLicenceNumber
        ? this.decryptKycValue(row.drivingLicenceNumber)
        : null,
      rejectionReason: row.rejectionReason,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      reviewedByUserId: row.reviewedByUserId,
      version: row.version,
      documents,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private verificationAccountCreateData(
    account: FundraisingAccountRecord,
  ): Prisma.FundraisingVerificationAccountUncheckedCreateInput {
    return {
      ownerUserId: account.ownerUserId,
      status: account.status,
      accountType: account.accountType,
      fullName: account.fullName ?? null,
      dateOfBirth: this.encryptKycValue(account.dateOfBirth),
      presentAddress: this.encryptKycValue(account.presentAddress),
      permanentAddress: this.encryptKycValue(account.permanentAddress),
      occupation: account.occupation,
      isInternational: account.isInternational,
      divisionId: account.divisionId,
      districtId: account.districtId,
      upazilaId: account.upazilaId,
      unionId: account.unionId,
      areaId: account.areaId,
      area: account.area,
      countryCode: account.countryCode,
      countryName: account.countryName,
      stateName: account.stateName,
      cityName: account.cityName,
      addressLine: this.encryptKycValue(account.addressLine),
      latitude: account.latitude === null ? null : new Prisma.Decimal(account.latitude),
      longitude: account.longitude === null ? null : new Prisma.Decimal(account.longitude),
      formattedAddress: account.formattedAddress,
      primaryDocumentType: account.primaryDocumentType,
      nationalIdNumber: this.encryptKycValue(account.nationalIdNumber),
      birthRegNumber: this.encryptKycValue(account.birthRegNumber),
      passportNumber: this.encryptKycValue(account.passportNumber),
      studentIdNumber: this.encryptKycValue(account.studentIdNumber),
      drivingLicenceNumber: this.encryptKycValue(account.drivingLicenceNumber),
      ...(account.verificationDraftJson === null
        ? {}
        : { verificationDraftJson: account.verificationDraftJson as Prisma.InputJsonValue }),
      rejectionReason: account.rejectionReason,
      submittedAt: account.submittedAt,
      reviewedAt: null,
      reviewedByUserId: null,
      version: 0,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private verificationAccountUpdateData(
    account: FundraisingAccountRecord,
  ): Prisma.FundraisingVerificationAccountUncheckedUpdateInput {
    return {
      status: account.status,
      accountType: account.accountType,
      fullName: account.fullName ?? null,
      dateOfBirth: this.encryptKycValue(account.dateOfBirth),
      presentAddress: this.encryptKycValue(account.presentAddress),
      permanentAddress: this.encryptKycValue(account.permanentAddress),
      occupation: account.occupation,
      isInternational: account.isInternational,
      divisionId: account.divisionId,
      districtId: account.districtId,
      upazilaId: account.upazilaId,
      unionId: account.unionId,
      areaId: account.areaId,
      area: account.area,
      countryCode: account.countryCode,
      countryName: account.countryName,
      stateName: account.stateName,
      cityName: account.cityName,
      addressLine: this.encryptKycValue(account.addressLine),
      latitude: account.latitude === null ? null : new Prisma.Decimal(account.latitude),
      longitude: account.longitude === null ? null : new Prisma.Decimal(account.longitude),
      formattedAddress: account.formattedAddress,
      primaryDocumentType: account.primaryDocumentType,
      nationalIdNumber: this.encryptKycValue(account.nationalIdNumber),
      birthRegNumber: this.encryptKycValue(account.birthRegNumber),
      passportNumber: this.encryptKycValue(account.passportNumber),
      studentIdNumber: this.encryptKycValue(account.studentIdNumber),
      drivingLicenceNumber: this.encryptKycValue(account.drivingLicenceNumber),
      ...(account.verificationDraftJson === null
        ? {}
        : { verificationDraftJson: account.verificationDraftJson as Prisma.InputJsonValue }),
      rejectionReason: account.rejectionReason,
      submittedAt: account.submittedAt,
      reviewedAt: account.reviewedAt,
      reviewedByUserId: account.reviewedByUserId,
      version: { increment: 1 },
      updatedAt: account.updatedAt,
    };
  }

  private encryptKycValue(value: string | null): string | null {
    return value === null ? null : encryptKycField(value);
  }

  private decryptKycValue(value: string): string {
    return looksLikeKycEnvelope(value) ? decryptKycField(value) : value;
  }

  private syncAccountCacheFromSnapshot(state: StoreState, account: FundraisingAccountRecord): void {
    state.accounts.set(account.ownerUserId, account);
    for (const document of account.documents) {
      state.nextDocumentId = Math.max(state.nextDocumentId, document.id + 1);
    }
  }

  private async upsertCampaignRow(
    tx: PrismaClient | Prisma.TransactionClient,
    campaign: CampaignRecord,
  ): Promise<void> {
    await tx.fundraisingCampaign.upsert({
      where: { id: campaign.id },
      create: this.campaignRowData(campaign),
      update: this.campaignRowData(campaign) as Prisma.FundraisingCampaignUncheckedUpdateInput,
    });
  }

  private campaignRowData(
    campaign: CampaignRecord,
  ): Prisma.FundraisingCampaignUncheckedCreateInput {
    return {
      publicId: campaign.publicId,
      ownerUserId: campaign.ownerUserId,
      draftId: campaign.draftId,
      title: campaign.title,
      caption: campaign.caption,
      category: campaign.category,
      fundingMode: campaign.fundingMode,
      currencyCode: campaign.currencyCode,
      targetAmountMinor: campaign.targetAmountMinor,
      monthlyGoalMinor: campaign.monthlyGoalMinor,
      raisedAmountMinor: campaign.stats.raisedAmountMinor,
      withdrawnAmountMinor: campaign.stats.withdrawnAmountMinor,
      donorsCount: campaign.stats.donorsCount,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      deadline: campaign.deadline,
      nextReviewAt: campaign.nextReviewAt,
      publishedAt: campaign.publishedAt,
      status: campaign.status,
      reviewedAt: null,
      reviewedByUserId: null,
      rejectionReason: null,
      cancelledAt: null,
      archivedAt: null,
      completedAt: null,
      beneficiaryType: campaign.beneficiaryType,
      beneficiaryName: campaign.beneficiaryName,
      petId: campaign.petId,
      urgency: campaign.urgency,
      treatmentProvider: campaign.treatmentProvider,
      estimatedExpenseMinor: campaign.estimatedExpenseMinor,
      spendingPlan: campaign.spendingPlan,
      locationText: campaign.locationText,
      countryId: campaign.countryId,
      stateId: campaign.stateId,
      cityId: campaign.cityId,
      subDistrictId: campaign.subDistrictId,
      bdAddressMode: campaign.bdAddressMode,
      bdDivisionId: campaign.bdDivisionId,
      bdDistrictId: campaign.bdDistrictId,
      bdCityCorporationId: campaign.bdCityCorporationId,
      bdZoneId: campaign.bdZoneId,
      bdWardId: campaign.bdWardId,
      bdUpazilaId: campaign.bdUpazilaId,
      bdUnionId: campaign.bdUnionId,
      bdAreaId: campaign.bdAreaId,
      version: 0,
      deletedAt: campaign.deletedAt,
    } as Prisma.FundraisingCampaignUncheckedCreateInput;
  }

  private draftRowData(
    campaign: CampaignDraftRecord,
  ): Prisma.FundraisingCampaignDraftUncheckedCreateInput {
    return {
      publicId: campaign.publicId,
      ownerUserId: campaign.ownerUserId,
      status: campaign.status,
      title: campaign.title,
      caption: campaign.caption,
      category: campaign.category,
      fundingMode: campaign.fundingMode,
      currencyCode: campaign.currencyCode,
      targetAmountMinor: campaign.targetAmountMinor,
      monthlyGoalMinor: campaign.monthlyGoalMinor,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      deadline: campaign.deadline,
      nextReviewAt: campaign.nextReviewAt,
      beneficiaryType: campaign.beneficiaryType,
      beneficiaryName: campaign.beneficiaryName,
      petId: campaign.petId,
      urgency: campaign.urgency,
      treatmentProvider: campaign.treatmentProvider,
      estimatedExpenseMinor: campaign.estimatedExpenseMinor,
      ...(campaign.spendingPlan === null
        ? {}
        : { spendingPlan: campaign.spendingPlan as Prisma.InputJsonValue }),
      locationText: campaign.locationText,
      countryId: campaign.countryId,
      stateId: campaign.stateId,
      cityId: campaign.cityId,
      subDistrictId: campaign.subDistrictId,
      bdAddressMode: campaign.bdAddressMode,
      bdDivisionId: campaign.bdDivisionId,
      bdDistrictId: campaign.bdDistrictId,
      bdCityCorporationId: campaign.bdCityCorporationId,
      bdZoneId: campaign.bdZoneId,
      bdWardId: campaign.bdWardId,
      bdUpazilaId: campaign.bdUpazilaId,
      bdUnionId: campaign.bdUnionId,
      bdAreaId: campaign.bdAreaId,
      mediaIds: [...campaign.mediaIds],
      submittedAt: campaign.submittedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    } as Prisma.FundraisingCampaignDraftUncheckedCreateInput;
  }

  private async persistCampaignMedia(
    tx: PrismaClient | Prisma.TransactionClient,
    campaign: CampaignRecord,
  ): Promise<void> {
    await tx.fundraisingCampaignMedia.deleteMany({
      where: { campaignId: campaign.id },
    });
    if (campaign.mediaIds.length > 0) {
      await tx.fundraisingCampaignMedia.createMany({
        data: campaign.mediaIds.map((mediaId, position) => ({
          campaignId: campaign.id,
          mediaId,
          position,
        })),
      });
    }
  }

  private canConfirmDonationForCampaign(
    campaign: FundraisingCampaignDbRecord | CampaignRecord,
  ): boolean {
    if ('deletedAt' in campaign && campaign.deletedAt !== null) return false;
    const raised =
      'raisedAmountMinor' in campaign
        ? campaign.raisedAmountMinor
        : campaign.stats.raisedAmountMinor;
    return isDonationAllowed(
      {
        status: campaign.status,
        endsAt: campaign.endsAt,
        deadline: campaign.deadline,
        targetAmountMinor: campaign.targetAmountMinor,
        raisedAmountMinor: raised,
      },
      this.now(),
    );
  }

  private async tryTransitionDonation(
    tx: Prisma.TransactionClient,
    donationId: number,
    nextStatus: FundraisingDonationStatus,
  ): Promise<DonationDbRecord | null> {
    const current = await tx.fundraisingDonation.findUnique({ where: { id: donationId } });
    if (!current) throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    const currentStatus = normalizeDonationStatus(current.status);
    if (currentStatus === nextStatus) return current as DonationDbRecord;
    const terminal = new Set<FundraisingDonationStatus>([
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'ON_HOLD_REVIEW',
    ]);
    if (terminal.has(currentStatus) && terminal.has(nextStatus) && currentStatus !== nextStatus) {
      throw new FundraisingContractError('INVALID_TRANSITION', 'Donation already finalized', 409);
    }
    if (currentStatus === 'PENDING' && nextStatus === 'PROCESSING') {
      return (await tx.fundraisingDonation.update({
        where: { id: donationId },
        data: { status: nextStatus, updatedAt: this.now() },
      })) as DonationDbRecord;
    }
    if (currentStatus === 'PENDING' && terminal.has(nextStatus)) {
      return (await tx.fundraisingDonation.update({
        where: { id: donationId },
        data: {
          status: nextStatus,
          finalizedAt: this.now(),
          updatedAt: this.now(),
        },
      })) as DonationDbRecord;
    }
    if (currentStatus === 'PROCESSING' && terminal.has(nextStatus)) {
      return (await tx.fundraisingDonation.update({
        where: { id: donationId },
        data: {
          status: nextStatus,
          finalizedAt: this.now(),
          updatedAt: this.now(),
        },
      })) as DonationDbRecord;
    }
    if (currentStatus === 'ON_HOLD_REVIEW' && nextStatus === 'SUCCEEDED') {
      return (await tx.fundraisingDonation.update({
        where: { id: donationId },
        data: {
          status: nextStatus,
          finalizedAt: this.now(),
          updatedAt: this.now(),
        },
      })) as DonationDbRecord;
    }
    if (currentStatus === 'EXPIRED' && nextStatus === 'EXPIRED') {
      return current as DonationDbRecord;
    }
    throw new FundraisingContractError(
      'INVALID_TRANSITION',
      'Invalid donation status transition',
      409,
    );
  }

  private handleWebhookFallbackMemory(
    input: WebhookInput,
    rawPayload: string,
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const eventKey = `${input.provider}:${input.eventId}`;
      const existing = state.webhooks.get(eventKey);
      if (existing && existing.outcome === 'PROCESSED') {
        const intent = this.mustGetIntentRecord(
          state,
          this.mustFindIntentIdByReference(state, input.referenceId),
        );
        return {
          duplicate: true,
          status: intent.status,
          donationIntent: this.donationIntentPayload(intent),
          receipt: this.receiptsForIntent(intent.id),
        };
      }

      const intentId = this.mustFindIntentIdByReference(state, input.referenceId);
      const intent = this.mustGetIntentRecord(state, intentId);
      const webhook: WebhookRecord = existing ?? {
        id: state.nextWebhookId++,
        provider: input.provider,
        eventId: input.eventId,
        referenceId: input.referenceId,
        signature: input.signature,
        processedAt: null,
        payloadHash: hashText(rawPayload),
        outcome: 'RECEIVED',
      };
      state.webhooks.set(eventKey, webhook);

      const nextStatus = normalizeDonationStatus(input.status);
      if (intent.finalizedAt && intent.status === nextStatus) {
        webhook.processedAt = this.now();
        webhook.outcome = 'PROCESSED';
        return {
          duplicate: true,
          status: intent.status,
          donationIntent: this.donationIntentPayload(intent),
          receipt: this.receiptsForIntent(intent.id),
        };
      }
      this.transitionDonationIntent(state, intent, nextStatus);
      webhook.processedAt = this.now();
      webhook.outcome = 'PROCESSED';
      const payment = state.donationAttempts.get(intent.paymentAttemptId);
      if (payment) {
        payment.status = intent.status;
        payment.providerPaymentId =
          normalizeText(input.providerPaymentId) ?? payment.providerPaymentId;
        payment.updatedAt = this.now();
      }
      if (intent.status === 'SUCCEEDED' && !this.receiptsForIntent(intent.id)) {
        this.finalizeSuccessfulDonation(state, intent);
      }
      return {
        duplicate: false,
        status: intent.status,
        donationIntent: this.donationIntentPayload(intent),
        receipt: this.receiptsForIntent(intent.id),
      };
    });
  }

  private donationIntentFromDb(
    row: DonationDbRecord,
    campaignTitle: string,
    paymentAttemptId = 0,
  ): DonationIntentRecord {
    return {
      id: row.id,
      publicId: row.publicId,
      referenceId: row.referenceId,
      status: normalizeDonationStatus(row.status),
      donorUserId: row.donorUserId,
      campaignId: row.campaignId,
      campaignTitle,
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      isAnonymous: row.isAnonymous,
      supportMessage: row.supportMessage,
      paymentMethodLabel: row.paymentMethodLabel,
      consentAccepted: row.consentAccepted,
      expiresAt: row.expiresAt,
      finalizedAt: row.finalizedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      idempotencyKey: row.idempotencyKey,
      paymentAttemptId,
    };
  }

  private paymentAttemptPayloadFromDb(
    row: DonationPaymentAttemptDbRecord,
  ): DonationPaymentAttemptRecord {
    const providerMetadata =
      row.providerMetadata && typeof row.providerMetadata === 'object'
        ? (row.providerMetadata as Record<string, unknown>)
        : null;
    const requestFingerprint =
      providerMetadata && typeof providerMetadata.requestFingerprint === 'string'
        ? providerMetadata.requestFingerprint
        : '';
    return {
      id: row.id,
      attemptId: row.attemptId,
      intentId: row.donationId,
      provider: row.provider,
      providerPaymentId: row.providerPaymentId,
      redirectUrl: row.redirectUrl,
      logId: row.logId,
      status: normalizeDonationStatus(row.status),
      requestFingerprint,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private receiptPayloadFromDb(row: DonationReceiptDbRecord): DonationReceiptRecord {
    return {
      id: row.id,
      intentId: row.donationId,
      receiptNumber: row.receiptNumber,
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      issuedAt: row.issuedAt,
    };
  }

  private receiptPayload(receipt: DonationReceiptRecord): Record<string, unknown> {
    return {
      id: receipt.id,
      intentId: receipt.intentId,
      receiptNumber: receipt.receiptNumber,
      amountMinor: receipt.amountMinor,
      currencyCode: receipt.currencyCode,
      issuedAt: receipt.issuedAt,
    };
  }

  private donationSnapshotFromDb(
    row: DonationDbRecord,
    campaignTitle: string,
    payment: DonationPaymentAttemptRecord | null,
    receipt: DonationReceiptRecord | null,
  ): DonationLedgerSnapshot {
    return {
      donation: this.donationIntentFromDb(row, campaignTitle, payment?.id ?? 0),
      payment,
      receipt,
    };
  }

  private syncDonationCacheFromSnapshot(
    state: StoreState,
    intent: DonationIntentRecord,
    payment: DonationPaymentAttemptRecord | null,
    receipt: DonationReceiptRecord | null,
  ): void {
    const existing = state.donationIntents.get(intent.id);
    state.donationIntents.set(intent.id, intent);
    if (payment) {
      state.donationAttempts.set(payment.id, { ...payment });
      intent.paymentAttemptId = payment.id;
    }
    if (receipt) {
      state.receipts.set(receipt.id, receipt);
    }
    state.donationIdempotencyKeys.set(
      this.donationKey(intent.donorUserId, intent.campaignId, intent.idempotencyKey),
      intent.id,
    );
    if (intent.status === 'SUCCEEDED' && existing?.status !== 'SUCCEEDED') {
      const campaign = state.campaigns.get(intent.campaignId);
      if (campaign) {
        campaign.stats.raisedAmountMinor += intent.amountMinor;
        campaign.stats.donorsCount += 1;
        if (
          campaign.targetAmountMinor &&
          campaign.stats.raisedAmountMinor >= campaign.targetAmountMinor
        ) {
          campaign.status = 'FUNDED';
        }
        campaign.updatedAt = this.now();
      }
    }
    if (payment) {
      const storedPayment = state.donationAttempts.get(payment.id);
      if (storedPayment) {
        storedPayment.status = intent.status;
        storedPayment.providerPaymentId = payment.providerPaymentId;
        storedPayment.redirectUrl = payment.redirectUrl;
        storedPayment.logId = payment.logId;
        storedPayment.updatedAt = payment.updatedAt;
      }
    }
  }

  private donationAttemptPayload(snapshot: DonationLedgerSnapshot): Record<string, unknown> {
    return {
      attemptId: snapshot.payment?.attemptId ?? snapshot.donation.publicId,
      campaignId: snapshot.donation.campaignId,
      campaignTitle: snapshot.donation.campaignTitle,
      amountMinor: snapshot.donation.amountMinor,
      currencyCode: snapshot.donation.currencyCode,
      isAnonymous: snapshot.donation.isAnonymous,
      supportMessage: snapshot.donation.supportMessage,
      paymentMethodLabel: snapshot.donation.paymentMethodLabel,
      status: snapshot.donation.status,
      consentAccepted: snapshot.donation.consentAccepted,
      createdAt: snapshot.donation.createdAt,
      updatedAt: snapshot.donation.updatedAt,
      intentId: snapshot.donation.id,
      intentPublicId: snapshot.donation.publicId,
      referenceId: snapshot.donation.referenceId,
      provider: snapshot.payment?.provider ?? 'wpa',
      expiresAt: snapshot.donation.expiresAt,
      confirmedAt: snapshot.donation.finalizedAt,
      payment: snapshot.payment ? this.publicPaymentPayload(snapshot.payment) : null,
      receipt: snapshot.receipt,
    };
  }

  private sanitizeProviderMetadata(value: unknown): Prisma.JsonValue | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (Array.isArray(value)) {
      const items = value
        .map((item) => this.sanitizeProviderMetadata(item))
        .filter((item): item is Prisma.JsonValue => item !== null);
      return items;
    }
    if (typeof value === 'object') {
      const input = value as Record<string, unknown>;
      const output: Record<string, Prisma.JsonValue> = {};
      for (const [key, child] of Object.entries(input)) {
        if (this.shouldDropProviderMetadataKey(key)) continue;
        const sanitized = this.sanitizeProviderMetadata(child);
        if (sanitized !== null) {
          output[key] = sanitized;
        }
      }
      return Object.keys(output).length > 0 ? output : null;
    }
    return null;
  }

  private shouldDropProviderMetadataKey(key: string): boolean {
    const normalized = key.trim().toLowerCase();
    return [
      'secret',
      'token',
      'password',
      'credential',
      'auth',
      'signature',
      'private',
      'kyc',
      'nid',
      'passport',
      'birthreg',
      'driving',
      'licence',
      'license',
      'url',
      'uri',
      'redirect',
      'callback',
      'raw',
      'payload',
      'cvv',
      'pin',
      'otp',
      'bank',
      'card',
      'account',
    ].some((needle) => normalized.includes(needle));
  }

  transaction<T>(work: (state: StoreState) => T): T {
    const previous = this.state;
    const snapshot = structuredClone(previous);
    try {
      this.state = snapshot;
      const result = work(snapshot);
      this.state = snapshot;
      return result;
    } catch (error) {
      this.state = previous;
      throw error;
    }
  }

  private createSeedState(): StoreState {
    const now = this.now();
    const state: StoreState = {
      nextAccountId: 1,
      nextDocumentId: 1,
      nextDraftId: 1,
      nextCampaignId: 1,
      nextPostId: 1,
      nextUpdateId: 1,
      nextIntentId: 1,
      nextAttemptId: 1,
      nextReceiptId: 1,
      nextWebhookId: 1,
      accounts: new Map(),
      drafts: new Map(),
      campaigns: new Map(),
      updates: new Map(),
      donationIntents: new Map(),
      donationAttempts: new Map(),
      receipts: new Map(),
      webhooks: new Map(),
      draftIdempotencyKeys: new Map(),
      donationIdempotencyKeys: new Map(),
    };

    const mediaId = this.findSeedMediaId(1);
    const account = this.ensureAccountRecord(state, 1);
    account.status = 'VERIFIED';
    account.fullName = 'Amina Rahman';
    account.dateOfBirth = '1995-01-01';
    account.presentAddress = 'Dhaka';
    account.permanentAddress = 'Dhaka';
    account.occupation = 'Volunteer';
    account.area = 'Dhaka';
    account.primaryDocumentType = 'NID';
    account.nationalIdNumber = 'SEED-NID-0001';
    account.birthRegNumber = null;
    account.passportNumber = null;
    account.studentIdNumber = null;
    account.drivingLicenceNumber = null;
    account.isInternational = false;
    account.submittedAt = now;
    account.reviewedAt = now;
    account.reviewedByUserId = 1;
    account.updatedAt = now;
    if (mediaId) {
      account.documents.push({
        id: state.nextDocumentId++,
        accountId: account.id,
        mediaId,
        media: this.mustGetMedia(mediaId),
        title: 'Verification document',
        createdAt: now,
        deletedAt: null,
        documentType: 'PRIMARY',
      });
    }

    const draft = this.createDraftRecord(state, 1, {
      title: 'Luna Surgery Support',
      caption: "Help cover Luna's emergency surgery.",
      category: 'PET_HEALTH',
      fundingMode: 'ONE_TIME',
      currencyCode: 'BDT',
      targetAmountMinor: 125000n,
      monthlyGoalMinor: null,
      startsAt: now,
      deadline: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      beneficiaryType: 'PET',
      beneficiaryName: 'Luna',
      petId: 11,
      locationText: 'Dhaka',
      mediaIds: mediaId ? [mediaId] : [],
    });
    draft.status = 'SUBMITTED';
    draft.submittedAt = now;
    const campaign = this.createCampaignFromDraft(state, draft, {
      status: 'ACTIVE',
      publishedAt: now,
    });
    campaign.stats.raisedAmountMinor = 25000n;
    campaign.stats.donorsCount = 1;

    const donation = this.createSuccessfulDonationSeed(state, campaign, 1, 25000n);
    void donation;
    return state;
  }

  private createSuccessfulDonationSeed(
    state: StoreState,
    campaign: CampaignRecord,
    donorUserId: number,
    amountMinor: bigint,
  ): DonationIntentRecord {
    const intent: DonationIntentRecord = {
      id: state.nextIntentId++,
      publicId: `intent_${randomUUID()}`,
      referenceId: `ref_seed_${campaign.id}_${state.nextIntentId}`,
      status: 'SUCCEEDED',
      donorUserId,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      amountMinor,
      currencyCode: campaign.currencyCode,
      isAnonymous: false,
      supportMessage: 'Seed donation',
      paymentMethodLabel: 'Wallet',
      consentAccepted: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      finalizedAt: this.now(),
      createdAt: this.now(),
      updatedAt: this.now(),
      idempotencyKey: 'seed',
      paymentAttemptId: state.nextAttemptId,
    };
    const payment: DonationPaymentAttemptRecord = {
      id: state.nextAttemptId++,
      attemptId: `attempt_${randomUUID()}`,
      intentId: intent.id,
      provider: 'wpa',
      providerPaymentId: `pay_${randomUUID()}`,
      redirectUrl: null,
      logId: `log_${randomUUID()}`,
      status: 'SUCCEEDED',
      requestFingerprint: 'seed',
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.donationAttempts.set(payment.id, payment);
    state.donationIntents.set(intent.id, intent);
    const receipt: DonationReceiptRecord = {
      id: state.nextReceiptId++,
      intentId: intent.id,
      receiptNumber: `rcpt_${randomUUID()}`,
      amountMinor,
      currencyCode: campaign.currencyCode,
      issuedAt: this.now(),
    };
    state.receipts.set(receipt.id, receipt);
    return intent;
  }

  private async ensureSeedAccount(): Promise<void> {
    const account = this.state.accounts.get(1);
    const draft = this.state.drafts.get(1);
    const campaign = this.state.campaigns.get(1);
    const donation = [...this.state.donationIntents.values()].find(
      (intent) => intent.idempotencyKey === 'seed' && intent.campaignId === campaign?.id,
    );
    if (!account || !draft || !campaign || !donation) {
      throw new Error('Seed fundraising state is not initialized');
    }

    await this.prisma.$transaction(async (tx) => {
      const persistedAccount = await tx.fundraisingVerificationAccount.upsert({
        where: { ownerUserId: 1 },
        create: this.verificationAccountCreateData(account),
        update: this.verificationAccountUpdateData(account),
      });
      await this.persistVerificationDocuments(tx, account, persistedAccount.id);
      await tx.fundraisingCampaignDraft.upsert({
        where: { id: draft.id },
        create: this.draftRowData(draft),
        update: this.draftRowData(draft),
      });
      await tx.fundraisingCampaign.upsert({
        where: { id: campaign.id },
        create: this.campaignRowData(campaign),
        update: this.campaignRowData(campaign) as Prisma.FundraisingCampaignUncheckedUpdateInput,
      });
      await this.persistCampaignMedia(tx, campaign);
      await tx.fundraisingDonation.upsert({
        where: {
          donorUserId_campaignId_idempotencyKey: {
            donorUserId: donation.donorUserId,
            campaignId: donation.campaignId,
            idempotencyKey: donation.idempotencyKey,
          },
        },
        create: {
          id: donation.id,
          publicId: donation.publicId,
          referenceId: donation.referenceId,
          campaignId: donation.campaignId,
          donorUserId: donation.donorUserId,
          status: donation.status,
          amountMinor: donation.amountMinor,
          currencyCode: donation.currencyCode,
          isAnonymous: donation.isAnonymous,
          supportMessage: donation.supportMessage,
          paymentMethodLabel: donation.paymentMethodLabel,
          consentAccepted: donation.consentAccepted,
          idempotencyKey: donation.idempotencyKey,
          requestFingerprint: 'seed',
          expiresAt: donation.expiresAt,
          finalizedAt: donation.finalizedAt,
        },
        update: {
          status: donation.status,
          amountMinor: donation.amountMinor,
          currencyCode: donation.currencyCode,
          finalizedAt: donation.finalizedAt,
        },
      });
      await tx.fundraisingPaymentAttempt.upsert({
        where: { attemptId: `attempt_seed_${donation.id}` },
        create: {
          attemptId: `attempt_seed_${donation.id}`,
          donationId: donation.id,
          provider: 'wpa',
          providerPaymentId: `pay_seed_${donation.id}`,
          redirectUrl: null,
          logId: `log_seed_${donation.id}`,
          status: donation.status,
        },
        update: {
          status: donation.status,
        },
      });
      await tx.fundraisingReceipt.upsert({
        where: { donationId: donation.id },
        create: {
          receiptNumber: `rcpt_seed_${donation.id}`,
          donationId: donation.id,
          amountMinor: donation.amountMinor,
          currencyCode: donation.currencyCode,
        },
        update: {
          amountMinor: donation.amountMinor,
          currencyCode: donation.currencyCode,
        },
      });

      await this.realignSeedSequences(tx);
    });
  }

  private async realignSeedSequences(tx: PrismaClient | Prisma.TransactionClient): Promise<void> {
    const tables = [
      'fundraising_verification_accounts',
      'fundraising_verification_documents',
      'fundraising_campaign_drafts',
      'fundraising_campaigns',
      'fundraising_campaign_media',
      'fundraising_campaign_updates',
      'fundraising_donations',
      'fundraising_payment_attempts',
      'fundraising_webhook_events',
      'fundraising_receipts',
      'fundraising_idempotency_keys',
    ];
    for (const table of tables) {
      await tx.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('"${table}"', 'id'),
          COALESCE((SELECT MAX("id") FROM "${table}"), 0) + 1,
          false
        )
      `);
    }
  }

  private async persistVerificationDocuments(
    tx: PrismaClient | Prisma.TransactionClient,
    account: FundraisingAccountRecord,
    accountId: number = account.id,
  ): Promise<void> {
    for (const document of account.documents) {
      const existing = await tx.fundraisingVerificationDocument.findFirst({
        where: {
          accountId,
          mediaId: document.mediaId,
        },
        orderBy: { id: 'asc' },
      });
      if (existing) {
        await tx.fundraisingVerificationDocument.update({
          where: { id: existing.id },
          data: {
            title: document.title,
            documentType: document.documentType ?? 'SUPPORTING',
            deletedAt: document.deletedAt,
          },
        });
      } else {
        await tx.fundraisingVerificationDocument.create({
          data: {
            id: document.id,
            accountId,
            mediaId: document.mediaId,
            title: document.title,
            documentType: document.documentType ?? 'SUPPORTING',
            createdAt: document.createdAt,
            deletedAt: document.deletedAt,
          },
        });
      }
    }
  }

  private findSeedMediaId(userId: number): number | null {
    const media = this.socialStore.getMedia(userId);
    return media?.id ?? null;
  }

  private ensureAccountRecord(state: StoreState, userId: number): FundraisingAccountRecord {
    const existing = state.accounts.get(userId);
    if (existing) return existing;
    const created: FundraisingAccountRecord = {
      id: state.nextAccountId++,
      ownerUserId: userId,
      status: 'DRAFT',
      accountType: null,
      fullName: null,
      dateOfBirth: null,
      presentAddress: null,
      permanentAddress: null,
      occupation: null,
      isInternational: false,
      divisionId: null,
      districtId: null,
      upazilaId: null,
      unionId: null,
      areaId: null,
      verificationDraftJson: null,
      area: null,
      countryCode: null,
      countryName: null,
      stateName: null,
      cityName: null,
      addressLine: null,
      latitude: null,
      longitude: null,
      formattedAddress: null,
      primaryDocumentType: null,
      nationalIdNumber: null,
      birthRegNumber: null,
      passportNumber: null,
      studentIdNumber: null,
      drivingLicenceNumber: null,
      rejectionReason: null,
      submittedAt: null,
      reviewedAt: null,
      reviewedByUserId: null,
      version: 0,
      documents: [],
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.accounts.set(userId, created);
    return created;
  }

  private mustGetAccountRecord(state: StoreState, userId: number): FundraisingAccountRecord {
    const account = state.accounts.get(userId);
    if (!account)
      throw new FundraisingContractError('NOT_FOUND', 'Fundraising account not found', 404);
    return account;
  }

  private createDraftRecord(
    state: StoreState,
    userId: number,
    input: FundraisingDraftInput,
  ): CampaignDraftRecord {
    const draft: CampaignDraftRecord = {
      id: state.nextDraftId++,
      publicId: `draft_${randomUUID()}`,
      ownerUserId: userId,
      status: 'DRAFT',
      title: normalizeText(input.title),
      caption: normalizeText(input.caption),
      category: normalizeText(input.category),
      fundingMode: normalizeFundingMode(input.fundingMode) ?? 'ONE_TIME',
      currencyCode: normalizeCurrency(input.currencyCode) ?? 'BDT',
      targetAmountMinor:
        input.targetAmountMinor == null
          ? null
          : parseMoneyMinor(input.targetAmountMinor, 'targetAmountMinor'),
      monthlyGoalMinor:
        input.monthlyGoalMinor == null
          ? null
          : parseMoneyMinor(input.monthlyGoalMinor, 'monthlyGoalMinor'),
      startsAt: parseDate(input.startsAt),
      endsAt: parseDate(input.endsAt),
      deadline: parseDate(input.deadline),
      nextReviewAt: parseDate(input.nextReviewAt),
      beneficiaryType: normalizeText(input.beneficiaryType),
      beneficiaryName: normalizeText(input.beneficiaryName),
      petId: parseNumber(input.petId),
      urgency: normalizeText(input.urgency),
      treatmentProvider: normalizeText(input.treatmentProvider),
      estimatedExpenseMinor:
        input.estimatedExpenseMinor == null
          ? null
          : parseMoneyMinor(input.estimatedExpenseMinor, 'estimatedExpenseMinor'),
      spendingPlan: this.extractObject(input.spendingPlan),
      locationText: normalizeText(input.locationText),
      countryId: parseNumber(input.countryId),
      stateId: parseNumber(input.stateId),
      cityId: parseNumber(input.cityId),
      subDistrictId: parseNumber(input.subDistrictId),
      bdAddressMode: normalizeText(input.bdAddressMode),
      bdDivisionId: parseNumber(input.bdDivisionId),
      bdDistrictId: parseNumber(input.bdDistrictId),
      bdCityCorporationId: parseNumber(input.bdCityCorporationId),
      bdZoneId: parseNumber(input.bdZoneId),
      bdWardId: parseNumber(input.bdWardId),
      bdUpazilaId: parseNumber(input.bdUpazilaId),
      bdUnionId: parseNumber(input.bdUnionId),
      bdAreaId: parseNumber(input.bdAreaId),
      mediaIds: Array.isArray(input.mediaIds)
        ? input.mediaIds
            .map((value) => parseNumber(value))
            .filter((value): value is number => value !== null)
        : [],
      submittedAt: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.drafts.set(draft.id, draft);
    return draft;
  }

  private mustGetDraftRecord(state: StoreState, draftId: number): CampaignDraftRecord {
    const draft = state.drafts.get(draftId);
    if (!draft) throw new FundraisingContractError('NOT_FOUND', 'Draft not found', 404);
    return draft;
  }

  private mustOwnDraft(state: StoreState, userId: number, draftId: string): CampaignDraftRecord {
    const parsed = parseNumber(draftId);
    if (parsed === null)
      throw new FundraisingContractError('VALIDATION', 'Invalid draft identifier', 422);
    const draft = this.mustGetDraftRecord(state, parsed);
    if (draft.ownerUserId !== userId)
      throw new FundraisingContractError('FORBIDDEN', 'Draft not found', 403);
    return draft;
  }

  private createCampaignFromDraft(
    state: StoreState,
    draft: CampaignDraftRecord,
    overrides: { status: FundraisingCampaignStatus; publishedAt: Date | null },
  ): CampaignRecord {
    const campaign: CampaignRecord = {
      id: state.nextCampaignId++,
      publicId: `campaign_${randomUUID()}`,
      ownerUserId: draft.ownerUserId,
      draftId: draft.id,
      postId: state.nextPostId++,
      title: draft.title ?? 'Campaign',
      caption: draft.caption,
      category: draft.category,
      fundingMode: draft.fundingMode,
      currencyCode: draft.currencyCode,
      targetAmountMinor: draft.targetAmountMinor,
      monthlyGoalMinor: draft.monthlyGoalMinor,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      deadline: draft.deadline ?? draft.endsAt,
      nextReviewAt: draft.nextReviewAt,
      publishedAt: overrides.publishedAt,
      status: overrides.status,
      beneficiaryType: draft.beneficiaryType,
      beneficiaryName: draft.beneficiaryName,
      petId: draft.petId,
      urgency: draft.urgency,
      treatmentProvider: draft.treatmentProvider,
      estimatedExpenseMinor: draft.estimatedExpenseMinor,
      spendingPlan: draft.spendingPlan,
      locationText: draft.locationText,
      countryId: draft.countryId,
      stateId: draft.stateId,
      cityId: draft.cityId,
      subDistrictId: draft.subDistrictId,
      bdAddressMode: draft.bdAddressMode,
      bdDivisionId: draft.bdDivisionId,
      bdDistrictId: draft.bdDistrictId,
      bdCityCorporationId: draft.bdCityCorporationId,
      bdZoneId: draft.bdZoneId,
      bdWardId: draft.bdWardId,
      bdUpazilaId: draft.bdUpazilaId,
      bdUnionId: draft.bdUnionId,
      bdAreaId: draft.bdAreaId,
      mediaIds: [...draft.mediaIds],
      createdAt: this.now(),
      updatedAt: this.now(),
      deletedAt: null,
      stats: {
        raisedAmountMinor: 0n,
        withdrawnAmountMinor: 0n,
        donorsCount: 0,
      },
    };
    this.ensureCampaignDates(campaign);
    state.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  private mustGetCampaign(state: StoreState, campaignId: number): CampaignRecord {
    const campaign = state.campaigns.get(campaignId);
    if (!campaign || campaign.deletedAt !== null) {
      throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
    }
    this.refreshCampaignState(campaign);
    return campaign;
  }

  private hasManageAnyAccess(userId: number): boolean {
    const principal = this.principalForUser(userId);
    return hasRole(principal, 'admin') || hasPermission(principal, 'fundraising:manage:any');
  }

  private mustOwnCampaign(state: StoreState, userId: number, campaignId: number): CampaignRecord {
    const campaign = this.mustGetCampaign(state, campaignId);
    if (campaign.ownerUserId !== userId && !this.hasManageAnyAccess(userId)) {
      throw new FundraisingContractError('EDIT_FORBIDDEN', 'Campaign not found', 403);
    }
    return campaign;
  }

  private refreshCampaignState(campaign: CampaignRecord): void {
    if (campaign.deletedAt !== null) return;
    const end = campaign.endsAt ?? campaign.deadline;
    if (
      end &&
      end.getTime() <= this.now().getTime() &&
      !['CANCELLED', 'ARCHIVED', 'REJECTED', 'COMPLETED', 'FUNDED', 'EXPIRED'].includes(
        campaign.status,
      )
    ) {
      campaign.status = 'EXPIRED';
      campaign.updatedAt = this.now();
    }
    const target = campaign.targetAmountMinor;
    if (target && campaign.stats.raisedAmountMinor >= target && campaign.status === 'ACTIVE') {
      campaign.status = 'FUNDED';
    }
  }

  private campaignPayload(campaign: CampaignRecord, viewerUserId: number): Record<string, unknown> {
    const author = this.userPayload(viewerUserId, campaign.ownerUserId);
    const post = {
      id: campaign.postId,
      author,
      caption: campaign.caption,
      media: campaign.mediaIds.map((mediaId) => ({
        id: mediaId,
        media: this.mediaPayload(mediaId),
      })),
      createdAt: campaign.publishedAt?.toISOString() ?? campaign.createdAt.toISOString(),
    };
    const last3Donors = [...this.state.donationIntents.values()]
      .filter((intent) => intent.campaignId === campaign.id && intent.status === 'SUCCEEDED')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3)
      .map((intent) => this.donorPayload(viewerUserId, intent.donorUserId, intent.amountMinor));
    // Canonical field is `donationAllowed`; `acceptingDonations`/`canDonate`
    // are additive aliases the mobile client also understands — all three
    // must always agree, so they're derived from the same policy call.
    const donationAllowed = isDonationAllowed(
      {
        status: campaign.status,
        endsAt: campaign.endsAt,
        deadline: campaign.deadline,
        targetAmountMinor: campaign.targetAmountMinor,
        raisedAmountMinor: campaign.stats.raisedAmountMinor,
      },
      this.now(),
    );
    return {
      id: campaign.id,
      publicId: campaign.publicId,
      postId: campaign.postId,
      title: campaign.title,
      targetAmount: campaign.targetAmountMinor ?? 0n,
      targetAmountMinor: campaign.targetAmountMinor,
      monthlyGoalMinor: campaign.monthlyGoalMinor,
      fundingMode: campaign.fundingMode,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      deadline: campaign.deadline,
      nextReviewAt: campaign.nextReviewAt,
      publishedAt: campaign.publishedAt,
      createdAt: campaign.createdAt,
      status: campaign.status,
      donationAllowed,
      acceptingDonations: donationAllowed,
      canDonate: donationAllowed,
      author,
      caption: campaign.caption,
      post,
      media: campaign.mediaIds.map((mediaId) => this.mediaPayload(mediaId)),
      stats: {
        raisedAmount: campaign.stats.raisedAmountMinor,
        withdrawnAmount: campaign.stats.withdrawnAmountMinor,
        donorsCount: campaign.stats.donorsCount,
      },
      isAccountVerified: this.isAccountVerified(campaign.ownerUserId),
      category: campaign.category,
      locationText: campaign.locationText ?? '',
      bdAddressMode: campaign.bdAddressMode,
      bdDivisionId: campaign.bdDivisionId,
      bdDistrictId: campaign.bdDistrictId,
      bdCityCorporationId: campaign.bdCityCorporationId,
      bdZoneId: campaign.bdZoneId,
      bdWardId: campaign.bdWardId,
      bdUpazilaId: campaign.bdUpazilaId,
      bdUnionId: campaign.bdUnionId,
      bdAreaId: campaign.bdAreaId,
      last3Donors,
      account: this.accountSummary(campaign.ownerUserId),
    };
  }

  private accountSummary(userId: number): Record<string, unknown> | null {
    const account = this.state.accounts.get(userId);
    if (!account) return null;
    return {
      status: account.status,
      verified: account.status === 'VERIFIED',
    };
  }

  private updatePayload(
    update: CampaignUpdateRecord,
    viewerUserId: number,
  ): Record<string, unknown> {
    return {
      id: update.id,
      postId: update.postId,
      createdAt: update.createdAt,
      updatedAt: update.updatedAt,
      caption: update.caption,
      post: {
        id: update.postId,
        caption: update.caption,
        createdAt: update.createdAt.toISOString(),
        author: this.userPayload(viewerUserId, update.authorId),
        media: update.mediaIds.map((mediaId) => ({
          id: mediaId,
          media: this.mediaPayload(mediaId),
        })),
      },
      author: this.userPayload(viewerUserId, update.authorId),
      media: update.mediaIds.map((mediaId) => this.mediaPayload(mediaId)),
    };
  }

  private draftPayload(
    draft: CampaignDraftRecord,
    campaign?: CampaignRecord,
  ): Record<string, unknown> {
    return {
      id: draft.id,
      publicId: draft.publicId,
      slug: `draft-${draft.id}`,
      status: draft.status,
      title: draft.title,
      caption: draft.caption,
      category: draft.category,
      fundingMode: draft.fundingMode,
      currencyCode: draft.currencyCode,
      targetAmountMinor: draft.targetAmountMinor,
      monthlyGoalMinor: draft.monthlyGoalMinor,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      deadline: draft.deadline ?? draft.endsAt,
      nextReviewAt: draft.nextReviewAt,
      beneficiaryType: draft.beneficiaryType,
      beneficiaryName: draft.beneficiaryName,
      petId: draft.petId,
      urgency: draft.urgency,
      treatmentProvider: draft.treatmentProvider,
      estimatedExpenseMinor: draft.estimatedExpenseMinor,
      spendingPlan: draft.spendingPlan,
      locationText: draft.locationText,
      countryId: draft.countryId,
      stateId: draft.stateId,
      cityId: draft.cityId,
      subDistrictId: draft.subDistrictId,
      bdAddressMode: draft.bdAddressMode,
      bdDivisionId: draft.bdDivisionId,
      bdDistrictId: draft.bdDistrictId,
      bdCityCorporationId: draft.bdCityCorporationId,
      bdZoneId: draft.bdZoneId,
      bdWardId: draft.bdWardId,
      bdUpazilaId: draft.bdUpazilaId,
      bdUnionId: draft.bdUnionId,
      bdAreaId: draft.bdAreaId,
      submittedAt: draft.submittedAt,
      mediaIds: [...draft.mediaIds],
      mediaUrls: draft.mediaIds.map((mediaId) => this.mediaPayload(mediaId).url).filter(Boolean),
      post: campaign
        ? {
            id: campaign.postId,
            author: this.userPayload(draft.ownerUserId, draft.ownerUserId),
            caption: campaign.caption,
            media: campaign.mediaIds.map((mediaId) => ({
              id: mediaId,
              media: this.mediaPayload(mediaId),
            })),
            createdAt: campaign.createdAt.toISOString(),
          }
        : {
            id: draft.id,
            author: this.userPayload(draft.ownerUserId, draft.ownerUserId),
            caption: draft.caption,
            media: draft.mediaIds.map((mediaId) => ({
              id: mediaId,
              media: this.mediaPayload(mediaId),
            })),
            createdAt: draft.createdAt.toISOString(),
          },
    };
  }

  private donationIntentPayload(intent: DonationIntentRecord): Record<string, unknown> {
    return {
      id: intent.id,
      publicId: intent.publicId,
      referenceId: intent.referenceId,
      status: intent.status,
      amountMinor: intent.amountMinor,
      currencyCode: intent.currencyCode,
      expiresAt: intent.expiresAt,
      finalizedAt: intent.finalizedAt,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    };
  }

  private checkoutResponse(
    intent: DonationIntentRecord,
    payment: DonationPaymentAttemptRecord | null,
    reused: boolean,
  ): DonationCheckoutResponse {
    return {
      donationIntent: this.donationIntentPayload(intent),
      payment: payment ? this.publicPaymentPayload(payment) : null,
      reused,
    };
  }

  private publicPaymentPayload(payment: DonationPaymentAttemptRecord): Record<string, unknown> {
    return {
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      redirectUrl: payment.redirectUrl,
      logId: payment.logId,
      paymentAttemptId: payment.id,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private donationItemPayload(
    intent: DonationIntentRecord,
    viewerUserId: number,
  ): Record<string, unknown> {
    return {
      id: intent.id,
      amount: intent.amountMinor,
      createdAt: intent.createdAt,
      donor: this.donorPayload(viewerUserId, intent.donorUserId, intent.amountMinor),
    };
  }

  private donorPayload(
    viewerUserId: number,
    donorUserId: number,
    amount?: bigint,
  ): Record<string, unknown> {
    const user = this.userPayload(viewerUserId, donorUserId);
    return {
      id: donorUserId,
      amount,
      profile: user.profile,
    };
  }

  private accountPayload(account: FundraisingAccountRecord): Record<string, unknown> {
    return {
      id: account.id,
      status: account.status,
      accountType: account.accountType,
      fullName: account.fullName,
      dateOfBirth: account.dateOfBirth,
      presentAddress: account.presentAddress,
      permanentAddress: account.permanentAddress,
      occupation: account.occupation,
      isInternational: account.isInternational,
      divisionId: account.divisionId,
      districtId: account.districtId,
      upazilaId: account.upazilaId,
      unionId: account.unionId,
      areaId: account.areaId,
      verificationDraftJson: account.verificationDraftJson,
      area: account.area,
      primaryDocumentType: account.primaryDocumentType,
      nationalIdNumber: account.nationalIdNumber,
      birthRegNumber: account.birthRegNumber,
      passportNumber: account.passportNumber,
      studentIdNumber: account.studentIdNumber,
      drivingLicenceNumber: account.drivingLicenceNumber,
      rejectionReason: account.rejectionReason,
      submittedAt: account.submittedAt,
      reviewedAt: account.reviewedAt,
      reviewedByUserId: account.reviewedByUserId,
      documents: account.documents
        .filter((document) => document.deletedAt === null)
        .map((document) => this.documentPayload(document)),
      countryCode: account.countryCode,
      countryName: account.countryName,
      stateName: account.stateName,
      cityName: account.cityName,
      addressLine: account.addressLine,
      latitude: account.latitude,
      longitude: account.longitude,
      formattedAddress: account.formattedAddress,
      version: account.version,
      readiness: this.accountReadinessPayload(account),
    };
  }

  private accountReadinessPayload(
    account: FundraisingAccountRecord,
  ): Record<string, unknown> & { canStartFundraiser: boolean } {
    const missingProfileFields: string[] = [];
    if (!normalizeText(account.presentAddress)) missingProfileFields.push('presentAddress');
    if (!normalizeText(account.permanentAddress)) missingProfileFields.push('permanentAddress');
    const hasBangladeshLocation =
      account.divisionId !== null ||
      account.districtId !== null ||
      account.upazilaId !== null ||
      account.unionId !== null ||
      account.areaId !== null ||
      normalizeText(account.area) !== null;
    const hasInternationalLocation =
      normalizeText(account.countryCode) !== null ||
      normalizeText(account.countryName) !== null ||
      normalizeText(account.stateName) !== null ||
      normalizeText(account.cityName) !== null ||
      normalizeText(account.addressLine) !== null ||
      normalizeText(account.formattedAddress) !== null;
    if (!hasBangladeshLocation && !hasInternationalLocation) missingProfileFields.push('location');
    if (!normalizeText(account.fullName)) missingProfileFields.push('fullName');
    const primaryDocumentType = normalizeText(account.primaryDocumentType)?.toUpperCase();
    const primaryDocumentNumberMissing =
      (primaryDocumentType === 'NID' && !normalizeText(account.nationalIdNumber)) ||
      (primaryDocumentType === 'PASSPORT' && !normalizeText(account.passportNumber)) ||
      ((primaryDocumentType === 'BIRTH_REGISTRATION' ||
        primaryDocumentType === 'BIRTHREG' ||
        primaryDocumentType === 'BIRTH_CERTIFICATE') &&
        !normalizeText(account.birthRegNumber)) ||
      (primaryDocumentType === 'STUDENT_ID' && !normalizeText(account.studentIdNumber)) ||
      ((primaryDocumentType === 'DRIVING_LICENCE' ||
        primaryDocumentType === 'DRIVING_LICENSE' ||
        primaryDocumentType === 'DRIVERS_LICENSE' ||
        primaryDocumentType === 'DRIVER_LICENCE') &&
        !normalizeText(account.drivingLicenceNumber));
    if (primaryDocumentType && primaryDocumentNumberMissing) {
      missingProfileFields.push('primaryDocumentNumber');
    }
    const missingDocumentTypes = account.documents.some(
      (document) => document.deletedAt === null && document.documentType === 'PRIMARY',
    )
      ? []
      : ['required_verification_document'];
    const accountExists = true;
    const isRejected = account.status === 'REJECTED';
    const isPendingReview = account.status === 'PENDING';
    const requiredProfileComplete = missingProfileFields.length === 0;
    const requiredDocumentsUploaded = missingDocumentTypes.length === 0;
    const statusNotRejectedOrBlocked = !isRejected;
    return {
      accountExists,
      status: account.status,
      requiredProfileComplete,
      requiredDocumentsUploaded,
      statusNotRejectedOrBlocked,
      isPendingReview,
      isRejected,
      missingProfileFields,
      missingDocumentTypes,
      safeRejectionReason: account.rejectionReason,
      canStartFundraiser:
        requiredProfileComplete && requiredDocumentsUploaded && statusNotRejectedOrBlocked,
    };
  }

  private documentPayload(document: FundraisingAccountDocumentRecord): Record<string, unknown> {
    return {
      id: document.id,
      accountId: document.accountId,
      mediaId: document.mediaId,
      title: document.title,
      media: document.media,
      documentType: document.documentType ?? 'SUPPORTING',
      createdAt: document.createdAt,
      deletedAt: document.deletedAt,
    };
  }

  private userPayload(viewerUserId: number, targetUserId: number): Record<string, unknown> {
    const detail = this.socialStore.getVisitorUserPayload(viewerUserId, targetUserId);
    return {
      id: detail.id,
      profile: detail.profile,
    };
  }

  private mediaPayload(mediaId: number): Record<string, unknown> {
    const media = this.mustGetMedia(mediaId);
    return {
      id: media.id,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      hlsUrl: media.hlsUrl,
      type: media.type,
      mimetype: media.mimetype,
      // Exposed so a draft reopen can tell READY apart from
      // still-PROCESSING/FAILED media without re-polling every media id
      // individually.
      status: media.status,
    };
  }

  private mustGetMedia(mediaId: number): MediaRef {
    const media = this.socialStore.getMedia(mediaId);
    if (!media) throw new FundraisingContractError('NOT_FOUND', 'Media not found', 404);
    return {
      id: media.id,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      hlsUrl: media.hlsUrl,
      mimetype: media.mimetype,
      status: media.status,
      type:
        media.status === 'READY'
          ? media.mimetype.startsWith('video/')
            ? 'VIDEO'
            : 'IMAGE'
          : 'FILE',
    };
  }

  private ensureOwnedMedia(userId: number, mediaId: number): void {
    if (!this.socialStore.isMediaOwnedBy(userId, mediaId)) {
      throw new FundraisingContractError('MEDIA_NOT_OWNED', 'Media not found', 403);
    }
  }

  private ensureCanViewCampaign(
    viewerUserId: number,
    campaign: CampaignRecord,
    isManager = false,
  ): void {
    if (campaign.deletedAt !== null)
      throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
    if (isManager || this.hasManageAnyAccess(viewerUserId)) return;
    if (campaign.ownerUserId === viewerUserId) return;
    if (this.socialStore.isBlocked(viewerUserId, campaign.ownerUserId)) {
      throw new FundraisingContractError('FORBIDDEN', 'Campaign not found', 403);
    }
    if (!isPublicVisibleStatus(campaign.status)) {
      throw new FundraisingContractError('NOT_PUBLIC', 'Campaign not public', 403);
    }
  }

  private canViewerSeeCampaign(
    viewerUserId: number,
    campaign: CampaignRecord,
    isManager = false,
  ): boolean {
    if (campaign.deletedAt !== null) return false;
    if (isManager || this.hasManageAnyAccess(viewerUserId)) return true;
    if (campaign.ownerUserId === viewerUserId) return true;
    if (this.socialStore.isBlocked(viewerUserId, campaign.ownerUserId)) return false;
    return isPublicVisibleStatus(campaign.status);
  }

  private matchesFeedFilters(
    campaign: CampaignRecord,
    query: { verified?: boolean; category?: string; location?: string },
  ): boolean {
    if (query.verified === true && !this.isAccountVerified(campaign.ownerUserId)) return false;
    if (query.verified === false && this.isAccountVerified(campaign.ownerUserId)) return false;
    if (query.category && campaign.category?.toLowerCase() !== query.category.toLowerCase())
      return false;
    if (
      query.location &&
      campaign.locationText?.toLowerCase().includes(query.location.toLowerCase()) === false
    )
      return false;
    return true;
  }

  private sortCampaigns(campaigns: CampaignRecord[], sort?: string): CampaignRecord[] {
    const normalized = (sort ?? '').trim().toLowerCase();
    const copy = [...campaigns];
    if (normalized === 'trending') {
      return copy.sort(
        (a, b) =>
          Number(b.stats.raisedAmountMinor - a.stats.raisedAmountMinor) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
    return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private sliceByCursor<T extends { id: number }>(items: T[], limit: number, cursor?: string): T[] {
    const max = Math.max(1, Math.min(limit || 50, 100));
    const cursorId = parseNumber(cursor);
    const filtered = cursorId ? items.filter((item) => item.id < cursorId) : items;
    return filtered.slice(0, max);
  }

  private validateDraftForPublishing(draft: CampaignDraftRecord): void {
    const missing: string[] = [];
    if (!draft.title) missing.push('title');
    if (!draft.caption) missing.push('caption');
    if (!draft.category) missing.push('category');
    if (!draft.beneficiaryType) missing.push('beneficiaryType');
    if (!draft.beneficiaryName) missing.push('beneficiaryName');
    const oneTime = draft.fundingMode === 'ONE_TIME';
    if (oneTime && (!draft.targetAmountMinor || draft.targetAmountMinor <= 0n))
      missing.push('targetAmountMinor');
    if (!oneTime && (!draft.monthlyGoalMinor || draft.monthlyGoalMinor <= 0n))
      missing.push('monthlyGoalMinor');
    const end = draft.endsAt ?? draft.deadline;
    if (oneTime && !end) missing.push('deadline');
    for (const mediaId of draft.mediaIds) {
      if (!this.socialStore.isMediaOwnedBy(draft.ownerUserId, mediaId)) {
        missing.push(`mediaIds:${mediaId}`);
        continue;
      }
      const media = this.socialStore.getMedia(mediaId);
      if (!media || media.status !== 'READY') {
        missing.push(`mediaIds:${mediaId}:not_ready`);
      }
    }
    if (missing.length > 0) {
      throw new FundraisingContractError(
        'VALIDATION',
        `Draft is incomplete: ${missing.join(', ')}`,
        422,
      );
    }
  }

  private ensureCampaignEditable(campaign: CampaignRecord): void {
    if (['CANCELLED', 'ARCHIVED', 'REJECTED', 'COMPLETED', 'EXPIRED'].includes(campaign.status)) {
      throw new FundraisingContractError('INVALID_TRANSITION', 'Campaign cannot be modified', 409);
    }
  }

  private ensureCampaignDates(campaign: {
    startsAt: Date | null;
    endsAt: Date | null;
    deadline: Date | null;
  }): void {
    const end = campaign.endsAt ?? campaign.deadline;
    if (campaign.startsAt && end && end.getTime() < campaign.startsAt.getTime()) {
      throw new FundraisingContractError(
        'VALIDATION',
        'Campaign end date must be after start date',
        422,
      );
    }
  }

  private ensureCanDonate(userId: number, campaign: CampaignRecord): void {
    this.ensureCanViewCampaign(userId, campaign);
    if (!isDonationEligibleStatus(campaign.status)) {
      throw new FundraisingContractError(
        'NOT_DONATABLE',
        `This fundraiser is not accepting donations`,
        422,
      );
    }
    if (isCampaignExpired(campaign, this.now())) {
      throw new FundraisingContractError('NOT_DONATABLE', 'This fundraiser has expired', 422);
    }
    if (
      campaign.targetAmountMinor &&
      campaign.stats.raisedAmountMinor >= campaign.targetAmountMinor
    ) {
      throw new FundraisingContractError('NOT_DONATABLE', 'This fundraiser reached its goal', 422);
    }
  }

  private transitionDonationIntent(
    state: StoreState,
    intent: DonationIntentRecord,
    nextStatus: FundraisingDonationStatus,
  ): void {
    const current = intent.status;
    if (current === nextStatus) return;
    const terminal = new Set<FundraisingDonationStatus>([
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'ON_HOLD_REVIEW',
    ]);
    if (terminal.has(current) && terminal.has(nextStatus) && current !== nextStatus) {
      throw new FundraisingContractError('INVALID_TRANSITION', 'Donation already finalized', 409);
    }
    if (current === 'PENDING' && nextStatus === 'PROCESSING') {
      intent.status = nextStatus;
    } else if (current === 'PENDING' && terminal.has(nextStatus)) {
      intent.status = nextStatus;
    } else if (current === 'PROCESSING' && terminal.has(nextStatus)) {
      intent.status = nextStatus;
    } else if (current === 'ON_HOLD_REVIEW' && nextStatus === 'SUCCEEDED') {
      intent.status = nextStatus;
    } else if (current === 'EXPIRED' && nextStatus === 'EXPIRED') {
      intent.status = nextStatus;
    } else {
      throw new FundraisingContractError(
        'INVALID_TRANSITION',
        'Invalid donation status transition',
        409,
      );
    }
    intent.updatedAt = this.now();
    if (terminal.has(intent.status)) {
      intent.finalizedAt = this.now();
    }
  }

  private finalizeSuccessfulDonation(state: StoreState, intent: DonationIntentRecord): void {
    const campaign = this.mustGetCampaign(state, intent.campaignId);
    const payment = state.donationAttempts.get(intent.paymentAttemptId);
    if (payment) {
      payment.status = 'SUCCEEDED';
    }
    const duplicateReceipt = this.receiptsForIntent(intent.id);
    if (!duplicateReceipt) {
      state.receipts.set(state.nextReceiptId, {
        id: state.nextReceiptId++,
        intentId: intent.id,
        receiptNumber: `rcpt_${randomUUID()}`,
        amountMinor: intent.amountMinor,
        currencyCode: intent.currencyCode,
        issuedAt: this.now(),
      });
    }
    campaign.stats.raisedAmountMinor += intent.amountMinor;
    campaign.stats.donorsCount += 1;
    if (
      campaign.targetAmountMinor &&
      campaign.stats.raisedAmountMinor >= campaign.targetAmountMinor
    ) {
      campaign.status = 'FUNDED';
    }
    campaign.updatedAt = this.now();
  }

  private receiptsForIntent(intentId: number): DonationReceiptRecord | null {
    const receipt = [...this.state.receipts.values()].find((entry) => entry.intentId === intentId);
    if (!receipt) return null;
    return {
      id: receipt.id,
      intentId: receipt.intentId,
      receiptNumber: receipt.receiptNumber,
      amountMinor: receipt.amountMinor,
      currencyCode: receipt.currencyCode,
      issuedAt: receipt.issuedAt,
    };
  }

  private findIntentByReference(reference: string): DonationIntentRecord | null {
    for (const intent of this.state.donationIntents.values()) {
      if (
        intent.referenceId === reference ||
        intent.publicId === reference ||
        String(intent.id) === reference
      ) {
        return intent;
      }
    }
    return null;
  }

  private mustFindIntentIdByReference(state: StoreState, reference: string): number {
    const intent = [...state.donationIntents.values()].find(
      (entry) =>
        entry.referenceId === reference ||
        entry.publicId === reference ||
        String(entry.id) === reference,
    );
    if (!intent) throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    return intent.id;
  }

  private mustGetIntentRecord(state: StoreState, intentId: number): DonationIntentRecord {
    const intent = state.donationIntents.get(intentId);
    if (!intent) throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    return intent;
  }

  private draftKey(userId: number, key: string): string {
    return `draft:${userId}:${key}`;
  }

  private submitKey(userId: number, draftId: string, key: string): string {
    return `submit:${userId}:${draftId}:${key}`;
  }

  private donationKey(userId: number, campaignId: number, key: string): string {
    return `donation:${userId}:${campaignId}:${key}`;
  }

  private isAccountVerified(userId: number): boolean {
    const account = this.state.accounts.get(userId);
    return account?.status === 'VERIFIED';
  }

  /**
   * Payout-sensitive guard — the one place fundraising verification is
   * genuinely load-bearing. Withdrawal / cash-out / payout-execution /
   * payout-destination-activation routes must call this before moving any
   * collected funds. Reads the durable row (not the in-memory cache) so a
   * freshly restarted process can never mistake an unverified account for
   * a verified one.
   *
   * Campaign create/save/submit and donation acceptance deliberately do
   * NOT call this — see `canCreateOrSubmitCampaign` / `canReceiveDonations`
   * in `fundraising-policy.ts`.
   */
  async assertCanWithdrawFunds(userId: number): Promise<void> {
    const account = await this.loadVerificationAccountRecord(userId);
    if (!canWithdrawFunds(account)) {
      throw new FundraisingContractError(
        'ACCOUNT_NOT_VERIFIED',
        'Complete fundraising verification before withdrawing funds',
        403,
      );
    }
  }

  private principalForUser(userId: number): AuthenticatedPrincipal {
    return {
      sub: String(userId),
      issuer: 'local',
      audience: 'local',
      clientId: 'local',
      expiresAt: Math.floor(this.now().getTime() / 1000) + 3600,
      issuedAt: Math.floor(this.now().getTime() / 1000) - 60,
      roles: [],
      permissions: [],
      scopes: [],
      claims: {},
    };
  }

  private applyDraftInput(draft: CampaignDraftRecord, input: FundraisingDraftInput): void {
    if (input.title !== undefined) draft.title = normalizeText(input.title);
    if (input.caption !== undefined) draft.caption = normalizeText(input.caption);
    if (input.category !== undefined) draft.category = normalizeText(input.category);
    if (input.fundingMode !== undefined)
      draft.fundingMode = normalizeFundingMode(input.fundingMode) ?? draft.fundingMode;
    if (input.currencyCode !== undefined)
      draft.currencyCode = normalizeCurrency(input.currencyCode) ?? draft.currencyCode;
    if (input.targetAmountMinor !== undefined)
      draft.targetAmountMinor =
        input.targetAmountMinor == null
          ? null
          : parseMoneyMinor(input.targetAmountMinor, 'targetAmountMinor');
    if (input.monthlyGoalMinor !== undefined)
      draft.monthlyGoalMinor =
        input.monthlyGoalMinor == null
          ? null
          : parseMoneyMinor(input.monthlyGoalMinor, 'monthlyGoalMinor');
    if (input.startsAt !== undefined) draft.startsAt = parseDate(input.startsAt);
    if (input.endsAt !== undefined) draft.endsAt = parseDate(input.endsAt);
    if (input.deadline !== undefined) draft.deadline = parseDate(input.deadline);
    if (input.nextReviewAt !== undefined) draft.nextReviewAt = parseDate(input.nextReviewAt);
    if (input.beneficiaryType !== undefined)
      draft.beneficiaryType = normalizeText(input.beneficiaryType);
    if (input.beneficiaryName !== undefined)
      draft.beneficiaryName = normalizeText(input.beneficiaryName);
    if (input.petId !== undefined) draft.petId = parseNumber(input.petId);
    if (input.urgency !== undefined) draft.urgency = normalizeText(input.urgency);
    if (input.treatmentProvider !== undefined)
      draft.treatmentProvider = normalizeText(input.treatmentProvider);
    if (input.estimatedExpenseMinor !== undefined)
      draft.estimatedExpenseMinor = parseMoneyMinor(
        input.estimatedExpenseMinor,
        'estimatedExpenseMinor',
      );
    if (input.spendingPlan !== undefined)
      draft.spendingPlan = this.extractObject(input.spendingPlan);
    if (input.locationText !== undefined) draft.locationText = normalizeText(input.locationText);
    if (input.countryId !== undefined) draft.countryId = parseNumber(input.countryId);
    if (input.stateId !== undefined) draft.stateId = parseNumber(input.stateId);
    if (input.cityId !== undefined) draft.cityId = parseNumber(input.cityId);
    if (input.subDistrictId !== undefined) draft.subDistrictId = parseNumber(input.subDistrictId);
    if (input.bdDivisionId !== undefined) draft.bdDivisionId = parseNumber(input.bdDivisionId);
    if (input.bdDistrictId !== undefined) draft.bdDistrictId = parseNumber(input.bdDistrictId);
    if (input.bdAddressMode !== undefined) draft.bdAddressMode = normalizeText(input.bdAddressMode);
    if (input.bdCityCorporationId !== undefined)
      draft.bdCityCorporationId = parseNumber(input.bdCityCorporationId);
    if (input.bdZoneId !== undefined) draft.bdZoneId = parseNumber(input.bdZoneId);
    if (input.bdWardId !== undefined) draft.bdWardId = parseNumber(input.bdWardId);
    if (input.bdUpazilaId !== undefined) draft.bdUpazilaId = parseNumber(input.bdUpazilaId);
    if (input.bdUnionId !== undefined) draft.bdUnionId = parseNumber(input.bdUnionId);
    if (input.bdAreaId !== undefined) draft.bdAreaId = parseNumber(input.bdAreaId);
    if (Array.isArray(input.mediaIds)) {
      draft.mediaIds = input.mediaIds
        .map((value) => parseNumber(value))
        .filter((value): value is number => value !== null);
    }
  }

  private extractObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.assign({}, value) as Record<string, unknown>;
  }
}

export function createFundraisingStore(
  socialStore: SocialCoreStore,
  options: FundraisingStoreOptions = {},
): FundraisingStore {
  return new FundraisingStore(socialStore, options);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeDateOnly(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1] ?? null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeCurrency(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

function normalizeFundingMode(value: unknown): FundraisingFundingMode | null {
  const text = normalizeText(value)?.toUpperCase();
  if (!text) return null;
  if (text === 'ONGOING' || text === 'RECURRING') return 'ONGOING';
  return 'ONE_TIME';
}

function normalizeAccountType(value: unknown): 'INDIVIDUAL' | 'ORGANIZATION' | null {
  const text = normalizeText(value)?.toUpperCase();
  if (text === 'INDIVIDUAL' || text === 'ORGANIZATION') return text;
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return new Date(value.getTime());
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMoneyMinor(value: unknown, field: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new FundraisingContractError('VALIDATION', `${field} must be an integer`, 422);
    }
    return BigInt(value);
  }
  const text = normalizeText(value);
  if (!text || !/^-?\d+$/.test(text)) {
    throw new FundraisingContractError('VALIDATION', `${field} must be an integer`, 422);
  }
  return BigInt(text);
}

function normalizeDonationStatus(raw: string): FundraisingDonationStatus {
  const normalized = raw.trim().toUpperCase();
  switch (normalized) {
    case 'SUCCEEDED':
    case 'FAILED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'ON_HOLD_REVIEW':
    case 'PROCESSING':
    case 'PENDING':
      return normalized;
    default:
      return 'PROCESSING';
  }
}

function mapEpsOutcomeToDonationStatus(outcome: EpsTransactionOutcome): string {
  switch (outcome) {
    case 'SUCCESS':
      return 'SUCCEEDED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'PENDING':
      return 'PROCESSING';
    default:
      return 'PROCESSING';
  }
}

function stablePayloadString(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = payload[key];
  return JSON.stringify(ordered);
}

function hashText(value: string): string {
  return createHmac('sha256', 'hash').update(value).digest('hex');
}

function signWebhookPayload(
  secret: string,
  provider: string,
  eventId: string,
  referenceId: string,
  status: string,
  amountMinor: bigint | string | number,
  currencyCode: string,
  providerPaymentId: string,
  payload: string,
): string {
  const body = [
    provider,
    eventId,
    referenceId,
    status,
    String(amountMinor),
    currencyCode,
    providerPaymentId,
    payload,
  ].join('|');
  return createHmac('sha256', secret).update(body).digest('hex');
}

function timingSafeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
