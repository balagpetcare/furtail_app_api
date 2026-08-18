import { Prisma } from '@prisma/client';
import type { MediaStatus, PrismaClient } from '@prisma/client';
import type {
  MediaStorageAdapter,
  StoredMediaDescriptor,
  UploadedMediaInput,
} from '../media/media-storage';
import { buildMediaPublicUrl } from '../media/media-storage';
import { InMemoryMediaStorageAdapter } from '../media/media-storage';
import type { AuthenticatedPrincipal } from '../../security/principal';

export type ProfileVisibility = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
export type PostPrivacy = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
export type PostType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL';
export type PostCategory = 'GENERAL' | 'FUNDRAISING';
export type CommentStatus = 'ACTIVE' | 'DELETED';

export interface SocialPrincipalLike {
  sub: string;
  email?: string;
  name?: string;
}

export interface ResolvedIdentity {
  id: number;
  username?: string;
  displayName?: string;
  email?: string;
}

export interface StoryFeedItem {
  id: number;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  isViewedByMe: boolean;
  isOwnStory: boolean;
}

export type IdentityResolver = (principal: SocialPrincipalLike) => Promise<ResolvedIdentity | null>;

/**
 * Maps a Central Auth principal to the local Furtail user record used for
 * ownership checks. When a real database is configured, this goes through
 * `UserCentralAuthLink` (via `getOrProvisionUser`) — the same JIT-provisioning
 * path `/api/v1/auth/me` uses — so a `sub` never needs to already be a small
 * integer to resolve.
 *
 * When no database is configured (local in-memory dev/test fixtures, where
 * `DATABASE_URL` is intentionally empty), we fall back to treating `sub` as
 * an already-local numeric id so the seeded demo users keep working. This
 * fallback never applies once `DATABASE_URL` is set, so it cannot mask a
 * misconfiguration in a real deployment.
 */
async function defaultIdentityResolver(
  principal: SocialPrincipalLike,
): Promise<ResolvedIdentity | null> {
  const { env } = await import('../../config/env');
  if (env.DATABASE_URL) {
    const { getOrProvisionUser } = await import('../auth/auth.service');
    const profile = await getOrProvisionUser({
      sub: principal.sub,
      issuer: 'social-store',
      audience: 'social-store',
      clientId: 'social-store',
      expiresAt: Number.MAX_SAFE_INTEGER,
      issuedAt: 0,
      roles: [],
      permissions: [],
      scopes: [],
      email: principal.email,
      name: principal.name,
      claims: {},
    } satisfies AuthenticatedPrincipal);
    return {
      id: profile.id,
      username: profile.username ?? profile.profile?.username,
      displayName: profile.displayName ?? profile.profile?.displayName,
      email: profile.email,
    };
  }
  const parsed = parseIntStrict(principal.sub);
  return parsed ? { id: parsed } : null;
}

export type NotificationChannel = 'IN_APP' | 'PUSH';
export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';
export type NotificationKind =
  | 'follow'
  | 'like'
  | 'comment'
  | 'reply'
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'user_followed'
  | 'pet_followed'
  | 'pet_liked'
  | 'announcement'
  | 'emergency'
  | 'general';

export interface NotificationRecord {
  id: number;
  recipientId: number;
  type: NotificationKind;
  title: string;
  body: string;
  actorId: number | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
  deepLink: string | null;
  createdAt: Date;
  readAt: Date | null;
  deliveryStatus: NotificationDeliveryStatus;
  deliveryAttempts: number;
  lastDeliveryError: string | null;
  sourceKey: string;
}

export interface DeviceTokenRecord {
  id: number;
  userId: number;
  token: string;
  platform: string;
  provider: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
}

export interface ReportRecord {
  id: number;
  reporterId: number;
  type: string;
  targetId: number;
  reasonCode: string;
  details: string | null;
  createdAt: Date;
  status: 'SUBMITTED' | 'DUPLICATE';
  sourceKey: string;
}

export interface BlockedUserRecord {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: Date;
}

export interface StoryRecord {
  id: number;
  userId: number;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string | null;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
}

interface MediaRecord {
  id: number;
  ownerUserId: number;
  filename: string;
  mimetype: string;
  size: number;
  storageKey: string;
  url: string;
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  status: MediaStatus;
  processingError: string | null;
  createdAt: Date;
  /** What this upload is for (e.g. 'post', 'fundraising_draft', 'adoption_draft', 'generic'). */
  purpose: string;
  /** Content type this media is bound to (e.g. 'FUNDRAISING_DRAFT', 'POST'), if known at upload time. */
  contentType: string | null;
  /** Content id this media is bound to (draft ids are strings, post/campaign ids are numeric-as-string). */
  contentId: string | null;
  uploadIdempotencyKey: string | null;
}

function mapMediaRowToRecord(row: {
  id: number;
  ownerUserId: number;
  filename: string;
  mimetype: string;
  size: number;
  storageKey: string;
  url: string;
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  status: MediaStatus;
  processingError: string | null;
  createdAt: Date;
  purpose: string | null;
  contentType: string | null;
  contentId: string | null;
  uploadIdempotencyKey: string | null;
}): MediaRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    filename: row.filename,
    mimetype: row.mimetype,
    size: row.size,
    storageKey: row.storageKey,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    hlsUrl: row.hlsUrl,
    status: row.status,
    processingError: row.processingError,
    createdAt: row.createdAt,
    purpose: row.purpose ?? 'generic',
    contentType: row.contentType,
    contentId: row.contentId,
    uploadIdempotencyKey: row.uploadIdempotencyKey,
  };
}

function toPublicMediaStatus(status: MediaStatus): 'READY' | 'PROCESSING' | 'FAILED' {
  switch (status) {
    case 'READY':
      return 'READY';
    case 'PROCESSING':
      return 'PROCESSING';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'FAILED';
  }
}

/** Matches common social-platform norms (Instagram/Facebook allow ~10). */
const MAX_POST_MEDIA_ITEMS = 10;

interface PersistedPostRow {
  id: number;
  authorId: number;
  type: string;
  category: string;
  caption: string | null;
  context: string | null;
  privacy: string;
  backgroundStyle: string | null;
  postType: string | null;
  lostPetName: string | null;
  lostPetLocation: string | null;
  lostPetContactVisible: boolean;
  locationTag: string | null;
  feelingId: string | null;
  feelingLabel: string | null;
  feelingEmoji: string | null;
  activityId: string | null;
  activityLabel: string | null;
  activityEmoji: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songStartMs: number | null;
  songDurationMs: number | null;
  fundraisingCampaignId: number | null;
  shareCount: number;
  viewCount: number;
  status: string;
  createIdempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  media: { position: number; media: Parameters<typeof mapMediaRowToRecord>[0] }[];
  taggedPets: { petId: number }[];
}

/**
 * PostMedia rows arrive in whatever order Prisma returns them in unless
 * explicitly ordered by the caller's `orderBy` — this function is the single
 * place that imposes `position` order on the mapped id list, so every
 * caller (fresh load, cache-miss reload after restart) gets identical
 * ordering regardless of query shape.
 */
