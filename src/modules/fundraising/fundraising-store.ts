import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

import type { SocialCoreStore } from '../social/social-store';
import type { AuthenticatedPrincipal } from '../../security/principal';
import { hasPermission, hasRole } from '../../security/authorization';

export type FundraisingAccountStatus = 'DRAFT' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type FundraisingFundingMode = 'ONE_TIME' | 'RECURRING';
export type FundraisingCampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'PAUSED'
  | 'FUNDED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'ARCHIVED'
  | 'SUSPENDED';
export type FundraisingDonationStatus =
  'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'ON_HOLD_REVIEW';

export interface FundraisingStoreOptions {
  webhookSecret?: string;
  now?: () => Date;
}

export class FundraisingContractError extends Error {
  readonly code:
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'CONFLICT'
    | 'UNAVAILABLE'
    | 'BAD_SIGNATURE'
    | 'INVALID_TRANSITION';

  readonly statusCode: number;

  constructor(
    code:
      | 'VALIDATION'
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'CONFLICT'
      | 'UNAVAILABLE'
      | 'BAD_SIGNATURE'
      | 'INVALID_TRANSITION',
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
  mimetype: string;
  type: string;
}

interface FundraisingAccountDocumentRecord {
  id: number;
  accountId: number;
  mediaId: number;
  title: string;
  media: MediaRef;
  createdAt: Date;
  deletedAt: Date | null;
}

interface FundraisingAccountRecord {
  id: number;
  ownerUserId: number;
  status: FundraisingAccountStatus;
  accountType: 'INDIVIDUAL' | 'ORGANIZATION' | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  occupation: string | null;
  verificationDraftJson: Record<string, unknown> | null;
  area: string | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  documents: FundraisingAccountDocumentRecord[];
  countryCode: string | null;
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignDraftRecord {
  id: number;
  publicId: string;
  ownerUserId: number;
  status: 'DRAFT' | 'SUBMITTED' | 'ARCHIVED';
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
  bdDivisionId: number | null;
  bdDistrictId: number | null;
  bdUpazilaId: number | null;
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
  bdDivisionId: number | null;
  bdDistrictId: number | null;
  bdUpazilaId: number | null;
  bdAreaId: number | null;
  mediaIds: number[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  stats: CampaignStatsRecord;
}

interface CampaignUpdateRecord {
  id: number;
  campaignId: number;
  postId: number;
  authorId: number;
  caption: string | null;
  mediaIds: number[];
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
  bdDivisionId?: number | string | null;
  bdDistrictId?: number | string | null;
  bdUpazilaId?: number | string | null;
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
  private state: StoreState;

  constructor(socialStore: SocialCoreStore, options: FundraisingStoreOptions = {}) {
    this.socialStore = socialStore;
    this.webhookSecret = options.webhookSecret ?? 'local-dev-fundraising-secret';
    this.now = options.now ?? (() => new Date());
    this.state = this.createSeedState();
  }

  reset(): void {
    this.state = this.createSeedState();
  }

  getAccount(userId: number): Record<string, unknown> | null {
    const account = this.state.accounts.get(userId);
    if (!account) return null;
    return this.accountPayload(account);
  }

  upsertAccount(userId: number, input: Record<string, unknown>): Record<string, unknown> {
    return this.transaction((state) => {
      const account = this.ensureAccountRecord(state, userId);
      account.accountType = normalizeAccountType(input.accountType) ?? account.accountType;
      account.presentAddress = normalizeText(input.presentAddress) ?? account.presentAddress;
      account.permanentAddress = normalizeText(input.permanentAddress) ?? account.permanentAddress;
      account.occupation = normalizeText(input.occupation) ?? account.occupation;
      account.verificationDraftJson =
        this.extractObject(input.verificationDraftJson) ?? account.verificationDraftJson;
      account.area = normalizeText(input.area) ?? account.area;
      account.countryCode = normalizeText(input.countryCode) ?? account.countryCode;
      account.countryName = normalizeText(input.countryName) ?? account.countryName;
      account.stateName = normalizeText(input.stateName) ?? account.stateName;
      account.cityName = normalizeText(input.cityName) ?? account.cityName;
      account.addressLine = normalizeText(input.addressLine) ?? account.addressLine;
      account.latitude = parseNumber(input.latitude) ?? account.latitude;
      account.longitude = parseNumber(input.longitude) ?? account.longitude;
      account.formattedAddress = normalizeText(input.formattedAddress) ?? account.formattedAddress;
      account.updatedAt = this.now();
      return this.accountPayload(account);
    });
  }

  submitAccount(userId: number): Record<string, unknown> {
    return this.transaction((state) => {
      const account = this.mustGetAccountRecord(state, userId);
      const readiness = this.accountReadinessPayload(account);
      if (!readiness.canStartFundraiser) {
        throw new FundraisingContractError('VALIDATION', 'Fundraising account is not ready', 422);
      }
      account.status = account.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING';
      account.submittedAt = this.now();
      account.updatedAt = this.now();
      return this.accountPayload(account);
    });
  }

  addAccountDocument(
    userId: number,
    input: { title: string; mediaId: number },
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const account = this.ensureAccountRecord(state, userId);
      this.ensureOwnedMedia(userId, input.mediaId);
      const media = this.mustGetMedia(input.mediaId);
      const existing = account.documents.find(
        (document) => document.deletedAt === null && document.mediaId === input.mediaId,
      );
      if (existing) {
        throw new FundraisingContractError('CONFLICT', 'Document already attached', 409);
      }
      const document: FundraisingAccountDocumentRecord = {
        id: state.nextDocumentId++,
        accountId: account.id,
        mediaId: input.mediaId,
        title: input.title.trim(),
        media,
        createdAt: this.now(),
        deletedAt: null,
      };
      account.documents.push(document);
      account.updatedAt = this.now();
      return this.documentPayload(document);
    });
  }

