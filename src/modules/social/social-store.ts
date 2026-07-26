import type {
  MediaStorageAdapter,
  StoredMediaDescriptor,
  UploadedMediaInput,
} from '../media/media-storage';
import { InMemoryMediaStorageAdapter } from '../media/media-storage';

export type ProfileVisibility = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
export type PostPrivacy = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
export type PostType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL';
export type PostCategory = 'GENERAL' | 'FUNDRAISING';
export type CommentStatus = 'ACTIVE' | 'DELETED';

export interface SocialPrincipalLike {
  sub: string;
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
  status: 'READY' | 'PROCESSING' | 'FAILED';
  processingError: string | null;
  createdAt: Date;
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
}

export interface SocialMediaLookupPayload {
  id: number;
  ownerUserId: number;
  filename: string;
  mimetype: string;
  size: number;
  storageKey: string;
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
  private nextMediaId = 1;
  private nextPostId = 1;
  private nextCommentId = 1;
  private nextFriendRequestId = 1;
  private nextNotificationId = 1;
  private nextDeviceTokenId = 1;
  private nextReportId = 1;

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
  private readonly friendRequests = new Map<number, FriendRequestRecord>();
  private readonly friends = new Set<string>();
  private readonly notifications = new Map<number, NotificationRecord>();
  private readonly deviceTokens = new Map<number, DeviceTokenRecord>();
  private readonly deviceTokenByKey = new Map<string, number>();
  private readonly notificationsBySource = new Map<string, number>();
  private readonly reports = new Map<number, ReportRecord>();
  private readonly reportsBySource = new Map<string, number>();
  private readonly notificationPreferences = new Map<
    number,
    { allowEmail: boolean; allowSms: boolean }
  >();

  constructor(
    storage: MediaStorageAdapter = new InMemoryMediaStorageAdapter(),
    notificationProvider: NotificationDeliveryProvider = NoopNotificationDeliveryProvider,
  ) {
    this.storage = storage;
    this.notificationProvider = notificationProvider;
    this.seed();
  }

  reset(): void {
    this.nextMediaId = 1;
    this.nextPostId = 1;
    this.nextCommentId = 1;
    this.nextFriendRequestId = 1;
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
    const stored = {
      storageKey: `seed:${input.ownerUserId}:${this.nextMediaId}`,
      publicUrl: `memory://seed/${input.ownerUserId}/${this.nextMediaId}/${encodeURIComponent(input.filename)}`,
      thumbnailUrl: input.mimetype.startsWith('image/')
        ? `memory://thumb/${this.nextMediaId}`
        : null,
      hlsUrl: input.mimetype.startsWith('video/')
        ? `memory://stream/${this.nextMediaId}.m3u8`
        : null,
      status: 'READY' as const,
      processingError: null,
    };
    return this.addMediaRecord({
      ownerUserId: input.ownerUserId,
      filename: input.filename,
      mimetype: input.mimetype,
      size: input.size,
      stored,
    });
  }

  private addMediaRecord(input: {
    ownerUserId: number;
    filename: string;
    mimetype: string;
    size: number;
    stored: StoredMediaDescriptor;
  }): MediaRecord {
    const media = {
      id: this.nextMediaId++,
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
    };
    this.media.set(media.id, media);
    return media;
  }

  async uploadMedia(
    ownerUserId: number,
    input: UploadedMediaInput,
  ): Promise<SocialMediaUploadResult> {
    const stored = await this.storage.upload(input);
    const media = this.addMediaRecord({
      ownerUserId,
      filename: input.filename,
      mimetype: input.mimetype,
      size: input.size,
      stored,
    });
    return {
      id: media.id,
      url: media.url,
      hlsUrl: media.hlsUrl,
      mimetype: media.mimetype,
      status: media.status,
      thumbnailUrl: media.thumbnailUrl,
    };
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

  resolveUserId(principal: SocialPrincipalLike): number | null {
    const parsed = parseIntStrict(principal.sub);
    return parsed && this.users.has(parsed) ? parsed : null;
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

  createPost(userId: number, input: SocialPostUpsertInput): SocialPostPayload {
    const post = this.createPostRecord({
      authorId: userId,
      type: (input.type?.toString().toUpperCase() as PostType) || 'TEXT',
      category: (input.category?.toString().toUpperCase() as PostCategory) || 'GENERAL',
      caption: normalizeText(input.caption),
      privacy: (input.privacy?.toString().toUpperCase() as PostPrivacy) || 'PUBLIC',
      backgroundStyle: normalizeText(input.backgroundStyle),
      postType: normalizeText(input.postType),
      lostPetName: normalizeText(input.lostPetName),
      lostPetLocation: normalizeText(input.lostPetLocation),
      lostPetContactVisible: input.lostPetContactVisible ?? false,
      mediaIds: safeArray<number>(input.mediaIds)
        .map((value) => Number(value))
        .filter(Number.isFinite),
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
    });
    return this.serializePost(post.id, userId);
  }

  updatePost(userId: number, postId: number, input: SocialPostUpsertInput): SocialPostPayload {
    const post = this.mustGetPost(postId);
    if (post.authorId !== userId) {
      throw new Error('Forbidden');
    }
    if (post.status === 'DELETED') {
      throw new Error('Post not found');
    }
    if (input.caption !== undefined) post.caption = normalizeText(input.caption);
    if (input.type !== undefined && input.type)
      post.type = input.type.toString().toUpperCase() as PostType;
    if (input.category !== undefined && input.category)
      post.category = input.category.toString().toUpperCase() as PostCategory;
    if (input.mediaIds !== undefined)
      post.mediaIds = safeArray<number>(input.mediaIds)
        .map((value) => Number(value))
        .filter(Number.isFinite);
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

  deletePost(userId: number, postId: number): { deleted: true; id: number } {
    const post = this.mustGetPost(postId);
    if (post.authorId !== userId) {
      throw new Error('Forbidden');
    }
    post.status = 'DELETED';
    post.updatedAt = new Date();
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

  listFeed(viewerId: number, limit: number, cursor?: unknown): SocialPostPayload[] {
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
      .filter((comment) => comment.postId === postId && comment.parentId === null)
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

  getPostById(viewerId: number, postId: number): SocialPostPayload {
    const post = this.mustGetPost(postId);
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
      storageKey: media.storageKey,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      hlsUrl: media.hlsUrl,
      status: media.status,
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
      (post) => post.status !== 'DELETED' && this.canViewerSeePost(viewerId, post),
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
}

export function createSocialCoreStore(
  storage: MediaStorageAdapter = new InMemoryMediaStorageAdapter(),
  notificationProvider: NotificationDeliveryProvider = NoopNotificationDeliveryProvider,
): SocialCoreStore {
  return new SocialCoreStore(storage, notificationProvider);
}