function mapPostRowToRecord(row: PersistedPostRow): PostRecord {
  return {
    id: row.id,
    authorId: row.authorId,
    type: row.type as PostType,
    category: row.category as PostCategory,
    caption: row.caption,
    context: row.context,
    privacy: row.privacy as PostPrivacy,
    backgroundStyle: row.backgroundStyle,
    postType: row.postType,
    lostPetName: row.lostPetName,
    lostPetLocation: row.lostPetLocation,
    lostPetContactVisible: row.lostPetContactVisible,
    locationTag: row.locationTag,
    feelingId: row.feelingId,
    feelingLabel: row.feelingLabel,
    feelingEmoji: row.feelingEmoji,
    activityId: row.activityId,
    activityLabel: row.activityLabel,
    activityEmoji: row.activityEmoji,
    songTitle: row.songTitle,
    songArtist: row.songArtist,
    songStartMs: row.songStartMs,
    songDurationMs: row.songDurationMs,
    fundraisingCampaignId: row.fundraisingCampaignId,
    mediaIds: [...row.media].sort((a, b) => a.position - b.position).map((m) => m.media.id),
    taggedPetIds: row.taggedPets.map((t) => t.petId),
    shareCount: row.shareCount,
    viewCount: row.viewCount,
    status: row.status as 'ACTIVE' | 'DELETED',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const POST_PERSISTENCE_INCLUDE = {
  // Full Media row (not just the id) so callers can warm the media cache
  // in the same query — without this, serializePost's mediaPayload() would
  // hit a cache miss (and throw "Media not found") for any post loaded
  // fresh from Prisma after a cold start, since the media cache and the
  // post cache are otherwise populated independently.
  media: { select: { position: true, media: true } },
  taggedPets: { select: { petId: true } },
} as const;

interface PostCreateFields {
  caption: string | null;
  type: PostType;
  category: PostCategory;
  privacy: PostPrivacy;
  backgroundStyle: string | null;
  postType: string | null;
  lostPetName: string | null;
  lostPetLocation: string | null;
  lostPetContactVisible: boolean;
  mediaIds: number[];
  taggedPetIds: number[];
  songTitle: string | null;
  songArtist: string | null;
  songStartMs: number | null;
  songDurationMs: number | null;
  locationTag: string | null;
  feelingId: string | null;
  feelingLabel: string | null;
  feelingEmoji: string | null;
  activityId: string | null;
  activityLabel: string | null;
  activityEmoji: string | null;
}

/**
 * Deterministic representation of "what this Create Post request would
 * produce", used to detect the case the idempotency design explicitly
 * calls out: same user + same key + a genuinely different payload. Built
 * from already-persisted/already-known fields rather than a separately
 * stored hash, so there's no extra schema surface to keep in sync.
 */
function buildPostFingerprint(fields: PostCreateFields): string {
  return JSON.stringify({
    ...fields,
    mediaIds: [...fields.mediaIds].sort((a, b) => a - b),
    taggedPetIds: [...fields.taggedPetIds].sort((a, b) => a - b),
  });
}

function fingerprintFromPostRecord(post: PostRecord): string {
  return buildPostFingerprint({
    caption: post.caption,
    type: post.type,
    category: post.category,
    privacy: post.privacy,
    backgroundStyle: post.backgroundStyle,
    postType: post.postType,
    lostPetName: post.lostPetName,
    lostPetLocation: post.lostPetLocation,
    lostPetContactVisible: post.lostPetContactVisible,
    mediaIds: post.mediaIds,
    taggedPetIds: post.taggedPetIds,
    songTitle: post.songTitle,
    songArtist: post.songArtist,
    songStartMs: post.songStartMs,
    songDurationMs: post.songDurationMs,
    locationTag: post.locationTag,
    feelingId: post.feelingId,
    feelingLabel: post.feelingLabel,
    feelingEmoji: post.feelingEmoji,
    activityId: post.activityId,
    activityLabel: post.activityLabel,
    activityEmoji: post.activityEmoji,
  });
}

interface UserRecord {
  id: number;
  auth: { email: string; phone: string | null };
  profile: {
    displayName: string;
    username: string;
    bio: string | null;
    visibility: ProfileVisibility;
    showEmail: boolean;
    showPhone: boolean;
    avatarMediaId: number | null;
    coverMediaId: number | null;
    education: string | null;
    placeLive: string | null;
    fansAndFriends: string | null;
    from: string | null;
    profileType: string | null;
    workStatus: string | null;
    religiousStatus: string | null;
    gender: string | null;
    birthdate: Date | null;
    maritalStatus: string | null;
    isLocked: boolean;
  };
  wallet: { points: number; balance: number; tier: string | null };
  createdAt: Date;
}

interface PostRecord {
  id: number;
  authorId: number;
  type: PostType;
  category: PostCategory;
  caption: string | null;
  context: string | null;
  privacy: PostPrivacy;
  backgroundStyle: string | null;
  postType: string | null;
  lostPetName: string | null;
  lostPetLocation: string | null;
  lostPetContactVisible: boolean;
  locationTag: string | null;
  feelingId: string | null;
  feelingLabel: string | null;
  feelingEmoji: string | null;
  activityId: string | null;
  activityLabel: string | null;
  activityEmoji: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songStartMs: number | null;
  songDurationMs: number | null;
  fundraisingCampaignId: number | null;
  mediaIds: number[];
  taggedPetIds: number[];
  shareCount: number;
  viewCount: number;
  status: 'ACTIVE' | 'DELETED';
  createdAt: Date;
  updatedAt: Date;
}

interface CommentRecord {
  id: number;
  postId: number;
  authorId: number;
  parentId: number | null;
  text: string;
  isEdited: boolean;
  attachmentMediaId: number | null;
  status: CommentStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface FriendRequestRecord {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED';
  createdAt: Date;
  updatedAt: Date;
}

export interface GalleryItemRecord {
  id: number;
  mediaId: number;
  createdAt: Date;
}

export interface UserReferencePayload {
  id: number;
  username: string;
  displayName: string;
}

export interface SocialMediaUploadResult {
  id: number;
  url: string;
  hlsUrl: string | null;
  mimetype: string;
  status: 'READY' | 'PROCESSING' | 'FAILED';
  thumbnailUrl: string | null;
}

export interface SocialUserDetailPayload {
  id: number;
  auth: { email: string; phone: string | null };
  profile: Record<string, unknown>;
  wallet: Record<string, unknown>;
  pets: Array<Record<string, unknown>>;
  galleryItems: Array<Record<string, unknown>>;
  achievements: Array<Record<string, unknown>>;
  followerPreviewUrls: string[];
  followersCount: number;
  followingCount: number;
  canViewFullProfile: boolean;
  isProfileLocked: boolean;
  status?: string;
}

export interface SocialPostPayload {
  id: number;
  type: PostType;
  category: PostCategory;
  caption: string | null;
  context: string | null;
  createdAt: string;
  author: Record<string, unknown>;
  media: Array<Record<string, unknown>>;
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  isBookmarkedByMe: boolean;
  privacy: PostPrivacy;
  backgroundStyle: string | null;
  feelingId: string | null;
  feelingLabel: string | null;
  feelingEmoji: string | null;
  activityId: string | null;
  activityLabel: string | null;
  activityEmoji: string | null;
  shareCount: number;
  viewCount: number;
  isReportedByMe: boolean;
  isFollowingAuthor: boolean;
  sponsoredLabel: string | null;
  locationTag: string | null;
  postType: string | null;
  lostPetName: string | null;
  lostPetLocation: string | null;
  lostPetContactVisible: boolean;
  taggedPetIds: number[];
  taggedPets: Array<Record<string, unknown>>;
  songTitle: string | null;
  songArtist: string | null;
  songStartMs: number | null;
  songDurationMs: number | null;
  _count: { likes: number; comments: number };
}

export interface SocialCommentPayload {
  id: number;
  text: string;
  createdAt: string;
  updatedAt: string;
  user: Record<string, unknown>;
  likeCount: number;
  isLikedByMe: boolean;
  parentId: number | null;
  isEdited: boolean;
  attachmentUrl: string | null;
  replyCount: number;
}

export interface SocialPostListResult {
  items: SocialPostPayload[];
  nextCursor: string | null;
  hasMore: boolean;
  page: number;
  limit: number;
}

export interface SocialCommentListResult {
  items: SocialCommentPayload[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface SocialProfileUpdateInput {
  displayName?: string | null;
  username?: string | null;
  bio?: string | null;
  visibility?: ProfileVisibility | null;
  showEmail?: boolean | null;
  showPhone?: boolean | null;
  avatarMediaId?: number | null;
  coverMediaId?: number | null;
  education?: string | null;
  placeLive?: string | null;
  from?: string | null;
  profileType?: string | null;
  workStatus?: string | null;
  religiousStatus?: string | null;
  gender?: string | null;
  birthdate?: string | Date | null;
  maritalStatus?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface SocialPostUpsertInput {
  caption?: string | null;
  type?: PostType | string | null;
  category?: PostCategory | string | null;
  mediaIds?: number[] | null;
  privacy?: PostPrivacy | string | null;
  postType?: string | null;
  backgroundStyle?: string | null;
  lostPetName?: string | null;
  lostPetLocation?: string | null;
  lostPetContactVisible?: boolean | null;
  taggedPetIds?: number[] | null;
  songTitle?: string | null;
  songArtist?: string | null;
  songStartMs?: number | null;
  songDurationMs?: number | null;
  locationText?: string | null;
  feelingId?: string | null;
  feelingLabel?: string | null;
  feelingEmoji?: string | null;
  activityId?: string | null;
  activityLabel?: string | null;
  activityEmoji?: string | null;
  idempotencyKey?: string | null;
}

export interface SocialMediaLookupPayload {
  id: number;
  ownerUserId: number;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  status: 'READY' | 'PROCESSING' | 'FAILED';
  processingError: string | null;
  createdAt: string;
}

function keyPair(a: number, b: number): string {
  return `${a}:${b}`;
}

function uniqueByLowercase(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

function parseIntStrict(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildCursor(id: number): string {
  return String(id);
}

function cursorToNumber(cursor: unknown): number | null {
  return parseIntStrict(cursor);
}

export interface NotificationDeliveryProvider {
  deliver(input: {
    recipientId: number;
    notification: NotificationRecord;
    deviceTokens: DeviceTokenRecord[];
  }): Promise<void>;
}

export const NoopNotificationDeliveryProvider: NotificationDeliveryProvider = {
  async deliver() {
    return;
  },
};

export class SocialCoreStore {
  private readonly storage: MediaStorageAdapter;
  private readonly notificationProvider: NotificationDeliveryProvider;
  private readonly mediaPrisma: PrismaClient | null;
  private nextMediaId = 1;
  private nextPostId = 1;
  private nextCommentId = 1;
  private nextFriendRequestId = 1;
  private nextNotificationId = 1;
  private nextDeviceTokenId = 1;
  private nextReportId = 1;
  private nextStoryId = 1;

  private readonly users = new Map<number, UserRecord>();
  private readonly media = new Map<number, MediaRecord>();
  private readonly posts = new Map<number, PostRecord>();
  private readonly comments = new Map<number, CommentRecord>();
  private readonly gallery = new Map<number, GalleryItemRecord[]>();
  private readonly follows = new Set<string>();
  private readonly profileLikes = new Set<string>();
  private readonly postLikes = new Set<string>();
  private readonly commentLikes = new Set<string>();
  private readonly bookmarks = new Set<string>();
  private readonly blocks = new Set<string>();
  private readonly blockRecords = new Map<string, Date>();
  // muterId:mutedUserId (directional — I don't see them, they can still see me)
  private readonly mutes = new Set<string>();
  // restricterId:restrictedUserId (directional — their comments on MY
  // content become hidden from other viewers, per restrictUser below)
  private readonly restricts = new Set<string>();
  private readonly friendRequests = new Map<number, FriendRequestRecord>();
  private readonly friends = new Set<string>();
  private readonly notifications = new Map<number, NotificationRecord>();
  private readonly deviceTokens = new Map<number, DeviceTokenRecord>();
  private readonly deviceTokenByKey = new Map<string, number>();
  private readonly notificationsBySource = new Map<string, number>();
  private readonly reports = new Map<number, ReportRecord>();
  private readonly reportsBySource = new Map<string, number>();
  private readonly stories = new Map<number, StoryRecord>();
  private readonly storyViews = new Map<number, Set<number>>();
  private readonly notificationPreferences = new Map<
    number,
    { allowEmail: boolean; allowSms: boolean }
  >();

  constructor(
    storage: MediaStorageAdapter = new InMemoryMediaStorageAdapter(),
    notificationProvider: NotificationDeliveryProvider = NoopNotificationDeliveryProvider,
    identityResolver: IdentityResolver = defaultIdentityResolver,
    mediaPrisma: PrismaClient | null = null,
  ) {
    this.storage = storage;
    this.notificationProvider = notificationProvider;
    this.identityResolver = identityResolver;
    this.mediaPrisma = mediaPrisma;
    this.seed();
  }

  private readonly identityResolver: IdentityResolver;

  reset(): void {
    this.nextMediaId = 1;
    this.nextPostId = 1;
    this.nextCommentId = 1;
    this.nextFriendRequestId = 1;
    this.nextStoryId = 1;
    this.users.clear();
    this.media.clear();
    this.posts.clear();
    this.comments.clear();
    this.gallery.clear();
    this.follows.clear();
    this.profileLikes.clear();
    this.postLikes.clear();
    this.commentLikes.clear();
    this.bookmarks.clear();
    this.blocks.clear();
    this.blockRecords.clear();
    this.friendRequests.clear();
    this.friends.clear();
    this.notifications.clear();
    this.deviceTokens.clear();
    this.deviceTokenByKey.clear();
    this.notificationsBySource.clear();
    this.reports.clear();
    this.reportsBySource.clear();
    this.stories.clear();
    this.storyViews.clear();
    this.notificationPreferences.clear();
    this.seed();
  }

  private seed(): void {
    const avatar = this.createMediaRecord({
      ownerUserId: 1,
      filename: 'avatar-1.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      purpose: 'profile',
    });
    const cover = this.createMediaRecord({
      ownerUserId: 1,
      filename: 'cover-1.jpg',
      mimetype: 'image/jpeg',
      size: 2048,
      purpose: 'profile',
    });
    const postImage = this.createMediaRecord({
      ownerUserId: 2,
      filename: 'post-2.jpg',
      mimetype: 'image/jpeg',
      size: 4096,
      purpose: 'post',
    });
    const postVideo = this.createMediaRecord({
      ownerUserId: 2,
      filename: 'post-3.mp4',
      mimetype: 'video/mp4',
      size: 8192,
      purpose: 'post',
    });

    this.users.set(1, {
      id: 1,
      auth: { email: 'amina@example.com', phone: '+8801000000001' },
      profile: {
        displayName: 'Amina Rahman',
        username: 'amina',
        bio: 'Pet parent and volunteer',
        visibility: 'PUBLIC',
        showEmail: true,
        showPhone: false,
        avatarMediaId: avatar.id,
        coverMediaId: cover.id,
        education: 'Dhaka University',
        placeLive: 'Dhaka',
        fansAndFriends: '5.2K',
        from: 'Dhaka',
        profileType: 'PERSONAL',
        workStatus: 'Working',
        religiousStatus: null,
        gender: 'FEMALE',
        birthdate: new Date('1992-01-20T00:00:00.000Z'),
        maritalStatus: 'Single',
        isLocked: false,
      },
      wallet: { points: 1200, balance: 150.5, tier: 'GOLD' },
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    this.users.set(2, {
      id: 2,
      auth: { email: 'zara@example.com', phone: null },
      profile: {
        displayName: 'Zara Khan',
        username: 'zara',
        bio: 'Video creator',
        visibility: 'FOLLOWERS_ONLY',
        showEmail: false,
        showPhone: false,
        avatarMediaId: postImage.id,
        coverMediaId: null,
        education: null,
        placeLive: 'Chattogram',
        fansAndFriends: null,
        from: 'Chattogram',
        profileType: 'PERSONAL',
        workStatus: 'Creator',
        religiousStatus: null,
        gender: 'FEMALE',
        birthdate: null,
        maritalStatus: null,
        isLocked: false,
      },
      wallet: { points: 320, balance: 42, tier: 'SILVER' },
      createdAt: new Date('2024-02-01T00:00:00.000Z'),
    });
    this.users.set(3, {
      id: 3,
      auth: { email: 'rahim@example.com', phone: '+8801000000003' },
      profile: {
        displayName: 'Rahim Ali',
        username: 'rahim',
        bio: 'Friendly neighbor',
        visibility: 'PUBLIC',
        showEmail: false,
        showPhone: false,
        avatarMediaId: postVideo.id,
        coverMediaId: null,
        education: null,
        placeLive: 'Sylhet',
        fansAndFriends: null,
        from: 'Sylhet',
        profileType: 'PERSONAL',
        workStatus: 'Student',
        religiousStatus: null,
        gender: 'MALE',
        birthdate: null,
        maritalStatus: null,
        isLocked: false,
      },
      wallet: { points: 50, balance: 10, tier: null },
      createdAt: new Date('2024-03-01T00:00:00.000Z'),
    });

    this.gallery.set(1, [
      { id: 1, mediaId: avatar.id, createdAt: new Date('2024-04-01T00:00:00.000Z') },
    ]);
    this.gallery.set(2, [
      { id: 2, mediaId: postImage.id, createdAt: new Date('2024-04-02T00:00:00.000Z') },
    ]);

    this.createPostRecord({
      authorId: 1,
      type: 'IMAGE',
      category: 'GENERAL',
      caption: 'Morning walk with Luna',
      privacy: 'PUBLIC',
      mediaIds: [avatar.id],
      taggedPetIds: [11],
    });
    const post2 = this.createPostRecord({
      authorId: 2,
      type: 'VIDEO',
      category: 'GENERAL',
      caption: 'Training session',
      privacy: 'PUBLIC',
      mediaIds: [postVideo.id],
      postType: 'HEALTH_UPDATE',
      taggedPetIds: [],
      locationTag: 'Dhaka',
    });
    this.likePost(1, post2.id);
    this.bookmarkPost(1, post2.id);

    const comment = this.createCommentRecord({
      postId: post2.id,
      authorId: 1,
      text: 'Great progress!',
      parentId: null,
    });
    this.replyComment(2, post2.id, comment.id, 'Thanks!');
    this.likeComment(1, post2.id, comment.id);
  }

  private createMediaRecord(input: {
    ownerUserId: number;
    filename: string;
    mimetype: string;
    size: number;
    purpose?: 'profile' | 'post' | 'gallery' | 'generic';
  }): MediaRecord {
    const storageKey = `legacy/${input.ownerUserId}/${this.nextMediaId}/${encodeURIComponent(input.filename)}`;
    const stored = {
      storageKey,
      publicUrl: buildMediaPublicUrl(storageKey),
      thumbnailUrl: input.mimetype.startsWith('image/') ? buildMediaPublicUrl(storageKey) : null,
      hlsUrl: input.mimetype.startsWith('video/') ? buildMediaPublicUrl(storageKey) : null,
      status: 'READY' as const,
      processingError: null,
    };
    return this.addMediaRecord({
      ownerUserId: input.ownerUserId,
      filename: input.filename,
      mimetype: input.mimetype,
      size: input.size,
      stored,
      purpose: input.purpose,
    });
  }

  private addMediaRecord(input: {
    id?: number;
    ownerUserId: number;
    filename: string;
    mimetype: string;
    size: number;
    stored: StoredMediaDescriptor;
    purpose?: string;
    contentType?: string | null;
    contentId?: string | null;
    uploadIdempotencyKey?: string | null;
  }): MediaRecord {
    const media = {
      id: input.id ?? this.nextMediaId++,
      ownerUserId: input.ownerUserId,
      filename: input.filename,
      mimetype: input.mimetype,
      size: input.size,
      storageKey: input.stored.storageKey,
      url: input.stored.publicUrl,
      thumbnailUrl: input.stored.thumbnailUrl ?? null,
      hlsUrl: input.stored.hlsUrl ?? null,
      status: input.stored.status,
      processingError: input.stored.processingError ?? null,
      createdAt: new Date(),
      purpose: input.purpose ?? 'generic',
      contentType: input.contentType ?? null,
      contentId: input.contentId ?? null,
      uploadIdempotencyKey: input.uploadIdempotencyKey ?? null,
    };
    return this.cacheMediaRecord(media);
  }

  private cacheMediaRecord(media: MediaRecord): MediaRecord {
    this.media.set(media.id, media);
    this.nextMediaId = Math.max(this.nextMediaId, media.id + 1);
    return media;
  }

  private async persistMediaRecord(media: MediaRecord): Promise<MediaRecord> {
    if (!this.mediaPrisma) return media;
    const row = await this.mediaPrisma.media.create({
      data: {
        ownerUserId: media.ownerUserId,
        filename: media.filename,
        mimetype: media.mimetype,
        size: media.size,
        storageKey: media.storageKey,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        hlsUrl: media.hlsUrl,
        status: media.status as MediaStatus,
        processingError: media.processingError,
        purpose: media.purpose,
        contentType: media.contentType,
        contentId: media.contentId,
        uploadIdempotencyKey: media.uploadIdempotencyKey,
      },
    });
    return mapMediaRowToRecord(row);
  }

  private async loadPersistedMediaById(mediaId: number): Promise<MediaRecord | null> {
    if (!this.mediaPrisma) return null;
    const row = await this.mediaPrisma.media.findUnique({ where: { id: mediaId } });
    if (!row) return null;
    return this.cacheMediaRecord(mapMediaRowToRecord(row));
  }

  private async loadPersistedMediaByKey(
    ownerUserId: number,
    uploadIdempotencyKey: string,
  ): Promise<MediaRecord | null> {
    if (!this.mediaPrisma) return null;
    const row = await this.mediaPrisma.media.findFirst({
      where: { ownerUserId, uploadIdempotencyKey },
    });
    if (!row) return null;
    return this.cacheMediaRecord(mapMediaRowToRecord(row));
  }

  /**
   * Keyed by `${ownerUserId}:${idempotencyKey}` — a retried upload request
   * (same user, same client-supplied key) returns the already-created media
   * record instead of storing a duplicate file.
   */
  private readonly uploadIdempotencyKeys = new Map<string, number>();

  /**
   * Keyed by `${authorUserId}:${idempotencyKey}` — a retried post creation
   * (same user, same client-supplied key) returns the already-created post
   * instead of creating a duplicate. Scope is per-user to prevent one user's
   * key from colliding with another's.
   */
  private readonly postCreationIdempotencyKeys = new Map<string, number>();

  async uploadMedia(
    ownerUserId: number,
    input: UploadedMediaInput,
    opts: {
      contentType?: string | null;
      contentId?: string | null;
      idempotencyKey?: string | null;
    } = {},
  ): Promise<SocialMediaUploadResult> {
    const idempotencyKey = opts.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const dedupeKey = `${ownerUserId}:${idempotencyKey}`;
      const existingId = this.uploadIdempotencyKeys.get(dedupeKey);
      if (existingId) {
        const existing = this.media.get(existingId);
        if (existing) return this.mediaToUploadResult(existing);
        const persistedExisting = await this.loadPersistedMediaById(existingId);
        if (persistedExisting) return this.mediaToUploadResult(persistedExisting);
      }
      const persistedByKey = await this.loadPersistedMediaByKey(ownerUserId, idempotencyKey);
      if (persistedByKey) {
        this.uploadIdempotencyKeys.set(dedupeKey, persistedByKey.id);
        return this.mediaToUploadResult(persistedByKey);
      }
    }

    const stored = await this.storage.upload(input);
    try {
      const mediaInput = {
        ownerUserId,
        filename: input.filename,
        mimetype: input.mimetype,
        size: input.size,
        stored,
        purpose: input.purpose,
        contentType: opts.contentType,
        contentId: opts.contentId,
        uploadIdempotencyKey: idempotencyKey,
      };

      const media = this.mediaPrisma
        ? await this.persistUploadedMediaRecord(mediaInput)
        : this.addMediaRecord(mediaInput);

      if (this.mediaPrisma) {
        this.cacheMediaRecord(media);
      }

      if (idempotencyKey) {
        this.uploadIdempotencyKeys.set(`${ownerUserId}:${idempotencyKey}`, media.id);
      }

      return this.mediaToUploadResult(media);
    } catch (error) {
      await this.safeDeleteStoredMedia(stored.storageKey);
      throw error;
    }
  }

  private async safeDeleteStoredMedia(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      void error;
      // Best-effort cleanup. Upload callers still receive the original error.
    }
  }

  private async persistUploadedMediaRecord(input: {
    ownerUserId: number;
    filename: string;
    mimetype: string;
    size: number;
    stored: StoredMediaDescriptor;
    purpose?: string;
    contentType?: string | null;
    contentId?: string | null;
    uploadIdempotencyKey?: string | null;
  }): Promise<MediaRecord> {
    const row = await this.mediaPrisma!.media.create({
      data: {
        ownerUserId: input.ownerUserId,
        filename: input.filename,
        mimetype: input.mimetype,
        size: input.size,
        storageKey: input.stored.storageKey,
        url: input.stored.publicUrl,
        thumbnailUrl: input.stored.thumbnailUrl,
        hlsUrl: input.stored.hlsUrl,
        status: input.stored.status as MediaStatus,
        processingError: input.stored.processingError,
        purpose: input.purpose ?? 'generic',
        contentType: input.contentType,
        contentId: input.contentId,
        uploadIdempotencyKey: input.uploadIdempotencyKey,
      },
    });
    return mapMediaRowToRecord(row);
  }

  private mediaToUploadResult(media: MediaRecord): SocialMediaUploadResult {
    return {
      id: media.id,
      url: media.url,
      hlsUrl: media.hlsUrl,
      mimetype: media.mimetype,
      status: toPublicMediaStatus(media.status),
      thumbnailUrl: media.thumbnailUrl,
    };
  }

  /** Media currently bound to a specific draft/content item — used for orphan detection/cleanup. */
  listMediaByContent(contentType: string, contentId: string): MediaRecord[] {
    return [...this.media.values()].filter(
      (m) => m.contentType === contentType && m.contentId === contentId,
    );
  }

  getUserById(userId: number): UserReferencePayload | null {
    const user = this.users.get(userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.profile.username,
      displayName: user.profile.displayName,
    };
  }

  getUserByUsername(username: string): UserReferencePayload | null {
    const clean = username.trim().replace(/^@+/, '').toLowerCase();
    for (const user of this.users.values()) {
      if (user.profile.username.toLowerCase() === clean) {
        return {
          id: user.id,
          username: user.profile.username,
          displayName: user.profile.displayName,
        };
      }
    }
    return null;
  }

  async resolveUserId(principal: SocialPrincipalLike): Promise<number | null> {
    const resolved = await this.identityResolver(principal);
    if (!resolved || !Number.isFinite(resolved.id) || resolved.id <= 0) return null;
    this.ensureUserShadow(resolved.id, resolved);
    return resolved.id;
  }

  /**
   * Public wrapper for ensureUserShadow, for a caller that already knows a
   * numeric id is a real Prisma user (e.g. an action target the current
   * request resolved via prisma) but which the in-memory store's own
   * per-process cache hasn't seen yet — this happens for any target who
   * hasn't themself authenticated in this process (a real production
   * long-running server accumulates shadows over time from every request
   * that touches a given user; a cold test process has none yet). Never
   * overwrites data for a user the store already knows about beyond the
   * same selective-merge ensureUserShadow already does.
   */
  ensureUserKnown(id: number, profile: ResolvedIdentity): void {
    this.ensureUserShadow(id, profile);
  }

  /** Auto-vivifies a minimal local user record the first time a resolved identity is seen. */
  private ensureUserShadow(id: number, profile: ResolvedIdentity): void {
    const existing = this.users.get(id);
    if (existing) {
      if (profile.username) {
        existing.profile.username =
          profile.username
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 30) || existing.profile.username;
      }
      if (profile.displayName) {
        existing.profile.displayName = profile.displayName;
      }
      if (profile.email) {
        existing.auth.email = profile.email;
      }
      return;
    }
    const fallbackHandle = `user${id}`;
    const username =
      (profile.username || fallbackHandle)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 30) || fallbackHandle;
    this.users.set(id, {
      id,
      auth: { email: profile.email || '', phone: null },
      profile: {
        displayName: profile.displayName || profile.username || `User ${id}`,
        username,
        bio: null,
        visibility: 'PUBLIC',
        showEmail: false,
        showPhone: false,
        avatarMediaId: null,
        coverMediaId: null,
        education: null,
        placeLive: null,
        fansAndFriends: null,
        from: null,
        profileType: 'PERSONAL',
        workStatus: null,
        religiousStatus: null,
        gender: null,
        birthdate: null,
        maritalStatus: null,
        isLocked: false,
      },
      wallet: { points: 0, balance: 0, tier: null },
      createdAt: new Date(),
    });
  }

  getMedia(mediaId: number): SocialMediaLookupPayload | null {
    const media = this.media.get(mediaId);
    return media ? this.mediaToPayload(media) : null;
  }

  isMediaOwnedBy(userId: number, mediaId: number): boolean {
    const media = this.media.get(mediaId);
    return Boolean(media && media.ownerUserId === userId);
  }

  isBlocked(viewerId: number, targetId: number): boolean {
    return (
      this.blocks.has(keyPair(viewerId, targetId)) || this.blocks.has(keyPair(targetId, viewerId))
    );
  }

  blockUser(viewerId: number, targetId: number): BlockedUserRecord {
    if (viewerId === targetId) {
      throw new Error('You cannot block yourself');
    }
    const target = this.mustGetUser(targetId);
    const key = keyPair(viewerId, targetId);
    const avatarMediaId = target.profile.avatarMediaId;
    this.blocks.add(key);
    this.blockRecords.set(key, new Date());
    this.follows.delete(keyPair(viewerId, targetId));
    this.follows.delete(keyPair(targetId, viewerId));
    this.profileLikes.delete(keyPair(targetId, viewerId));
    this.profileLikes.delete(keyPair(viewerId, targetId));
    for (const [requestId, request] of this.friendRequests.entries()) {
      const involved =
        (request.fromUserId === viewerId && request.toUserId === targetId) ||
        (request.fromUserId === targetId && request.toUserId === viewerId);
      if (involved && request.status === 'PENDING') {
        this.friendRequests.delete(requestId);
      }
    }
    return {
      userId: target.id,
      displayName: target.profile.displayName,
      avatarUrl: avatarMediaId ? this.mediaPayload(avatarMediaId).url : null,
      blockedAt: new Date(),
    };
  }

  unblockUser(viewerId: number, targetId: number): void {
    const key = keyPair(viewerId, targetId);
    this.blocks.delete(key);
    this.blockRecords.delete(key);
  }

  listBlockedUsers(viewerId: number): BlockedUserRecord[] {
    const blocked: BlockedUserRecord[] = [];
    for (const pair of this.blocks) {
      const [sourceRaw, targetRaw] = pair.split(':');
      const source = Number(sourceRaw);
      const target = Number(targetRaw);
      if (!Number.isFinite(source) || !Number.isFinite(target) || source !== viewerId) continue;
      const user = this.users.get(target);
      if (!user) continue;
      const avatarMediaId = user.profile.avatarMediaId;
      blocked.push({
        userId: user.id,
        displayName: user.profile.displayName,
        avatarUrl: avatarMediaId ? this.mediaPayload(avatarMediaId).url : null,
        blockedAt: this.blockRecords.get(pair) ?? new Date(),
      });
    }
    return blocked;
  }

  // ─── Mute (directional: hides muted user's posts from the muter's own
  // feed only — the muted user is unaffected and unaware) ──────────────────

  isMuted(muterId: number, targetId: number): boolean {
    return this.mutes.has(keyPair(muterId, targetId));
  }

  muteUser(muterId: number, targetId: number): void {
    if (muterId === targetId) throw new Error('You cannot mute yourself');
    this.mustGetUser(targetId);
    this.mutes.add(keyPair(muterId, targetId));
  }

  unmuteUser(muterId: number, targetId: number): void {
    this.mutes.delete(keyPair(muterId, targetId));
  }

  listMutedUsers(muterId: number): BlockedUserRecord[] {
    const muted: BlockedUserRecord[] = [];
    for (const pair of this.mutes) {
      const [sourceRaw, targetRaw] = pair.split(':');
      const source = Number(sourceRaw);
      const target = Number(targetRaw);
      if (!Number.isFinite(source) || !Number.isFinite(target) || source !== muterId) continue;
      const user = this.users.get(target);
      if (!user) continue;
      const avatarMediaId = user.profile.avatarMediaId;
      muted.push({
        userId: user.id,
        displayName: user.profile.displayName,
        avatarUrl: avatarMediaId ? this.mediaPayload(avatarMediaId).url : null,
        blockedAt: new Date(),
      });
    }
    return muted;
  }

  // ─── Restrict (directional: the restricted user's comments on the
  // RESTRICTER's own content become hidden from every other viewer — only
  // the comment's author and the restricter can still see them; the
  // restricted user is not notified and can otherwise interact normally) ──

  isRestrictedBy(restricterId: number, targetId: number): boolean {
    return this.restricts.has(keyPair(restricterId, targetId));
  }

  restrictUser(restricterId: number, targetId: number): void {
    if (restricterId === targetId) throw new Error('You cannot restrict yourself');
    this.mustGetUser(targetId);
    this.restricts.add(keyPair(restricterId, targetId));
  }

  unrestrictUser(restricterId: number, targetId: number): void {
    this.restricts.delete(keyPair(restricterId, targetId));
  }

  listRestrictedUsers(restricterId: number): BlockedUserRecord[] {
    const restricted: BlockedUserRecord[] = [];
    for (const pair of this.restricts) {
      const [sourceRaw, targetRaw] = pair.split(':');
      const source = Number(sourceRaw);
      const target = Number(targetRaw);
      if (!Number.isFinite(source) || !Number.isFinite(target) || source !== restricterId) continue;
      const user = this.users.get(target);
      if (!user) continue;
      const avatarMediaId = user.profile.avatarMediaId;
      restricted.push({
        userId: user.id,
        displayName: user.profile.displayName,
        avatarUrl: avatarMediaId ? this.mediaPayload(avatarMediaId).url : null,
        blockedAt: new Date(),
      });
    }
    return restricted;
  }

  getNotificationPreferences(userId: number): { allowEmail: boolean; allowSms: boolean } {
    return this.notificationPreferences.get(userId) ?? { allowEmail: true, allowSms: false };
  }

  updateNotificationPreferences(
    userId: number,
    input: { allowEmail?: boolean; allowSms?: boolean },
  ): { allowEmail: boolean; allowSms: boolean } {
    const current = this.getNotificationPreferences(userId);
    const next = {
      allowEmail: input.allowEmail ?? current.allowEmail,
      allowSms: input.allowSms ?? current.allowSms,
    };
    this.notificationPreferences.set(userId, next);
    return next;
  }

  registerDeviceToken(
    userId: number,
    input: { token: string; platform: string; provider?: string },
  ): { id: number; token: string; platform: string; provider: string; replaced: boolean } {
    const token = normalizeText(input.token);
    if (!token) {
      throw new Error('Token is required');
    }
    const platform = normalizeText(input.platform)?.toLowerCase() ?? 'unknown';
    const provider = normalizeText(input.provider)?.toLowerCase() ?? 'fcm';
    const composite = `${userId}:${provider}:${platform}`;
    const existingId = this.deviceTokenByKey.get(composite);
    const now = new Date();
    if (existingId) {
      const existing = this.deviceTokens.get(existingId);
      if (existing) {
        const replaced = existing.token !== token;
        if (existing.token !== token) {
          this.deviceTokenByKey.delete(
            `${existing.userId}:${existing.provider}:${existing.platform}`,
          );
          existing.token = token;
          existing.updatedAt = now;
        }
        existing.isActive = true;
        existing.lastSeenAt = now;
        this.deviceTokenByKey.set(composite, existing.id);
        this.deviceTokenByKey.set(
          `${existing.userId}:${existing.provider}:${existing.platform}`,
          existing.id,
        );
        return {
          id: existing.id,
          token: existing.token,
          platform: existing.platform,
          provider: existing.provider,
          replaced,
        };
      }
    }

    const record: DeviceTokenRecord = {
      id: this.nextDeviceTokenId++,
      userId,
      token,
      platform,
      provider,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    this.deviceTokens.set(record.id, record);
    this.deviceTokenByKey.set(composite, record.id);
    this.deviceTokenByKey.set(`${userId}:${provider}:${platform}`, record.id);
    return {
      id: record.id,
      token: record.token,
      platform: record.platform,
      provider,
      replaced: false,
    };
  }

  unregisterDeviceTokens(
    userId: number,
    input?: { token?: string | null; platform?: string | null; provider?: string | null },
  ): number {
    let count = 0;
    for (const record of this.deviceTokens.values()) {
      if (record.userId !== userId || !record.isActive) continue;
      if (input?.token && record.token !== input.token) continue;
      if (input?.platform && record.platform !== input.platform.toLowerCase()) continue;
      if (input?.provider && record.provider !== input.provider.toLowerCase()) continue;
      record.isActive = false;
      record.updatedAt = new Date();
      count += 1;
    }
    return count;
  }

  listNotifications(
    userId: number,
    limit: number,
    cursor?: unknown,
  ): {
    items: Array<Record<string, unknown>>;
    nextCursor: number | null;
    hasMore: boolean;
    unreadCount: number;
  } {
    const items = [...this.notifications.values()]
      .filter((notification) => notification.recipientId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const startAfter = cursorToNumber(cursor);
    const filtered = startAfter
      ? items.filter((item) => item.id < startAfter).slice(0, limit)
      : items.slice(0, limit);
    return {
      items: filtered.map((notification) => this.notificationToPayload(notification)),
      nextCursor: filtered.length === limit ? filtered[filtered.length - 1]!.id : null,
      hasMore: items.length > filtered.length,
      unreadCount: this.getUnreadNotificationCount(userId),
    };
  }

  getUnreadNotificationCount(userId: number): number {
    return [...this.notifications.values()].filter(
      (notification) => notification.recipientId === userId && notification.readAt === null,
    ).length;
  }

  markNotificationRead(userId: number, notificationId: number): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification || notification.recipientId !== userId) return false;
    if (!notification.readAt) notification.readAt = new Date();
    return true;
  }

  markAllNotificationsRead(userId: number): number {
    let updated = 0;
    for (const notification of this.notifications.values()) {
      if (notification.recipientId !== userId || notification.readAt) continue;
      notification.readAt = new Date();
      updated += 1;
    }
    return updated;
  }

  listReportReasons(type: string): Array<{ code: string; label: string }> {
    const normalized = normalizeText(type)?.toUpperCase();
    switch (normalized) {
      case 'POST':
        return [
          { code: 'SPAM', label: 'Spam' },
          { code: 'INAPPROPRIATE', label: 'Inappropriate content' },
          { code: 'ANIMAL_ABUSE', label: 'Animal abuse' },
          { code: 'FALSE_INFO', label: 'False or misleading information' },
          { code: 'HARASSMENT', label: 'Harassment or hate' },
          { code: 'OTHER', label: 'Other' },
        ];
      case 'FUNDRAISING':
        return [
          { code: 'FRAUD', label: 'Fraud / scam' },
          { code: 'MISLEADING', label: 'Misleading fundraising details' },
          { code: 'DUPLICATE', label: 'Duplicate campaign' },
          { code: 'IMPROPER_USE', label: 'Suspicious use of funds' },
          { code: 'INAPPROPRIATE', label: 'Inappropriate content' },
          { code: 'OTHER', label: 'Other' },
        ];
      case 'USER':
        return [
          { code: 'IMPERSONATION', label: 'Impersonation' },
          { code: 'HARASSMENT', label: 'Harassment or hate' },
          { code: 'SPAM', label: 'Spam' },
          { code: 'SCAM', label: 'Scam or suspicious behavior' },
          { code: 'OTHER', label: 'Other' },
        ];
      case 'PET':
        return [
          { code: 'FAKE_PROFILE', label: 'Fake pet profile' },
          { code: 'WRONG_INFO', label: 'Wrong or misleading information' },
          { code: 'ABUSE', label: 'Animal abuse / cruelty' },
          { code: 'SPAM', label: 'Spam' },
          { code: 'OTHER', label: 'Other' },
        ];
      case 'COMMENT':
        return [
          { code: 'SPAM', label: 'Spam' },
          { code: 'INAPPROPRIATE', label: 'Inappropriate comment' },
          { code: 'HARASSMENT', label: 'Harassment or hate speech' },
          { code: 'OTHER', label: 'Other' },
        ];
      default:
        return [];
    }
  }

  createReport(
    reporterId: number,
    input: { type: string; targetId: number; reasonCode: string; details?: string | null },
  ): ReportRecord {
    const type = normalizeText(input.type)?.toUpperCase();
    const reasonCode = normalizeText(input.reasonCode)?.toUpperCase();
    if (!type) throw new Error('Report type is required');
    if (!Number.isFinite(input.targetId) || input.targetId <= 0) throw new Error('Invalid target');
    if (!reasonCode) throw new Error('Report reason is required');
    const details = normalizeText(input.details);
    const sourceKey = `${reporterId}:${type}:${input.targetId}:${reasonCode}:${details ?? ''}`;
    const existingId = this.reportsBySource.get(sourceKey);
    if (existingId) {
      const existing = this.reports.get(existingId);
      if (existing) {
        return existing;
      }
    }
    if (type === 'USER') {
      this.mustGetUser(input.targetId);
    } else if (type === 'POST') {
      this.mustGetPost(input.targetId);
    } else if (type === 'COMMENT') {
      this.mustGetComment(input.targetId);
    }
    const record: ReportRecord = {
      id: this.nextReportId++,
      reporterId,
      type,
      targetId: input.targetId,
      reasonCode,
      details,
      createdAt: new Date(),
      status: 'SUBMITTED',
      sourceKey,
    };
    this.reports.set(record.id, record);
    this.reportsBySource.set(sourceKey, record.id);
    return record;
  }

  hasReportForTarget(reporterId: number, type: string, targetId: number): boolean {
    const normalized = normalizeText(type)?.toUpperCase();
    if (!normalized) return false;
    for (const report of this.reports.values()) {
      if (
        report.reporterId === reporterId &&
        report.type === normalized &&
        report.targetId === targetId
      ) {
        return true;
      }
    }
    return false;
  }

  getCurrentUserPayload(userId: number): SocialUserDetailPayload {
    return this.buildUserPayload(userId, userId, true);
  }

  getVisitorUserPayload(viewerId: number, targetUserId: number): SocialUserDetailPayload {
    return this.buildUserPayload(viewerId, targetUserId, false);
  }

  updateCurrentUserProfile(
    userId: number,
    input: SocialProfileUpdateInput,
  ): SocialUserDetailPayload {
    const user = this.mustGetUser(userId);

    if (input.username !== undefined) {
      const username = normalizeText(input.username);
      if (!username) {
        throw new Error('Username is required');
      }
      const conflict = [...this.users.values()].some(
        (candidate) =>
          candidate.id !== userId &&
          candidate.profile.username.toLowerCase() === username.toLowerCase(),
      );
      if (conflict) {
        throw new Error('Username already taken');
      }
      user.profile.username = username;
    }

    if (input.displayName !== undefined)
      user.profile.displayName = normalizeText(input.displayName) ?? user.profile.displayName;
    if (input.bio !== undefined) user.profile.bio = normalizeText(input.bio);
    if (input.visibility !== undefined && input.visibility)
      user.profile.visibility = input.visibility;
    if (input.showEmail !== undefined && input.showEmail !== null)
      user.profile.showEmail = Boolean(input.showEmail);
    if (input.showPhone !== undefined && input.showPhone !== null)
      user.profile.showPhone = Boolean(input.showPhone);
    if (input.education !== undefined) user.profile.education = normalizeText(input.education);
    if (input.placeLive !== undefined) user.profile.placeLive = normalizeText(input.placeLive);
    if (input.from !== undefined) user.profile.from = normalizeText(input.from);
    if (input.profileType !== undefined)
      user.profile.profileType = normalizeText(input.profileType);
    if (input.workStatus !== undefined) user.profile.workStatus = normalizeText(input.workStatus);
    if (input.religiousStatus !== undefined)
      user.profile.religiousStatus = normalizeText(input.religiousStatus);
    if (input.gender !== undefined) user.profile.gender = normalizeText(input.gender);
    // DEPRECATED: birthdate is no longer writable here — Central Auth's
    // User.dateOfBirth is canonical. input.birthdate is intentionally
    // ignored even if a caller still sends it (see the Prisma-backed
    // updateSharedProfile in shared-user-profile.ts for the same rule).
    if (input.maritalStatus !== undefined)
      user.profile.maritalStatus = normalizeText(input.maritalStatus);
    if (input.email !== undefined) user.auth.email = normalizeText(input.email) ?? user.auth.email;
    if (input.phone !== undefined) user.auth.phone = normalizeText(input.phone);
    if (input.avatarMediaId !== undefined)
      this.assignProfileMedia(user, 'avatarMediaId', input.avatarMediaId);
    if (input.coverMediaId !== undefined)
      this.assignProfileMedia(user, 'coverMediaId', input.coverMediaId);

    return this.getCurrentUserPayload(userId);
  }

  private assignProfileMedia(
    user: UserRecord,
    field: 'avatarMediaId' | 'coverMediaId',
    mediaId: number | null,
  ): void {
    if (mediaId === null) {
      user.profile[field] = null;
      return;
    }
    const media = this.mustGetMedia(mediaId);
    if (media.ownerUserId !== user.id) {
      throw new Error('Media is not owned by the current user');
    }
    user.profile[field] = media.id;
  }

  getFollowersCount(userId: number): number {
    let count = 0;
    for (const follow of this.follows) {
      if (follow.endsWith(`:${userId}`)) count += 1;
    }
    return count;
  }

  getFollowingCount(userId: number): number {
    let count = 0;
    for (const follow of this.follows) {
      if (follow.startsWith(`${userId}:`)) count += 1;
    }
    return count;
  }

  getFollowerPreviewUrls(userId: number, limit = 5): string[] {
    const urls: string[] = [];
    for (const follow of [...this.follows].reverse()) {
      const [followerRaw, followingRaw] = follow.split(':');
      if (Number(followingRaw) !== userId) continue;
      const follower = this.users.get(Number(followerRaw));
      const media = follower?.profile.avatarMediaId
        ? this.media.get(follower.profile.avatarMediaId)
        : null;
      if (media?.url) urls.push(media.url);
      if (urls.length >= limit) break;
    }
    return uniqueByLowercase(urls);
  }

  followUser(viewerId: number, targetId: number): void {
    if (viewerId === targetId) {
      throw new Error('You cannot follow yourself');
    }
    this.mustGetUser(targetId);
    if (this.isBlocked(viewerId, targetId)) {
      throw new Error('Forbidden');
    }
    const before = this.follows.has(keyPair(viewerId, targetId));
    this.follows.add(keyPair(viewerId, targetId));
    if (!before) {
      this.emitNotification(targetId, {
        type: 'user_followed',
        title: 'New follower',
        body: `${this.mustGetUser(viewerId).profile.displayName} followed you`,
        actorId: viewerId,
        deepLink: `/profile/${viewerId}`,
        sourceKey: `follow:${viewerId}:${targetId}`,
      });
    }
  }

  unfollowUser(viewerId: number, targetId: number): void {
    this.follows.delete(keyPair(viewerId, targetId));
  }

  likeUserProfile(viewerId: number, targetId: number): void {
    if (viewerId === targetId) {
      throw new Error('You cannot like your own profile');
    }
    this.mustGetUser(targetId);
    if (this.isBlocked(viewerId, targetId)) {
      throw new Error('Forbidden');
    }
    const before = this.profileLikes.has(keyPair(targetId, viewerId));
    this.profileLikes.add(keyPair(targetId, viewerId));
    if (!before) {
      this.emitNotification(targetId, {
        type: 'like',
        title: 'Profile liked',
        body: `${this.mustGetUser(viewerId).profile.displayName} liked your profile`,
        actorId: viewerId,
        deepLink: `/profile/${viewerId}`,
        sourceKey: `profile-like:${viewerId}:${targetId}`,
      });
    }
  }

  unlikeUserProfile(viewerId: number, targetId: number): void {
    this.profileLikes.delete(keyPair(targetId, viewerId));
  }

  sendFriendRequest(fromUserId: number, toUserId: number): FriendRequestRecord {
    if (fromUserId === toUserId) {
      throw new Error('You cannot send a request to yourself');
    }
    this.mustGetUser(toUserId);
    if (this.isBlocked(fromUserId, toUserId)) {
      throw new Error('Forbidden');
    }
    const existing = [...this.friendRequests.values()].find(
      (request) =>
        request.fromUserId === fromUserId &&
        request.toUserId === toUserId &&
        request.status === 'PENDING',
    );
    if (existing) return existing;
    const record: FriendRequestRecord = {
      id: this.nextFriendRequestId++,
      fromUserId,
      toUserId,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.friendRequests.set(record.id, record);
    this.emitNotification(toUserId, {
      type: 'friend_request_received',
      title: 'Friend request',
      body: `${this.mustGetUser(fromUserId).profile.displayName} sent you a friend request`,
      actorId: fromUserId,
      deepLink: `/profile/${fromUserId}`,
      sourceKey: `friend-request:${fromUserId}:${toUserId}`,
    });
    return record;
  }

  acceptFriendRequest(userId: number, requestId: number): void {
    const request = this.mustGetFriendRequest(requestId);
    if (request.toUserId !== userId) {
      throw new Error('Forbidden');
    }
    if (request.status !== 'PENDING') {
      throw new Error('Request is not pending');
    }
    request.status = 'ACCEPTED';
    request.updatedAt = new Date();
    this.friends.add(this.friendKey(request.fromUserId, request.toUserId));
    this.emitNotification(request.fromUserId, {
      type: 'friend_request_accepted',
      title: 'Friend request accepted',
      body: `${this.mustGetUser(userId).profile.displayName} accepted your friend request`,
      actorId: userId,
      deepLink: `/profile/${userId}`,
      sourceKey: `friend-request-accepted:${requestId}`,
    });
  }

  rejectFriendRequest(userId: number, requestId: number): void {
    const request = this.mustGetFriendRequest(requestId);
    if (request.toUserId !== userId) {
      throw new Error('Forbidden');
    }
    if (request.status !== 'PENDING') {
      throw new Error('Request is not pending');
    }
    request.status = 'REJECTED';
    request.updatedAt = new Date();
  }

  cancelFriendRequest(userId: number, requestId: number): void {
    const request = this.mustGetFriendRequest(requestId);
    if (request.fromUserId !== userId) {
      throw new Error('Forbidden');
    }
    if (request.status !== 'PENDING') {
      throw new Error('Request is not pending');
    }
    request.status = 'CANCELED';
    request.updatedAt = new Date();
  }

  getSocialStatus(
    viewerId: number,
    targetId: number,
  ): {
    isFollowing: boolean;
    isLiked: boolean;
    isFriend: boolean;
    outgoingRequestId: number | null;
    incomingRequestId: number | null;
    isBlocked: boolean;
    isBlockedByMe: boolean;
    isBlockedByTarget: boolean;
  } {
    const outgoing = [...this.friendRequests.values()].find(
      (request) =>
        request.fromUserId === viewerId &&
        request.toUserId === targetId &&
        request.status === 'PENDING',
    );
    const incoming = [...this.friendRequests.values()].find(
      (request) =>
        request.fromUserId === targetId &&
        request.toUserId === viewerId &&
        request.status === 'PENDING',
    );
    const isBlockedByMe = this.blocks.has(keyPair(viewerId, targetId));
    const isBlockedByTarget = this.blocks.has(keyPair(targetId, viewerId));
    return {
      isFollowing: this.follows.has(keyPair(viewerId, targetId)),
      isLiked: this.profileLikes.has(keyPair(targetId, viewerId)),
      isFriend: this.friends.has(this.friendKey(viewerId, targetId)),
      outgoingRequestId: outgoing?.id ?? null,
      incomingRequestId: incoming?.id ?? null,
      isBlocked: isBlockedByMe || isBlockedByTarget,
      isBlockedByMe,
      isBlockedByTarget,
    };
  }

  /**
   * Validates existence/ownership/status for every media id, de-duplicates
   * (preserving first-occurrence order) and enforces MAX_POST_MEDIA_ITEMS.
   * Runs the same checks in both persistence modes; the Prisma path also
   * warms the media cache for the rows it just validated so serializePost's
   * synchronous media lookups don't miss right after a cold start.
   */
  private async validateAndNormalizePostMediaIds(
    userId: number,
    rawMediaIds: unknown,
  ): Promise<number[]> {
    const requested = safeArray<number>(rawMediaIds)
      .map((value) => Number(value))
      .filter(Number.isFinite);
    const mediaIds = [...new Set(requested)];
    if (mediaIds.length > MAX_POST_MEDIA_ITEMS) {
      throw new Error(`A post may not have more than ${MAX_POST_MEDIA_ITEMS} media attachments`);
    }
    if (mediaIds.length === 0) return mediaIds;

    if (this.mediaPrisma) {
      const rows = await this.mediaPrisma.media.findMany({ where: { id: { in: mediaIds } } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const mediaId of mediaIds) {
        const media = byId.get(mediaId);
        if (!media) throw new Error('Invalid media reference');
        if (media.ownerUserId !== userId) throw new Error('Media is not owned by the current user');
        // Current upload path (media-storage.ts) always creates media
        // READY synchronously — PROCESSING/FAILED are only reachable via
        // the not-yet-merged async image/video queue (see job file § Media
        // status policy). This check is the forward-compatible guard: only
        // READY media may ever be attached to a Post.
        if (media.status !== 'READY') {
          throw new Error(`Media ${mediaId} is not ready (status: ${media.status})`);
        }
        this.cacheMediaRecord(mapMediaRowToRecord(media));
      }
    } else {
      for (const mediaId of mediaIds) {
        const media = this.media.get(mediaId);
        if (!media) throw new Error('Invalid media reference');
        if (media.ownerUserId !== userId) throw new Error('Media is not owned by the current user');
        if (media.status !== 'READY') {
          throw new Error(`Media ${mediaId} is not ready (status: ${media.status})`);
        }
      }
    }
    return mediaIds;
  }

  async createPost(userId: number, input: SocialPostUpsertInput): Promise<SocialPostPayload> {
    const idempotencyKey = input.idempotencyKey?.trim() || null;

    const fields: PostCreateFields = {
      caption: normalizeText(input.caption),
      type: (input.type?.toString().toUpperCase() as PostType) || 'TEXT',
      category: (input.category?.toString().toUpperCase() as PostCategory) || 'GENERAL',
      privacy: (input.privacy?.toString().toUpperCase() as PostPrivacy) || 'PUBLIC',
      backgroundStyle: normalizeText(input.backgroundStyle),
      postType: normalizeText(input.postType),
      lostPetName: normalizeText(input.lostPetName),
      lostPetLocation: normalizeText(input.lostPetLocation),
      lostPetContactVisible: input.lostPetContactVisible ?? false,
      mediaIds: await this.validateAndNormalizePostMediaIds(userId, input.mediaIds),
      taggedPetIds: safeArray<number>(input.taggedPetIds)
        .map((value) => Number(value))
        .filter(Number.isFinite),
      songTitle: normalizeText(input.songTitle),
      songArtist: normalizeText(input.songArtist),
      songStartMs: input.songStartMs ?? null,
      songDurationMs: input.songDurationMs ?? null,
      locationTag: normalizeText(input.locationText),
      feelingId: normalizeText(input.feelingId),
      feelingLabel: normalizeText(input.feelingLabel),
      feelingEmoji: normalizeText(input.feelingEmoji),
      activityId: normalizeText(input.activityId),
      activityLabel: normalizeText(input.activityLabel),
      activityEmoji: normalizeText(input.activityEmoji),
    };

    if (idempotencyKey) {
      // Fast path: this process already served this key (covers the common
      // case — same-process retry — without a DB round trip).
      const cachedId = this.postCreationIdempotencyKeys.get(`${userId}:${idempotencyKey}`);
      const cached = cachedId ? this.posts.get(cachedId) : undefined;
      if (cached) {
        if (fingerprintFromPostRecord(cached) !== buildPostFingerprint(fields)) {
          throw new Error('Idempotency key already used with a different request payload');
        }
        return this.serializePost(cached.id, userId);
      }
      // Cold cache (restart, or another instance served the original
      // request) — check the durable record before creating anything.
      if (this.mediaPrisma) {
        const persisted = await this.loadPersistedPostByIdempotencyKey(userId, idempotencyKey);
        if (persisted) {
          this.postCreationIdempotencyKeys.set(`${userId}:${idempotencyKey}`, persisted.id);
          if (fingerprintFromPostRecord(persisted) !== buildPostFingerprint(fields)) {
            throw new Error('Idempotency key already used with a different request payload');
          }
          return this.serializePost(persisted.id, userId);
        }
      }
    }

    if (this.mediaPrisma) {
      try {
        const row = await this.mediaPrisma.post.create({
          data: {
            authorId: userId,
            type: fields.type,
            category: fields.category,
            caption: fields.caption,
            privacy: fields.privacy,
            backgroundStyle: fields.backgroundStyle,
            postType: fields.postType,
            lostPetName: fields.lostPetName,
            lostPetLocation: fields.lostPetLocation,
            lostPetContactVisible: fields.lostPetContactVisible,
            songTitle: fields.songTitle,
            songArtist: fields.songArtist,
            songStartMs: fields.songStartMs,
            songDurationMs: fields.songDurationMs,
            locationTag: fields.locationTag,
            feelingId: fields.feelingId,
            feelingLabel: fields.feelingLabel,
            feelingEmoji: fields.feelingEmoji,
            activityId: fields.activityId,
            activityLabel: fields.activityLabel,
            activityEmoji: fields.activityEmoji,
            createIdempotencyKey: idempotencyKey,
            media: fields.mediaIds.length
              ? { create: fields.mediaIds.map((mediaId, position) => ({ mediaId, position })) }
              : undefined,
            taggedPets: fields.taggedPetIds.length
              ? { create: fields.taggedPetIds.map((petId) => ({ petId })) }
              : undefined,
          },
          include: POST_PERSISTENCE_INCLUDE,
        });
        const record = this.cachePostRow(row);
        if (idempotencyKey) {
          this.postCreationIdempotencyKeys.set(`${userId}:${idempotencyKey}`, record.id);
        }
        return this.serializePost(record.id, userId);
      } catch (error) {
        // P2002 on the (authorId, createIdempotencyKey) unique index means
        // a concurrent request for the same key won the race between our
        // cache-miss check above and this insert — the database, not an
        // in-process check-then-write, is what makes this concurrency-safe.
        if (
          idempotencyKey &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const winner = await this.loadPersistedPostByIdempotencyKey(userId, idempotencyKey);
          if (winner) {
            this.postCreationIdempotencyKeys.set(`${userId}:${idempotencyKey}`, winner.id);
            if (fingerprintFromPostRecord(winner) !== buildPostFingerprint(fields)) {
              throw new Error('Idempotency key already used with a different request payload', {
                cause: error,
              });
            }
            return this.serializePost(winner.id, userId);
          }
        }
        throw error;
      }
    }

    // No Prisma configured — development in-memory fallback. Not restart-
    // safe or multi-instance-safe; see job file § Durable idempotency.
    const post = this.createPostRecord({ ...fields, authorId: userId });
    if (idempotencyKey) {
      this.postCreationIdempotencyKeys.set(`${userId}:${idempotencyKey}`, post.id);
    }
    return this.serializePost(post.id, userId);
  }

  async updatePost(
    userId: number,
    postId: number,
    input: SocialPostUpsertInput,
  ): Promise<SocialPostPayload> {
    const post = await this.mustGetPersistedPost(postId);
    if (post.authorId !== userId) {
      throw new Error('Forbidden');
    }

    const nextMediaIds =
      input.mediaIds !== undefined
        ? await this.validateAndNormalizePostMediaIds(userId, input.mediaIds)
        : undefined;

    if (this.mediaPrisma) {
      const row = await this.mediaPrisma.$transaction(async (tx) => {
        if (nextMediaIds !== undefined) {
          // Replace-in-place: delete the existing PostMedia set and create
          // the new one inside the same transaction, so a Post is never
          // observable with a half-old/half-new media set.
          await tx.postMedia.deleteMany({ where: { postId } });
        }
        if (input.taggedPetIds !== undefined) {
          await tx.postTaggedPet.deleteMany({ where: { postId } });
        }
        return tx.post.update({
          where: { id: postId },
          data: {
            caption: input.caption !== undefined ? normalizeText(input.caption) : undefined,
            type:
              input.type !== undefined && input.type
                ? (input.type.toString().toUpperCase() as PostType)
                : undefined,
            category:
              input.category !== undefined && input.category
                ? (input.category.toString().toUpperCase() as PostCategory)
                : undefined,
            privacy:
              input.privacy !== undefined && input.privacy
                ? (input.privacy.toString().toUpperCase() as PostPrivacy)
                : undefined,
            postType: input.postType !== undefined ? normalizeText(input.postType) : undefined,
            backgroundStyle:
              input.backgroundStyle !== undefined ? normalizeText(input.backgroundStyle) : undefined,
            lostPetName:
              input.lostPetName !== undefined ? normalizeText(input.lostPetName) : undefined,
            lostPetLocation:
              input.lostPetLocation !== undefined ? normalizeText(input.lostPetLocation) : undefined,
            lostPetContactVisible:
              input.lostPetContactVisible !== undefined && input.lostPetContactVisible !== null
                ? Boolean(input.lostPetContactVisible)
                : undefined,
            songTitle: input.songTitle !== undefined ? normalizeText(input.songTitle) : undefined,
            songArtist: input.songArtist !== undefined ? normalizeText(input.songArtist) : undefined,
            songStartMs: input.songStartMs !== undefined ? (input.songStartMs ?? null) : undefined,
            songDurationMs:
              input.songDurationMs !== undefined ? (input.songDurationMs ?? null) : undefined,
            locationTag:
              input.locationText !== undefined ? normalizeText(input.locationText) : undefined,
            feelingId: input.feelingId !== undefined ? normalizeText(input.feelingId) : undefined,
            feelingLabel:
              input.feelingLabel !== undefined ? normalizeText(input.feelingLabel) : undefined,
            feelingEmoji:
              input.feelingEmoji !== undefined ? normalizeText(input.feelingEmoji) : undefined,
            activityId: input.activityId !== undefined ? normalizeText(input.activityId) : undefined,
            activityLabel:
              input.activityLabel !== undefined ? normalizeText(input.activityLabel) : undefined,
            activityEmoji:
              input.activityEmoji !== undefined ? normalizeText(input.activityEmoji) : undefined,
            media:
              nextMediaIds !== undefined
                ? { create: nextMediaIds.map((mediaId, position) => ({ mediaId, position })) }
                : undefined,
            taggedPets:
              input.taggedPetIds !== undefined
                ? {
                    create: safeArray<number>(input.taggedPetIds)
                      .map((value) => Number(value))
                      .filter(Number.isFinite)
                      .map((petId) => ({ petId })),
                  }
                : undefined,
          },
          include: POST_PERSISTENCE_INCLUDE,
        });
      });
      const record = this.cachePostRow(row);
      return this.serializePost(record.id, userId);
    }

    // In-memory fallback
    if (input.caption !== undefined) post.caption = normalizeText(input.caption);
    if (input.type !== undefined && input.type)
      post.type = input.type.toString().toUpperCase() as PostType;
    if (input.category !== undefined && input.category)
      post.category = input.category.toString().toUpperCase() as PostCategory;
    if (nextMediaIds !== undefined) post.mediaIds = nextMediaIds;
    if (input.privacy !== undefined && input.privacy)
      post.privacy = input.privacy.toString().toUpperCase() as PostPrivacy;
    if (input.postType !== undefined) post.postType = normalizeText(input.postType);
    if (input.backgroundStyle !== undefined)
      post.backgroundStyle = normalizeText(input.backgroundStyle);
    if (input.lostPetName !== undefined) post.lostPetName = normalizeText(input.lostPetName);
    if (input.lostPetLocation !== undefined)
      post.lostPetLocation = normalizeText(input.lostPetLocation);
    if (input.lostPetContactVisible !== undefined && input.lostPetContactVisible !== null)
      post.lostPetContactVisible = Boolean(input.lostPetContactVisible);
    if (input.taggedPetIds !== undefined)
      post.taggedPetIds = safeArray<number>(input.taggedPetIds)
        .map((value) => Number(value))
        .filter(Number.isFinite);
    if (input.songTitle !== undefined) post.songTitle = normalizeText(input.songTitle);
    if (input.songArtist !== undefined) post.songArtist = normalizeText(input.songArtist);
    if (input.songStartMs !== undefined) post.songStartMs = input.songStartMs ?? null;
    if (input.songDurationMs !== undefined) post.songDurationMs = input.songDurationMs ?? null;
    if (input.locationText !== undefined) post.locationTag = normalizeText(input.locationText);
    if (input.feelingId !== undefined) post.feelingId = normalizeText(input.feelingId);
    if (input.feelingLabel !== undefined) post.feelingLabel = normalizeText(input.feelingLabel);
    if (input.feelingEmoji !== undefined) post.feelingEmoji = normalizeText(input.feelingEmoji);
    if (input.activityId !== undefined) post.activityId = normalizeText(input.activityId);
    if (input.activityLabel !== undefined) post.activityLabel = normalizeText(input.activityLabel);
    if (input.activityEmoji !== undefined) post.activityEmoji = normalizeText(input.activityEmoji);
    post.updatedAt = new Date();
    return this.serializePost(post.id, userId);
  }

  async deletePost(userId: number, postId: number): Promise<{ deleted: true; id: number }> {
    const post = await this.mustGetPersistedPost(postId);
    if (post.authorId !== userId) {
      throw new Error('Forbidden');
    }
    if (this.mediaPrisma) {
      // Soft delete only — status flip, not a row/media deletion. Media
      // owned by the user is untouched: deleting a Post must not delete
      // Media the user may still reference elsewhere (profile, other posts).
      const row = await this.mediaPrisma.post.update({
        where: { id: postId },
        data: { status: 'DELETED' },
        include: POST_PERSISTENCE_INCLUDE,
      });
      this.cachePostRow(row);
    } else {
      post.status = 'DELETED';
      post.updatedAt = new Date();
    }
    return { deleted: true, id: post.id };
  }

  likePost(
    userId: number,
    postId: number,
  ): { likeCount: number; commentCount: number; isLikedByMe: boolean } {
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(userId, post);
    const hadLike = this.postLikes.has(keyPair(userId, postId));
    this.postLikes.add(keyPair(userId, postId));
    if (!hadLike) {
      this.emitNotification(post.authorId, {
        type: 'like',
        title: 'Post liked',
        body: `${this.mustGetUser(userId).profile.displayName} liked your post`,
        actorId: userId,
        deepLink: `/posts/${postId}`,
        sourceKey: `post-like:${userId}:${postId}`,
      });
    }
    return this.postCounters(userId, postId, true);
  }

  unlikePost(
    userId: number,
    postId: number,
  ): { likeCount: number; commentCount: number; isLikedByMe: boolean } {
    this.postLikes.delete(keyPair(userId, postId));
    return this.postCounters(userId, postId, false);
  }

  bookmarkPost(userId: number, postId: number): { bookmarked: true } {
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(userId, post);
    this.bookmarks.add(keyPair(userId, postId));
    return { bookmarked: true };
  }

  unbookmarkPost(userId: number, postId: number): { bookmarked: false } {
    this.bookmarks.delete(keyPair(userId, postId));
    return { bookmarked: false };
  }

  sharePost(userId: number, postId: number): { shareCount: number } {
    const post = this.mustGetPost(postId);
    post.shareCount += 1;
    post.updatedAt = new Date();
    return { shareCount: post.shareCount };
  }

  recordView(userId: number, postId: number): { viewCount: number } {
    const post = this.mustGetPost(postId);
    if (!this.postLikes.has(keyPair(userId, postId))) {
      post.viewCount += 1;
      post.updatedAt = new Date();
    }
    return { viewCount: post.viewCount };
  }

  /**
   * Feed ranking/visibility (getVisiblePosts, canViewerSeePost) stays
   * purely in-memory in this vertical slice — it already depends on
   * Follow/Block data that is itself still in-memory-only, so making Post
   * visibility SQL-native without also migrating the social graph would
   * only be half a fix. What this method adds is restart-safety for the
   * Post rows themselves: on first call after a cold start it bulk-loads
   * the most recent posts from Prisma into the same cache the in-memory
   * logic already reads, so a Post created before a restart is still
   * visible in the feed afterward. Bounded by FEED_HYDRATION_LIMIT — deep
   * cursor pagination past that window after a cold start is a known
   * scaling gap, tracked in the job file, not a silent correctness bug for
   * the restart-safety property this slice is required to prove.
   */
  private feedHydrated = false;
  private static readonly FEED_HYDRATION_LIMIT = 1000;

  private async ensureFeedCacheWarm(): Promise<void> {
    if (this.feedHydrated || !this.mediaPrisma) return;
    const rows = await this.mediaPrisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: SocialCoreStore.FEED_HYDRATION_LIMIT,
      include: POST_PERSISTENCE_INCLUDE,
    });
    for (const row of rows) this.cachePostRow(row);
    this.feedHydrated = true;
  }

  async listFeed(viewerId: number, limit: number, cursor?: unknown): Promise<SocialPostPayload[]> {
    await this.ensureFeedCacheWarm();
    return this.slicePosts(
      viewerId,
      this.getVisiblePosts(viewerId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      limit,
      cursor,
    ).map((post) => this.serializePost(post.id, viewerId));
  }

  listVideosFeed(
    viewerId: number,
    options: {
      limit: number;
      page: number;
      cursor?: unknown;
      search?: string;
      category?: string;
      sort?: string;
      duration?: string;
      followingOnly?: boolean;
    },
  ): SocialPostListResult {
    let posts = this.getVisiblePosts(viewerId).filter(
      (post) =>
        post.type === 'VIDEO' ||
        post.type === 'REEL' ||
        post.mediaIds.some((mediaId) =>
          (this.media.get(mediaId)?.mimetype ?? '').startsWith('video/'),
        ),
    );
    if (options.followingOnly) {
      posts = posts.filter((post) => this.follows.has(keyPair(viewerId, post.authorId)));
    }
    const search = normalizeText(options.search)?.toLowerCase();
    if (search) {
      posts = posts.filter((post) =>
        [
          post.caption,
          post.context,
          post.locationTag,
          post.postType,
          post.songTitle,
          post.songArtist,
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(search)),
      );
    }
    const category = normalizeText(options.category)?.toUpperCase();
    if (category) posts = posts.filter((post) => post.category === category);
    const duration = normalizeText(options.duration)?.toLowerCase();
    if (duration === 'short') {
      posts = posts.filter(
        (post) => (post.songDurationMs ?? 0) > 0 && (post.songDurationMs ?? 0) < 60_000,
      );
    }
    if (duration === 'long') {
      posts = posts.filter((post) => (post.songDurationMs ?? 0) >= 60_000);
    }
    const sort = normalizeText(options.sort)?.toLowerCase();
    if (sort === 'popular') {
      posts = [...posts].sort(
        (a, b) =>
          b.viewCount +
          b.shareCount +
          this.postLikeCount(b.id) -
          (a.viewCount + a.shareCount + this.postLikeCount(a.id)),
      );
    } else {
      posts = [...posts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const sliced = this.slicePosts(viewerId, posts, options.limit, options.cursor, options.page);
    const nextCursor = sliced.length > 0 ? buildCursor(sliced[sliced.length - 1]!.id) : null;
    return {
      items: sliced.map((post) => this.serializePost(post.id, viewerId)),
      nextCursor,
      hasMore: sliced.length === options.limit,
      page: options.page,
      limit: options.limit,
    };
  }

  listUserPosts(
    viewerId: number,
    userId: number,
    limit: number,
    cursor?: unknown,
  ): SocialPostPayload[] {
    const posts = this.getVisiblePosts(viewerId).filter((post) => post.authorId === userId);
    return this.slicePosts(
      viewerId,
      posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      limit,
      cursor,
    ).map((post) => this.serializePost(post.id, viewerId));
  }

  listUserMediaGallery(
    viewerId: number,
    userId: number,
    mediaType: 'IMAGE' | 'VIDEO',
    limit: number,
    cursor?: unknown,
  ): { items: Array<Record<string, unknown>>; nextCursor: string | null; hasMore: boolean } {
    const posts = this.getVisiblePosts(viewerId).filter((post) => post.authorId === userId);
    const mediaRecords = posts
      .flatMap((post) => post.mediaIds.map((mediaId) => this.media.get(mediaId)))
      .filter((media): media is MediaRecord => Boolean(media))
      .filter((media) => media.mimetype.startsWith(mediaType.toLowerCase()));
    const startAfter = cursorToNumber(cursor);
    const filtered = mediaRecords
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .filter((media) => (startAfter ? media.id < startAfter : true))
      .slice(0, limit);
    return {
      items: filtered.map((media) => ({ id: media.id, media: this.mediaPayload(media.id) })),
      nextCursor: filtered.length === limit ? buildCursor(filtered[filtered.length - 1]!.id) : null,
      hasMore: filtered.length === limit,
    };
  }

  listBookmarkedPosts(
    viewerId: number,
    limit: number,
    cursor?: unknown,
  ): { items: SocialPostPayload[]; nextCursor: string | null; hasMore: boolean } {
    const ids = [...this.bookmarks]
      .filter((pair) => pair.startsWith(`${viewerId}:`))
      .map((pair) => Number(pair.split(':')[1]))
      .filter((value) => Number.isFinite(value));
    const posts = ids
      .map((postId) => this.posts.get(postId))
      .filter((post): post is PostRecord => post !== undefined && post.status !== 'DELETED');
    const sorted = posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const sliced = this.slicePosts(viewerId, sorted, limit, cursor);
    return {
      items: sliced.map((post) => this.serializePost(post.id, viewerId)),
      nextCursor: sliced.length === limit ? buildCursor(sliced[sliced.length - 1]!.id) : null,
      hasMore: sliced.length === limit,
    };
  }

  listComments(
    viewerId: number,
    postId: number,
    limit: number,
    cursor?: unknown,
  ): SocialCommentListResult | SocialCommentPayload[] {
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(viewerId, post);
    const comments = [...this.comments.values()]
      .filter(
        (comment) =>
          comment.postId === postId &&
          comment.parentId === null &&
          this.canViewerSeeComment(viewerId, post, comment),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (cursor !== undefined && cursor !== null && String(cursor).length > 0) {
      const startAfter = cursorToNumber(cursor);
      const filtered = comments
        .filter((comment) => (startAfter ? comment.id < startAfter : true))
        .slice(0, limit);
      return {
        items: filtered.map((comment) => this.serializeComment(comment.id, viewerId)),
        nextCursor:
          filtered.length === limit ? buildCursor(filtered[filtered.length - 1]!.id) : null,
        hasMore: filtered.length === limit,
        limit,
      };
    }
    return comments.slice(0, limit).map((comment) => this.serializeComment(comment.id, viewerId));
  }

  addComment(viewerId: number, postId: number, text: string): SocialCommentPayload {
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(viewerId, post);
    const comment = this.createCommentRecord({
      postId,
      authorId: viewerId,
      text,
      parentId: null,
    });
    if (post.authorId !== viewerId) {
      this.emitNotification(post.authorId, {
        type: 'comment',
        title: 'New comment',
        body: `${this.mustGetUser(viewerId).profile.displayName} commented on your post`,
        actorId: viewerId,
        deepLink: `/posts/${postId}`,
        sourceKey: `post-comment:${viewerId}:${postId}:${comment.id}`,
      });
    }
    return this.serializeComment(comment.id, viewerId);
  }

  editComment(
    viewerId: number,
    postId: number,
    commentId: number,
    text: string,
  ): SocialCommentPayload {
    const comment = this.mustGetComment(commentId);
    if (comment.postId !== postId) {
      throw new Error('Comment not found');
    }
    if (comment.authorId !== viewerId) {
      throw new Error('Forbidden');
    }
    comment.text = text.trim();
    comment.isEdited = true;
    comment.updatedAt = new Date();
    return this.serializeComment(comment.id, viewerId);
  }

  deleteComment(
    viewerId: number,
    postId: number,
    commentId: number,
  ): { deleted: true; id: number; postId: number } {
    const comment = this.mustGetComment(commentId);
    if (comment.postId !== postId) {
      throw new Error('Comment not found');
    }
    if (comment.authorId !== viewerId) {
      throw new Error('Forbidden');
    }
    comment.status = 'DELETED';
    comment.updatedAt = new Date();
    return { deleted: true, id: comment.id, postId };
  }

  likeComment(
    viewerId: number,
    postId: number,
    commentId: number,
  ): { likeCount: number; isLikedByMe: boolean } {
    const comment = this.mustGetComment(commentId);
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(viewerId, post);
    if (comment.postId !== postId || comment.status === 'DELETED') {
      throw new Error('Comment not found');
    }
    const hadLike = this.commentLikes.has(keyPair(viewerId, commentId));
    this.commentLikes.add(keyPair(viewerId, commentId));
    if (!hadLike && comment.authorId !== viewerId) {
      this.emitNotification(comment.authorId, {
        type: 'like',
        title: 'Comment liked',
        body: `${this.mustGetUser(viewerId).profile.displayName} liked your comment`,
        actorId: viewerId,
        deepLink: `/posts/${postId}`,
        sourceKey: `comment-like:${viewerId}:${commentId}`,
      });
    }
    return { likeCount: this.commentLikeCount(commentId), isLikedByMe: true };
  }

  unlikeComment(
    viewerId: number,
    postId: number,
    commentId: number,
  ): { likeCount: number; isLikedByMe: boolean } {
    const comment = this.mustGetComment(commentId);
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(viewerId, post);
    if (comment.postId !== postId) {
      throw new Error('Comment not found');
    }
    this.commentLikes.delete(keyPair(viewerId, commentId));
    return { likeCount: this.commentLikeCount(commentId), isLikedByMe: false };
  }

  replyComment(
    viewerId: number,
    postId: number,
    parentCommentId: number,
    text: string,
  ): SocialCommentPayload {
    const parent = this.mustGetComment(parentCommentId);
    const post = this.mustGetPost(postId);
    this.ensureCanViewPost(viewerId, post);
    if (parent.postId !== postId || parent.status === 'DELETED') {
      throw new Error('Comment not found');
    }
    const reply = this.createCommentRecord({
      postId,
      authorId: viewerId,
      text,
      parentId: parentCommentId,
    });
    const parentAuthorId = parent.authorId;
    if (parentAuthorId !== viewerId) {
      this.emitNotification(parentAuthorId, {
        type: 'comment',
        title: 'New reply',
        body: `${this.mustGetUser(viewerId).profile.displayName} replied to your comment`,
        actorId: viewerId,
        deepLink: `/posts/${postId}`,
        sourceKey: `comment-reply:${viewerId}:${postId}:${parentCommentId}:${reply.id}`,
      });
    }
    if (post.authorId !== viewerId && post.authorId !== parentAuthorId) {
      this.emitNotification(post.authorId, {
        type: 'comment',
        title: 'New comment reply',
        body: `${this.mustGetUser(viewerId).profile.displayName} replied on your post`,
        actorId: viewerId,
        deepLink: `/posts/${postId}`,
        sourceKey: `post-reply:${viewerId}:${postId}:${reply.id}`,
      });
    }
    return this.serializeComment(reply.id, viewerId);
  }

  async getPostById(viewerId: number, postId: number): Promise<SocialPostPayload> {
    const post = await this.mustGetPersistedPost(postId);
    this.ensureCanViewPost(viewerId, post);
    return this.serializePost(post.id, viewerId);
  }

  getUserPhotoGallery(viewerId: number, userId: number, limit: number, cursor?: unknown) {
    return this.listUserMediaGallery(viewerId, userId, 'IMAGE', limit, cursor);
  }

  getUserVideoGallery(viewerId: number, userId: number, limit: number, cursor?: unknown) {
    return this.listUserMediaGallery(viewerId, userId, 'VIDEO', limit, cursor);
  }

  private buildUserPayload(
    viewerId: number,
    targetUserId: number,
    includeSensitive: boolean,
  ): SocialUserDetailPayload {
    const user = this.mustGetUser(targetUserId);
    const blocked = this.isBlocked(viewerId, targetUserId);
    const canViewFullProfile =
      !blocked &&
      (user.profile.visibility === 'PUBLIC' ||
        viewerId === targetUserId ||
        this.follows.has(keyPair(viewerId, targetUserId)));
    const profile = this.profilePayload(user, includeSensitive || canViewFullProfile);
    return {
      id: user.id,
      auth:
        includeSensitive || viewerId === targetUserId || canViewFullProfile
          ? { email: user.auth.email, phone: user.auth.phone }
          : { email: '', phone: null },
      profile,
      wallet:
        includeSensitive || viewerId === targetUserId
          ? user.wallet
          : { points: 0, balance: 0, tier: null },
      pets: [],
      galleryItems: this.galleryItemsPayload(targetUserId),
      achievements: [],
      followerPreviewUrls: this.getFollowerPreviewUrls(targetUserId),
      followersCount: this.getFollowersCount(targetUserId),
      followingCount: this.getFollowingCount(targetUserId),
      canViewFullProfile,
      isProfileLocked: blocked || user.profile.isLocked,
      status: user.profile.visibility,
    };
  }

  private profilePayload(user: UserRecord, revealPrivate: boolean): Record<string, unknown> {
    const avatarMedia = user.profile.avatarMediaId
      ? this.mediaPayload(user.profile.avatarMediaId)
      : null;
    const coverMedia = user.profile.coverMediaId
      ? this.mediaPayload(user.profile.coverMediaId)
      : null;
    return {
      displayName: user.profile.displayName,
      username: user.profile.username,
      bio: revealPrivate ? user.profile.bio : null,
      avatarMedia,
      coverMedia,
      education: revealPrivate ? user.profile.education : null,
      placeLive: revealPrivate ? user.profile.placeLive : null,
      fansAndFriends: revealPrivate ? user.profile.fansAndFriends : null,
      from: revealPrivate ? user.profile.from : null,
      profileType: revealPrivate ? user.profile.profileType : null,
      workStatus: revealPrivate ? user.profile.workStatus : null,
      religiousStatus: revealPrivate ? user.profile.religiousStatus : null,
      gender: revealPrivate ? user.profile.gender : null,
      birthdate:
        revealPrivate && user.profile.birthdate ? user.profile.birthdate.toISOString() : null,
      maritalStatus: revealPrivate ? user.profile.maritalStatus : null,
      visibility: user.profile.visibility,
      showEmail: user.profile.showEmail,
      showPhone: user.profile.showPhone,
      isLocked: user.profile.isLocked,
    };
  }

  private galleryItemsPayload(userId: number): Array<Record<string, unknown>> {
    return (this.gallery.get(userId) ?? []).map((item) => ({
      id: item.id,
      media: this.mediaPayload(item.mediaId),
    }));
  }

  private mediaPayload(mediaId: number): SocialMediaLookupPayload {
    const media = this.mustGetMedia(mediaId);
    return this.mediaToPayload(media);
  }

  private mediaToPayload(media: MediaRecord): SocialMediaLookupPayload {
    return {
      id: media.id,
      ownerUserId: media.ownerUserId,
      filename: media.filename,
      mimetype: media.mimetype,
      size: media.size,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      hlsUrl: media.hlsUrl,
      status: toPublicMediaStatus(media.status),
      processingError: media.processingError,
      createdAt: media.createdAt.toISOString(),
    };
  }

  private createPostRecord(input: {
    authorId: number;
    type: PostType;
    category: PostCategory;
    caption: string | null;
    privacy: PostPrivacy;
    mediaIds: number[];
    postType?: string | null;
    backgroundStyle?: string | null;
    lostPetName?: string | null;
    lostPetLocation?: string | null;
    lostPetContactVisible?: boolean | null;
    taggedPetIds?: number[];
    songTitle?: string | null;
    songArtist?: string | null;
    songStartMs?: number | null;
    songDurationMs?: number | null;
    locationTag?: string | null;
    feelingId?: string | null;
    feelingLabel?: string | null;
    feelingEmoji?: string | null;
    activityId?: string | null;
    activityLabel?: string | null;
    activityEmoji?: string | null;
  }): PostRecord {
    const post: PostRecord = {
      id: this.nextPostId++,
      authorId: input.authorId,
      type: input.type,
      category: input.category,
      caption: input.caption,
      context: null,
      privacy: input.privacy,
      backgroundStyle: input.backgroundStyle ?? null,
      postType: input.postType ?? null,
      lostPetName: input.lostPetName ?? null,
      lostPetLocation: input.lostPetLocation ?? null,
      lostPetContactVisible: input.lostPetContactVisible ?? false,
      locationTag: input.locationTag ?? null,
      feelingId: input.feelingId ?? null,
      feelingLabel: input.feelingLabel ?? null,
      feelingEmoji: input.feelingEmoji ?? null,
      activityId: input.activityId ?? null,
      activityLabel: input.activityLabel ?? null,
      activityEmoji: input.activityEmoji ?? null,
      songTitle: input.songTitle ?? null,
      songArtist: input.songArtist ?? null,
      songStartMs: input.songStartMs ?? null,
      songDurationMs: input.songDurationMs ?? null,
      fundraisingCampaignId: null,
      mediaIds: [...input.mediaIds],
      taggedPetIds: [...(input.taggedPetIds ?? [])],
      shareCount: 0,
      viewCount: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.posts.set(post.id, post);
    return post;
  }

  private cachePostRecord(post: PostRecord): PostRecord {
    this.posts.set(post.id, post);
    this.nextPostId = Math.max(this.nextPostId, post.id + 1);
    return post;
  }

  /**
   * Caches both the Post itself and every attached Media row from the same
   * query result — see POST_PERSISTENCE_INCLUDE's comment for why the media
   * cache has to be warmed alongside the post cache, not independently.
   */
  private cachePostRow(row: PersistedPostRow): PostRecord {
    for (const item of row.media) this.cacheMediaRecord(mapMediaRowToRecord(item.media));
    return this.cachePostRecord(mapPostRowToRecord(row));
  }

  /** Cache-first: after a restart the in-memory cache is empty, so this falls through to Prisma. */
  private async loadPersistedPostById(postId: number): Promise<PostRecord | null> {
    if (!this.mediaPrisma) return null;
    const row = await this.mediaPrisma.post.findUnique({
      where: { id: postId },
      include: POST_PERSISTENCE_INCLUDE,
    });
    if (!row) return null;
    return this.cachePostRow(row);
  }

  private async loadPersistedPostByIdempotencyKey(
    authorId: number,
    createIdempotencyKey: string,
  ): Promise<PostRecord | null> {
    if (!this.mediaPrisma) return null;
    const row = await this.mediaPrisma.post.findUnique({
      where: { authorId_createIdempotencyKey: { authorId, createIdempotencyKey } },
      include: POST_PERSISTENCE_INCLUDE,
    });
    if (!row) return null;
    return this.cachePostRow(row);
  }

  /**
   * Cache-first single-post fetch used by every read/write entry point.
   * Async because a cache miss (fresh process, post created on another
   * instance) needs to fall through to Prisma — call sites that only ever
   * need the in-memory cache (comments, likes, bookmarks — all still
   * in-memory-only in this vertical slice, see docs/jobs job file) keep
   * using the synchronous mustGetPost().
   */
  private async mustGetPersistedPost(postId: number): Promise<PostRecord> {
    const cached = this.posts.get(postId);
    if (cached) {
      if (cached.status === 'DELETED') throw new Error('Post not found');
      return cached;
    }
    const loaded = await this.loadPersistedPostById(postId);
    if (!loaded || loaded.status === 'DELETED') throw new Error('Post not found');
    return loaded;
  }

  private createCommentRecord(input: {
    postId: number;
    authorId: number;
    text: string;
    parentId: number | null;
    attachmentMediaId?: number | null;
  }): CommentRecord {
    const record: CommentRecord = {
      id: this.nextCommentId++,
      postId: input.postId,
      authorId: input.authorId,
      parentId: input.parentId,
      text: input.text.trim(),
      isEdited: false,
      attachmentMediaId: input.attachmentMediaId ?? null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.comments.set(record.id, record);
    return record;
  }

  private serializePost(postId: number, viewerId: number): SocialPostPayload {
    const post = this.mustGetPost(postId);
    const author = this.mustGetUser(post.authorId);
    return {
      id: post.id,
      type: post.type,
      category: post.category,
      caption: post.caption,
      context: post.context,
      createdAt: post.createdAt.toISOString(),
      author: this.authorPayload(author),
      media: post.mediaIds.map((mediaId) => ({ id: mediaId, media: this.mediaPayload(mediaId) })),
      likeCount: this.postLikeCount(post.id),
      commentCount: this.commentCount(post.id),
      isLikedByMe: this.postLikes.has(keyPair(viewerId, post.id)),
      isBookmarkedByMe: this.bookmarks.has(keyPair(viewerId, post.id)),
      privacy: post.privacy,
      backgroundStyle: post.backgroundStyle,
      feelingId: post.feelingId,
      feelingLabel: post.feelingLabel,
      feelingEmoji: post.feelingEmoji,
      activityId: post.activityId,
      activityLabel: post.activityLabel,
      activityEmoji: post.activityEmoji,
      shareCount: post.shareCount,
      viewCount: post.viewCount,
      isReportedByMe: this.hasReportForTarget(viewerId, 'POST', post.id),
      isFollowingAuthor: this.follows.has(keyPair(viewerId, post.authorId)),
      sponsoredLabel: null,
      locationTag: post.locationTag,
      postType: post.postType,
      lostPetName: post.lostPetName,
      lostPetLocation: post.lostPetLocation,
      lostPetContactVisible: post.lostPetContactVisible,
      taggedPetIds: [...post.taggedPetIds],
      taggedPets: post.taggedPetIds.map((id) => ({ id, name: `Pet ${id}`, photo: null })),
      songTitle: post.songTitle,
      songArtist: post.songArtist,
      songStartMs: post.songStartMs,
      songDurationMs: post.songDurationMs,
      _count: {
        likes: this.postLikeCount(post.id),
        comments: this.commentCount(post.id),
      },
    };
  }

  private authorPayload(user: UserRecord): Record<string, unknown> {
    return {
      id: user.id,
      profile: {
        displayName: user.profile.displayName,
        username: user.profile.username,
        avatarMedia: user.profile.avatarMediaId
          ? this.mediaPayload(user.profile.avatarMediaId)
          : null,
      },
    };
  }

  private serializeComment(commentId: number, viewerId: number): SocialCommentPayload {
    const comment = this.mustGetComment(commentId);
    const author = this.mustGetUser(comment.authorId);
    return {
      id: comment.id,
      text: comment.status === 'DELETED' ? '[deleted]' : comment.text,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      user: this.authorPayload(author),
      likeCount: this.commentLikeCount(comment.id),
      isLikedByMe: this.commentLikes.has(keyPair(viewerId, comment.id)),
      parentId: comment.parentId,
      isEdited: comment.isEdited,
      attachmentUrl: comment.attachmentMediaId
        ? String(this.mediaPayload(comment.attachmentMediaId).url ?? '') || null
        : null,
      replyCount: this.replyCount(comment.id),
    };
  }

  private notificationToPayload(notification: NotificationRecord): Record<string, unknown> {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      message: notification.body,
      actorId: notification.actorId,
      actorName: notification.actorName,
      actorAvatarUrl: notification.actorAvatarUrl,
      deepLink: notification.deepLink,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      deliveryStatus: notification.deliveryStatus,
    };
  }

  private emitNotification(
    recipientId: number,
    input: {
      type: NotificationKind;
      title: string;
      body: string;
      actorId: number | null;
      deepLink: string | null;
      sourceKey: string;
    },
  ): void {
    const key = `${recipientId}:${input.sourceKey}`;
    if (this.notificationsBySource.has(key)) return;
    const actor = input.actorId ? this.users.get(input.actorId) : null;
    const actorAvatarMediaId = actor?.profile.avatarMediaId;
    const notification: NotificationRecord = {
      id: this.nextNotificationId++,
      recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      actorId: input.actorId,
      actorName: actor?.profile.displayName ?? null,
      actorAvatarUrl: actorAvatarMediaId ? this.mediaPayload(actorAvatarMediaId).url : null,
      deepLink: input.deepLink,
      createdAt: new Date(),
      readAt: null,
      deliveryStatus: 'PENDING',
      deliveryAttempts: 0,
      lastDeliveryError: null,
      sourceKey: key,
    };
    this.notifications.set(notification.id, notification);
    this.notificationsBySource.set(key, notification.id);
    void this.deliverNotification(notification);
  }

  private async deliverNotification(notification: NotificationRecord): Promise<void> {
    const deviceTokens = [...this.deviceTokens.values()].filter(
      (record) => record.userId === notification.recipientId && record.isActive,
    );
    if (deviceTokens.length === 0) {
      notification.deliveryStatus = 'SENT';
      return;
    }

    const maxAttempts = 2;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      notification.deliveryAttempts += 1;
      try {
        await this.notificationProvider.deliver({
          recipientId: notification.recipientId,
          notification,
          deviceTokens,
        });
        notification.deliveryStatus = 'SENT';
        notification.lastDeliveryError = null;
        return;
      } catch (error) {
        lastError = error;
      }
    }
    notification.deliveryStatus = 'FAILED';
    notification.lastDeliveryError =
      lastError instanceof Error ? lastError.message : 'delivery failed';
  }

  private commentCount(postId: number): number {
    let count = 0;
    for (const comment of this.comments.values()) {
      if (comment.postId === postId && comment.status !== 'DELETED' && comment.parentId === null)
        count += 1;
    }
    return count;
  }

  private replyCount(commentId: number): number {
    let count = 0;
    for (const comment of this.comments.values()) {
      if (comment.parentId === commentId && comment.status !== 'DELETED') count += 1;
    }
    return count;
  }

  private commentLikeCount(commentId: number): number {
    let count = 0;
    for (const pair of this.commentLikes) {
      if (pair.endsWith(`:${commentId}`)) count += 1;
    }
    return count;
  }

  private postLikeCount(postId: number): number {
    let count = 0;
    for (const pair of this.postLikes) {
      if (pair.endsWith(`:${postId}`)) count += 1;
    }
    return count;
  }

  private postCounters(viewerId: number, postId: number, isLikedByMe: boolean) {
    return {
      likeCount: this.postLikeCount(postId),
      commentCount: this.commentCount(postId),
      isLikedByMe,
    };
  }

  private getVisiblePosts(viewerId: number): PostRecord[] {
    return [...this.posts.values()].filter(
      (post) =>
        post.status !== 'DELETED' &&
        this.canViewerSeePost(viewerId, post) &&
        // Mute only hides from the muter's own feed/listing surfaces — the
        // post is still directly reachable by id (matching real-world mute
        // semantics, unlike block which is a hard visibility wall).
        !this.isMuted(viewerId, post.authorId)
    );
  }

  private canViewerSeePost(viewerId: number, post: PostRecord): boolean {
    if (post.status === 'DELETED') return false;
    if (viewerId === post.authorId) return true;
    if (this.isBlocked(viewerId, post.authorId)) return false;
    if (post.privacy === 'PUBLIC') return true;
    if (post.privacy === 'FOLLOWERS_ONLY')
      return this.follows.has(keyPair(viewerId, post.authorId));
    return false;
  }

  private ensureCanViewPost(viewerId: number, post: PostRecord): void {
    if (!this.canViewerSeePost(viewerId, post)) {
      throw new Error('Forbidden');
    }
  }

  // Restrict enforcement: a comment authored by someone the POST AUTHOR has
  // restricted is hidden from every viewer except the comment's own author
  // and the post author (restricter) themself — the restricted user is
  // never told their comment was hidden.
  private canViewerSeeComment(viewerId: number, post: PostRecord, comment: CommentRecord): boolean {
    if (!this.isRestrictedBy(post.authorId, comment.authorId)) return true;
    return viewerId === comment.authorId || viewerId === post.authorId;
  }

  private slicePosts(
    viewerId: number,
    posts: PostRecord[],
    limit: number,
    cursor?: unknown,
    page?: number,
  ): PostRecord[] {
    const max = Math.max(1, Math.min(limit || 20, 100));
    let filtered = [...posts];
    const startAfter = cursorToNumber(cursor);
    if (startAfter) {
      filtered = filtered.filter((post) => post.id < startAfter);
    }
    if (typeof page === 'number' && page > 1 && !startAfter) {
      const offset = (page - 1) * max;
      filtered = filtered.slice(offset);
    }
    return filtered.slice(0, max);
  }

  private mustGetUser(userId: number): UserRecord {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    return user;
  }

  private mustGetMedia(mediaId: number): MediaRecord {
    const media = this.media.get(mediaId);
    if (!media) throw new Error('Media not found');
    return media;
  }

  private mustGetPost(postId: number): PostRecord {
    const post = this.posts.get(postId);
    if (!post || post.status === 'DELETED') throw new Error('Post not found');
    return post;
  }

  private mustGetComment(commentId: number): CommentRecord {
    const comment = this.comments.get(commentId);
    if (!comment) throw new Error('Comment not found');
    return comment;
  }

  private mustGetFriendRequest(requestId: number): FriendRequestRecord {
    const request = this.friendRequests.get(requestId);
    if (!request) throw new Error('Request not found');
    return request;
  }

  private friendKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  createStory(
    userId: number,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    caption?: string | null,
  ): StoryRecord {
    const id = this.nextStoryId++;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    const story: StoryRecord = {
      id,
      userId,
      mediaUrl,
      mediaType,
      caption: caption || null,
      createdAt,
      expiresAt,
      viewCount: 0,
    };
    this.stories.set(id, story);
    this.storyViews.set(id, new Set<number>());
    return story;
  }

  markStoryViewed(userId: number, storyId: number): void {
    const story = this.stories.get(storyId);
    if (!story) return;
    const views = this.storyViews.get(storyId) || new Set<number>();
    if (!views.has(userId)) {
      views.add(userId);
      this.storyViews.set(storyId, views);
      story.viewCount = views.size;
    }
  }

  deleteStory(userId: number, storyId: number): void {
    const story = this.stories.get(storyId);
    if (!story) throw new Error('Story not found');
    if (story.userId !== userId) {
      throw new Error('Forbidden');
    }
    this.stories.delete(storyId);
    this.storyViews.delete(storyId);
  }

  sweepExpiredStories(): number {
    const now = new Date();
    let count = 0;
    for (const [id, story] of this.stories.entries()) {
      if (story.expiresAt <= now) {
        this.stories.delete(id);
        this.storyViews.delete(id);
        count++;
      }
    }
    return count;
  }

  listStoriesFeed(userId: number): StoryFeedItem[] {
    const now = new Date();
    // Gather active stories
    const activeStories = [...this.stories.values()].filter((s) => s.expiresAt > now);

    return activeStories.map((story) => {
      const user = this.users.get(story.userId);
      const views = this.storyViews.get(story.id) || new Set<number>();
      return {
        id: story.id,
        userId: String(story.userId),
        userName: user?.profile.displayName || `User ${story.userId}`,
        userAvatarUrl: user?.profile.avatarMediaId
          ? this.mediaPayload(user.profile.avatarMediaId).url
          : null,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        caption: story.caption,
        createdAt: story.createdAt.toISOString(),
        expiresAt: story.expiresAt.toISOString(),
        viewCount: story.viewCount,
        isViewedByMe: views.has(userId),
        isOwnStory: story.userId === userId,
      };
    });
  }
}

export function createSocialCoreStore(
  storage: MediaStorageAdapter = new InMemoryMediaStorageAdapter(),
  notificationProvider: NotificationDeliveryProvider = NoopNotificationDeliveryProvider,
  identityResolver: IdentityResolver = defaultIdentityResolver,
  mediaPrisma: PrismaClient | null = null,
): SocialCoreStore {
  return new SocialCoreStore(storage, notificationProvider, identityResolver, mediaPrisma);
}