  deleteAccountDocument(userId: number, documentId: number): Record<string, unknown> {
    return this.transaction((state) => {
      const account = this.mustGetAccountRecord(state, userId);
      const document = account.documents.find(
        (entry) => entry.id === documentId && entry.deletedAt === null,
      );
      if (!document) throw new FundraisingContractError('NOT_FOUND', 'Document not found', 404);
      document.deletedAt = this.now();
      account.updatedAt = this.now();
      return { deleted: true, id: documentId };
    });
  }

  createDraft(
    userId: number,
    input: FundraisingDraftInput,
    idempotencyKey?: string,
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const key = normalizeText(idempotencyKey);
      if (key) {
        const existingDraftId = state.draftIdempotencyKeys.get(this.draftKey(userId, key));
        if (existingDraftId) {
          return this.draftPayload(this.mustGetDraftRecord(state, existingDraftId));
        }
      }
      const draft = this.createDraftRecord(state, userId, input);
      if (key) state.draftIdempotencyKeys.set(this.draftKey(userId, key), draft.id);
      return this.draftPayload(draft);
    });
  }

  getDraft(userId: number, draftId: string): Record<string, unknown> {
    const draft = this.mustOwnDraft(this.state, userId, draftId);
    return this.draftPayload(draft);
  }

  updateDraft(
    userId: number,
    draftId: string,
    input: FundraisingDraftInput,
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const draft = this.mustOwnDraft(state, userId, draftId);
      this.applyDraftInput(draft, input);
      draft.updatedAt = this.now();
      return this.draftPayload(draft);
    });
  }

  submitDraft(userId: number, draftId: string, idempotencyKey?: string): Record<string, unknown> {
    return this.transaction((state) => {
      const key = normalizeText(idempotencyKey);
      if (key) {
        const existingDraftId = state.draftIdempotencyKeys.get(
          this.submitKey(userId, draftId, key),
        );
        if (existingDraftId) {
          return this.draftPayload(this.mustGetDraftRecord(state, existingDraftId));
        }
      }

      const draft = this.mustOwnDraft(state, userId, draftId);
      const account = this.mustGetAccountRecord(state, userId);
      const readiness = this.accountReadinessPayload(account);
      if (!readiness.canStartFundraiser) {
        throw new FundraisingContractError('VALIDATION', 'Fundraising account is not ready', 422);
      }
      this.validateDraftForPublishing(draft);
      draft.status = 'SUBMITTED';
      draft.submittedAt = this.now();
      draft.updatedAt = this.now();
      const campaign = this.createCampaignFromDraft(state, draft, {
        status: 'PENDING_REVIEW',
        publishedAt: null,
      });
      if (key) state.draftIdempotencyKeys.set(this.submitKey(userId, draftId, key), draft.id);
      return this.draftPayload(draft, campaign);
    });
  }

  createCampaign(userId: number, input: FundraisingCampaignInput): Record<string, unknown> {
    return this.transaction((state) => {
      const account = this.mustGetAccountRecord(state, userId);
      const readiness = this.accountReadinessPayload(account);
      if (!readiness.canStartFundraiser) {
        throw new FundraisingContractError('VALIDATION', 'Fundraising account is not ready', 422);
      }
      const draft = this.createDraftRecord(state, userId, input);
      draft.status = 'SUBMITTED';
      draft.submittedAt = this.now();
      draft.updatedAt = this.now();
      this.validateDraftForPublishing(draft);
      const campaign = this.createCampaignFromDraft(state, draft, {
        status: input.publishImmediately === false ? 'PENDING_REVIEW' : 'PENDING_REVIEW',
        publishedAt: null,
      });
      return this.campaignPayload(campaign, userId);
    });
  }

  updateCampaign(
    userId: number,
    campaignId: number,
    input: FundraisingCampaignInput,
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const campaign = this.mustOwnCampaign(state, userId, campaignId);
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
      if (input.locationText !== undefined)
        campaign.locationText = normalizeText(input.locationText);
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
      return this.campaignPayload(campaign, userId);
    });
  }

  publishCampaign(userId: number, campaignId: number): Record<string, unknown> {
    return this.transaction((state) => {
      const campaign = this.mustOwnCampaign(state, userId, campaignId);
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
      return this.campaignPayload(campaign, userId);
    });
  }

  deleteCampaign(userId: number, campaignId: number): Record<string, unknown> {
    return this.transaction((state) => {
      const campaign = this.mustOwnCampaign(state, userId, campaignId);
      campaign.status = 'CANCELLED';
      campaign.deletedAt = this.now();
      campaign.updatedAt = this.now();
      return { deleted: true, id: campaignId, status: campaign.status };
    });
  }

  getCampaign(viewerUserId: number, campaignId: number): Record<string, unknown> {
    const campaign = this.mustGetCampaign(this.state, campaignId);
    this.ensureCanViewCampaign(viewerUserId, campaign);
    return this.campaignPayload(campaign, viewerUserId);
  }

  listFeed(
    viewerUserId: number,
    query: {
      limit?: number;
      cursor?: string;
      verified?: boolean;
      category?: string;
      location?: string;
      sort?: string;
    },
  ): { items: Record<string, unknown>[]; nextCursor: string | null } {
    const campaigns = [...this.state.campaigns.values()]
      .filter((campaign) => this.canViewerSeeCampaign(viewerUserId, campaign))
      .filter((campaign) => this.matchesFeedFilters(campaign, query));
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

  listMyCampaigns(userId: number, limit = 100): Record<string, unknown>[] {
    const campaigns = [...this.state.campaigns.values()]
      .filter((campaign) => campaign.ownerUserId === userId && campaign.deletedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return campaigns.map((campaign) => this.campaignPayload(campaign, userId));
  }

  listUpdates(
    viewerUserId: number,
    campaignId: number,
    limit = 50,
    cursor?: string,
  ): { items: Record<string, unknown>[]; nextCursor: string | null } {
    const campaign = this.mustGetCampaign(this.state, campaignId);
    this.ensureCanViewCampaign(viewerUserId, campaign);
    const updates = [...this.state.updates.values()]
      .filter((update) => update.campaignId === campaignId && update.deletedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const sliced = this.sliceByCursor(updates, limit, cursor);
    return {
      items: sliced.map((update) => this.updatePayload(update, viewerUserId)),
      nextCursor:
        sliced.length === limit && sliced.length > 0 ? String(sliced[sliced.length - 1]!.id) : null,
    };
  }

  createUpdate(
    userId: number,
    campaignId: number,
    input: { caption?: string | null; mediaIds?: Array<number | string> },
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const campaign = this.mustOwnCampaign(state, userId, campaignId);
      const mediaIds = Array.isArray(input.mediaIds)
        ? input.mediaIds
            .map((value) => parseNumber(value))
            .filter((value): value is number => value !== null)
        : [];
      mediaIds.forEach((mediaId) => this.ensureOwnedMedia(userId, mediaId));
      const update: CampaignUpdateRecord = {
        id: state.nextUpdateId++,
        campaignId,
        postId: state.nextPostId++,
        authorId: userId,
        caption: normalizeText(input.caption),
        mediaIds,
        createdAt: this.now(),
        updatedAt: this.now(),
        deletedAt: null,
      };
      state.updates.set(update.id, update);
      campaign.updatedAt = this.now();
      return this.updatePayload(update, userId);
    });
  }

  updateUpdate(
    userId: number,
    updateId: number,
    input: { caption?: string | null; mediaIds?: Array<number | string> },
  ): Record<string, unknown> {
    return this.transaction((state) => {
      const update = this.mustOwnUpdate(state, userId, updateId);
      if (input.caption !== undefined) update.caption = normalizeText(input.caption);
      if (Array.isArray(input.mediaIds)) {
        const mediaIds = input.mediaIds
          .map((value) => parseNumber(value))
          .filter((value): value is number => value !== null);
        mediaIds.forEach((mediaId) => this.ensureOwnedMedia(userId, mediaId));
        update.mediaIds = mediaIds;
      }
      update.updatedAt = this.now();
      return this.updatePayload(update, userId);
    });
  }

  deleteUpdate(userId: number, updateId: number): Record<string, unknown> {
    return this.transaction((state) => {
      const update = this.mustOwnUpdate(state, userId, updateId);
      update.deletedAt = this.now();
      update.updatedAt = this.now();
      return { deleted: true, id: update.id };
    });
  }

  createDonationCheckout(
    userId: number,
    campaignId: number,
    input: DonationCheckoutInput,
    idempotencyKey: string,
  ): DonationCheckoutResponse {
    return this.transaction((state) => {
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
      const key = this.donationKey(userId, campaignId, idempotencyKey);
      const fingerprint = `${campaignId}:${amountMinor.toString()}:${currencyCode ?? ''}:${returnUrl ?? ''}:${cancelUrl ?? ''}:${supportMessage}:${paymentMethodLabel}:${Boolean(input.isAnonymous)}:${input.consentAccepted !== false}`;
      const existingId = state.donationIdempotencyKeys.get(key);
      if (existingId) {
        const existing = this.mustGetIntentRecord(state, existingId);
        const payment = state.donationAttempts.get(existing.paymentAttemptId) ?? null;
        if (payment && payment.requestFingerprint !== fingerprint) {
          throw new FundraisingContractError(
            'CONFLICT',
            'Duplicate idempotency key with different request',
            409,
          );
        }
        return this.checkoutResponse(existing, payment, true);
      }

      const campaign = this.mustGetCampaign(state, campaignId);
      this.ensureCanDonate(userId, campaign);
      const resolvedCurrency = currencyCode ?? campaign.currencyCode;
      if (resolvedCurrency !== campaign.currencyCode) {
        throw new FundraisingContractError('VALIDATION', 'Currency mismatch', 422);
      }
      const paymentAttempt: DonationPaymentAttemptRecord = {
        id: state.nextAttemptId++,
        attemptId: `attempt_${randomUUID()}`,
        intentId: 0,
        provider: 'wpa',
        providerPaymentId: null,
        redirectUrl: returnUrl,
        logId: `log_${randomUUID()}`,
        status: 'PENDING',
        requestFingerprint: fingerprint,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      const intent: DonationIntentRecord = {
        id: state.nextIntentId++,
        publicId: `intent_${randomUUID()}`,
        referenceId: `ref_${campaignId}_${state.nextIntentId}_${Date.now()}`,
        status: 'PENDING',
        donorUserId: userId,
        campaignId,
        campaignTitle: campaign.title,
        amountMinor,
        currencyCode: resolvedCurrency,
        isAnonymous: Boolean(input.isAnonymous),
        supportMessage,
        paymentMethodLabel,
        consentAccepted: input.consentAccepted !== false,
        expiresAt: new Date(this.now().getTime() + 30 * 60 * 1000),
        finalizedAt: null,
        createdAt: this.now(),
        updatedAt: this.now(),
        idempotencyKey,
        paymentAttemptId: paymentAttempt.id,
      };
      paymentAttempt.intentId = intent.id;
      state.donationAttempts.set(paymentAttempt.id, paymentAttempt);
      state.donationIntents.set(intent.id, intent);
      state.donationIdempotencyKeys.set(key, intent.id);
      return this.checkoutResponse(intent, paymentAttempt, false);
    });
  }

  getDonationAttemptByReference(
    viewerUserId: number,
    referenceOrAttemptId: string,
  ): Record<string, unknown> {
    const intent = this.findIntentByReference(referenceOrAttemptId);
    if (!intent) throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    if (
      intent.donorUserId !== viewerUserId &&
      this.mustGetCampaign(this.state, intent.campaignId).ownerUserId !== viewerUserId
    ) {
      throw new FundraisingContractError('FORBIDDEN', 'Donation not found', 403);
    }
    const payment = this.state.donationAttempts.get(intent.paymentAttemptId) ?? null;
    const receipt = this.receiptsForIntent(intent.id);
    return {
      attemptId: payment?.attemptId ?? intent.publicId,
      campaignId: intent.campaignId,
      campaignTitle: intent.campaignTitle,
      amountMinor: intent.amountMinor,
      currencyCode: intent.currencyCode,
      isAnonymous: intent.isAnonymous,
      supportMessage: intent.supportMessage,
      paymentMethodLabel: intent.paymentMethodLabel,
      status: intent.status,
      consentAccepted: intent.consentAccepted,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
      intentId: intent.id,
      intentPublicId: intent.publicId,
      referenceId: intent.referenceId,
      provider: payment?.provider ?? 'wpa',
      redirectUrl: payment?.redirectUrl ?? null,
      expiresAt: intent.expiresAt,
      confirmedAt: intent.finalizedAt,
      payment,
      receipt,
    };
  }

  listDonations(
    viewerUserId: number,
    campaignId: number,
    limit = 50,
    cursor?: string,
  ): { items: Record<string, unknown>[]; nextCursor: string | null } {
    const campaign = this.mustGetCampaign(this.state, campaignId);
    this.ensureCanViewCampaign(viewerUserId, campaign);
    const donations = [...this.state.donationIntents.values()]
      .filter((intent) => intent.campaignId === campaignId && intent.status === 'SUCCEEDED')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const sliced = this.sliceByCursor(donations, limit, cursor);
    return {
      items: sliced.map((intent) => this.donationItemPayload(intent, viewerUserId)),
      nextCursor:
        sliced.length === limit && sliced.length > 0 ? String(sliced[sliced.length - 1]!.id) : null,
    };
  }

  getPaymentStatus(viewerUserId: number, referenceId: string): Record<string, unknown> {
    const intent = this.findIntentByReference(referenceId);
    if (!intent) throw new FundraisingContractError('NOT_FOUND', 'Donation not found', 404);
    if (
      intent.donorUserId !== viewerUserId &&
      this.mustGetCampaign(this.state, intent.campaignId).ownerUserId !== viewerUserId
    ) {
      throw new FundraisingContractError('FORBIDDEN', 'Donation not found', 403);
    }
    return this.getDonationAttemptByReference(viewerUserId, referenceId);
  }

  handleWebhook(input: WebhookInput): Record<string, unknown> {
    return this.transaction((state) => {
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
    account.presentAddress = 'Dhaka';
    account.permanentAddress = 'Dhaka';
    account.occupation = 'Volunteer';
    account.area = 'Dhaka';
    account.submittedAt = now;
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
      presentAddress: null,
      permanentAddress: null,
      occupation: null,
      verificationDraftJson: null,
      area: null,
      rejectionReason: null,
      submittedAt: null,
      documents: [],
      countryCode: null,
      countryName: null,
      stateName: null,
      cityName: null,
      addressLine: null,
      latitude: null,
      longitude: null,
      formattedAddress: null,
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
      bdDivisionId: parseNumber(input.bdDivisionId),
      bdDistrictId: parseNumber(input.bdDistrictId),
      bdUpazilaId: parseNumber(input.bdUpazilaId),
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
      bdDivisionId: draft.bdDivisionId,
      bdDistrictId: draft.bdDistrictId,
      bdUpazilaId: draft.bdUpazilaId,
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

  private mustOwnCampaign(state: StoreState, userId: number, campaignId: number): CampaignRecord {
    const campaign = this.mustGetCampaign(state, campaignId);
    if (
      campaign.ownerUserId !== userId &&
      !hasRole(this.principalForUser(userId), 'admin') &&
      !hasPermission(this.principalForUser(userId), 'fundraising:manage:any')
    ) {
      throw new FundraisingContractError('FORBIDDEN', 'Campaign not found', 403);
    }
    return campaign;
  }

  private mustOwnUpdate(state: StoreState, userId: number, updateId: number): CampaignUpdateRecord {
    const update = state.updates.get(updateId);
    if (!update || update.deletedAt !== null)
      throw new FundraisingContractError('NOT_FOUND', 'Update not found', 404);
    const campaign = this.mustGetCampaign(state, update.campaignId);
    if (campaign.ownerUserId !== userId)
      throw new FundraisingContractError('FORBIDDEN', 'Update not found', 403);
    return update;
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
      last3Donors,
      account: this.getAccount(campaign.ownerUserId),
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
      bdDivisionId: draft.bdDivisionId,
      bdDistrictId: draft.bdDistrictId,
      bdUpazilaId: draft.bdUpazilaId,
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
      payment: payment
        ? {
            provider: payment.provider,
            redirectUrl: payment.redirectUrl,
            providerPaymentId: payment.providerPaymentId,
            logId: payment.logId,
            paymentAttemptId: payment.id,
          }
        : null,
      reused,
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
      presentAddress: account.presentAddress,
      permanentAddress: account.permanentAddress,
      occupation: account.occupation,
      verificationDraftJson: account.verificationDraftJson,
      area: account.area,
      rejectionReason: account.rejectionReason,
      submittedAt: account.submittedAt,
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
      readiness: this.accountReadinessPayload(account),
    };
  }

  private accountReadinessPayload(
    account: FundraisingAccountRecord,
  ): Record<string, unknown> & { canStartFundraiser: boolean } {
    const missingProfileFields: string[] = [];
    if (!normalizeText(account.presentAddress)) missingProfileFields.push('presentAddress');
    if (!normalizeText(account.permanentAddress)) missingProfileFields.push('permanentAddress');
    if (!normalizeText(account.area) && !normalizeText(account.formattedAddress))
      missingProfileFields.push('location');
    if (!account.submittedAt) missingProfileFields.push('submittedAt');
    const missingDocumentTypes = account.documents.some((document) => document.deletedAt === null)
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
      type: media.type,
      mimetype: media.mimetype,
    };
  }

  private mustGetMedia(mediaId: number): MediaRef {
    const media = this.socialStore.getMedia(mediaId);
    if (!media) throw new FundraisingContractError('NOT_FOUND', 'Media not found', 404);
    return {
      id: media.id,
      url: media.url,
      mimetype: media.mimetype,
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
      throw new FundraisingContractError('FORBIDDEN', 'Media not found', 403);
    }
  }

  private ensureCanViewCampaign(viewerUserId: number, campaign: CampaignRecord): void {
    if (
      campaign.ownerUserId !== viewerUserId &&
      this.socialStore.isBlocked(viewerUserId, campaign.ownerUserId)
    ) {
      throw new FundraisingContractError('FORBIDDEN', 'Campaign not found', 403);
    }
    if (campaign.deletedAt !== null)
      throw new FundraisingContractError('NOT_FOUND', 'Campaign not found', 404);
  }

  private canViewerSeeCampaign(viewerUserId: number, campaign: CampaignRecord): boolean {
    if (campaign.deletedAt !== null) return false;
    if (this.socialStore.isBlocked(viewerUserId, campaign.ownerUserId)) return false;
    return campaign.status !== 'ARCHIVED' && campaign.status !== 'REJECTED';
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
    if (!draft.targetAmountMinor || draft.targetAmountMinor <= 0n)
      missing.push('targetAmountMinor');
    const end = draft.endsAt ?? draft.deadline;
    if (draft.fundingMode === 'ONE_TIME' && !end) missing.push('deadline');
    for (const mediaId of draft.mediaIds) {
      if (!this.socialStore.isMediaOwnedBy(draft.ownerUserId, mediaId)) {
        missing.push(`mediaIds:${mediaId}`);
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
    if (!['ACTIVE', 'PENDING_REVIEW'].includes(campaign.status)) {
      throw new FundraisingContractError(
        'VALIDATION',
        `This fundraiser is not accepting donations`,
        422,
      );
    }
    const end = campaign.endsAt ?? campaign.deadline;
    if (end && end.getTime() < this.now().getTime()) {
      throw new FundraisingContractError('VALIDATION', 'This fundraiser has expired', 422);
    }
    if (
      campaign.targetAmountMinor &&
      campaign.stats.raisedAmountMinor >= campaign.targetAmountMinor
    ) {
      throw new FundraisingContractError('VALIDATION', 'This fundraiser reached its goal', 422);
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

  private receiptsForIntent(intentId: number): Record<string, unknown> | null {
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
      draft.targetAmountMinor = parseMoneyMinor(input.targetAmountMinor, 'targetAmountMinor');
    if (input.monthlyGoalMinor !== undefined)
      draft.monthlyGoalMinor = parseMoneyMinor(input.monthlyGoalMinor, 'monthlyGoalMinor');
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
    if (input.bdUpazilaId !== undefined) draft.bdUpazilaId = parseNumber(input.bdUpazilaId);
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

function normalizeCurrency(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

function normalizeFundingMode(value: unknown): FundraisingFundingMode | null {
  const text = normalizeText(value)?.toUpperCase();
  if (!text) return null;
  return text === 'RECURRING' ? 'RECURRING' : 'ONE_TIME';
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
