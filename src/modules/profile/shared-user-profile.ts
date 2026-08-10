import type { PrismaClient, Prisma } from '@prisma/client';

import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

const RESERVED_USERNAMES = new Set([
  'about',
  'admin',
  'api',
  'auth',
  'donate',
  'donation',
  'edit',
  'feed',
  'forgot-password',
  'fundraising',
  'help',
  'login',
  'logout',
  'me',
  'messages',
  'new',
  'notifications',
  'payment',
  'payments',
  'pets',
  'profile',
  'register',
  'reset-password',
  'root',
  'search',
  'settings',
  'signup',
  'support',
  'user',
  'users',
]);

const DEFAULT_PUBLIC_NAME = 'Furtail Member';
const DISPLAY_NAME_MAX = 80;
const BIO_MAX = 280;
const PROFILE_TEXT_MAX = 120;
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
type SharedProfileRow = {
  id: number;
  createdAt?: Date;
  updatedAt?: Date;
  auth?: { email?: string | null; phone?: string | null } | null;
  profile?: {
    displayName?: string | null;
    username?: string | null;
    bio?: string | null;
    visibility?: string | null;
    showEmail?: boolean | null;
    showPhone?: boolean | null;
    education?: string | null;
    placeLive?: string | null;
    from?: string | null;
    profileType?: string | null;
    workStatus?: string | null;
    religiousStatus?: string | null;
    gender?: string | null;
    birthdate?: Date | null;
    maritalStatus?: string | null;
    defaultPostAudience?: string | null;
    followersVisibility?: string | null;
    followingVisibility?: string | null;
    discoverableByEmail?: boolean | null;
    discoverableByPhone?: boolean | null;
    discoverableBySearch?: boolean | null;
    whoCanFollow?: string | null;
    whoCanMessage?: string | null;
    whoCanComment?: string | null;
    whoCanMention?: string | null;
    whoCanTag?: string | null;
    requiresTagReview?: boolean | null;
    requiresProfilePostReview?: boolean | null;
    showActivityStatus?: boolean | null;
    showReadReceipts?: boolean | null;
    notificationPreferences?: unknown | null;
    avatarMedia?: {
      id: number;
      url: string;
      thumbnailUrl: string | null;
      hlsUrl: string | null;
      mimetype: string;
    } | null;
    coverMedia?: {
      id: number;
      url: string;
      thumbnailUrl: string | null;
      hlsUrl: string | null;
      mimetype: string;
    } | null;
  } | null;
};

export interface SharedProfileUpdateInput {
  displayName?: unknown;
  username?: unknown;
  bio?: unknown;
  visibility?: unknown;
  showEmail?: unknown;
  showPhone?: unknown;
  avatarMediaId?: number | null | undefined;
  coverMediaId?: number | null | undefined;
  education?: unknown;
  placeLive?: unknown;
  from?: unknown;
  profileType?: unknown;
  workStatus?: unknown;
  religiousStatus?: unknown;
  gender?: unknown;
  birthdate?: unknown;
  maritalStatus?: unknown;
  defaultPostAudience?: unknown;
  followersVisibility?: unknown;
  followingVisibility?: unknown;
  discoverableByEmail?: unknown;
  discoverableByPhone?: unknown;
  discoverableBySearch?: unknown;
  whoCanFollow?: unknown;
  whoCanMessage?: unknown;
  whoCanComment?: unknown;
  whoCanMention?: unknown;
  whoCanTag?: unknown;
  requiresTagReview?: unknown;
  requiresProfilePostReview?: unknown;
  showActivityStatus?: unknown;
  showReadReceipts?: unknown;
  notificationPreferences?: unknown;
}

export interface RepairResultItem {
  userId: number;
  subject: string | null;
  beforeDisplayName: string | null;
  beforeUsername: string | null;
  beforeBio: string | null;
  afterDisplayName: string;
  afterUsername: string | null;
  afterBio: string | null;
  changed: boolean;
  // 'repairable': changed=true and (in apply mode) successfully applied, or
  //   (in dry-run mode) would apply cleanly with no conflict.
  // 'skipped': changed=false — nothing to repair.
  // 'conflicting': changed=true but the generated replacement username
  //   already belongs to a different user — never applied automatically,
  //   needs manual disambiguation.
  outcome: 'repairable' | 'skipped' | 'conflicting';
}

function isEmailLike(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes('@');
}

function trimOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function buildPublicId(userId: number): string {
  return `usr_${userId}`;
}

function containsControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function generatedUsernameForUser(userId: number, subject?: string | null): string {
  const suffixSource =
    trimOrNull(subject)
      ?.replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || String(userId);
  return `member${suffixSource}`.slice(0, 30).padEnd(9, '0');
}

function normalizeDisplayName(value: unknown): string | null {
  const text = trimOrNull(value);
  if (text === null) return null;
  if (text.length > DISPLAY_NAME_MAX) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Display name is too long', 422, {
      field: 'displayName',
      maxLength: DISPLAY_NAME_MAX,
    });
  }
  if (containsControlChars(text)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Display name contains invalid characters',
      422,
      {
        field: 'displayName',
      },
    );
  }
  if (isEmailLike(text)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Display name cannot be an email address', 422, {
      field: 'displayName',
    });
  }
  return text;
}

function normalizeUsername(value: unknown): string | null {
  const text = trimOrNull(value);
  if (text === null) return null;
  const normalized = text.toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Username must be 3-30 characters using lowercase letters, digits, or underscores',
      422,
      {
        field: 'username',
      },
    );
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'This username is reserved', 422, {
      field: 'username',
    });
  }
  return normalized;
}

function normalizeBio(value: unknown): string | null {
  const text = trimOrNull(value);
  if (text === null) return null;
  if (text.length > BIO_MAX) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Bio is too long', 422, {
      field: 'bio',
      maxLength: BIO_MAX,
    });
  }
  if (containsControlChars(text)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Bio contains invalid characters', 422, {
      field: 'bio',
    });
  }
  return text;
}

function normalizeOptionalProfileText(
  value: unknown,
  field: string,
  maxLength = PROFILE_TEXT_MAX,
): string | null {
  const text = trimOrNull(value);
  if (text === null) return null;
  if (text.length > maxLength) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is too long`, 422, {
      field,
      maxLength,
    });
  }
  if (containsControlChars(text)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} contains invalid characters`, 422, {
      field,
    });
  }
  return text;
}

function normalizeVisibility(value: unknown): 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE' | undefined {
  if (value === undefined) return undefined;
  const text = trimOrNull(value)?.toUpperCase();
  if (!text) return undefined;
  if (text === 'PUBLIC' || text === 'FOLLOWERS_ONLY' || text === 'PRIVATE') {
    return text;
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid profile visibility', 422, {
    field: 'visibility',
  });
}

function normalizePostPrivacy(value: unknown): 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE' | undefined {
  if (value === undefined) return undefined;
  const text = trimOrNull(value)?.toUpperCase();
  if (!text) return undefined;
  if (text === 'PUBLIC' || text === 'FOLLOWERS_ONLY' || text === 'PRIVATE') {
    return text;
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid post privacy', 422, {
    field: 'defaultPostAudience',
  });
}

function normalizeInteractionSetting(value: unknown, field: string): 'EVERYONE' | 'FOLLOWERS' | 'NOBODY' | undefined {
  if (value === undefined) return undefined;
  const text = trimOrNull(value)?.toUpperCase();
  if (!text) return undefined;
  if (text === 'EVERYONE' || text === 'FOLLOWERS' || text === 'NOBODY') {
    return text;
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid setting for ${field}`, 422, {
    field,
  });
}

function normalizeOptionalBool(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid boolean value', 422, {
    field,
  });
}

function toMediaPayload(
  media:
    | {
        id: number;
        url: string;
        thumbnailUrl: string | null;
        hlsUrl: string | null;
        mimetype: string;
      }
    | null
    | undefined,
) {
  if (!media) return null;
  return {
    id: media.id,
    url: media.url,
    thumbnailUrl: media.thumbnailUrl,
    hlsUrl: media.hlsUrl,
    type: media.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
    mimeType: media.mimetype,
  };
}

export function sanitizePublicDisplayName(input: {
  displayName?: string | null;
  username?: string | null;
}): string {
  const displayName = trimOrNull(input.displayName);
  if (displayName && !isEmailLike(displayName)) return displayName;
  const username = trimOrNull(input.username);
  if (username && !isEmailLike(username)) return username;
  return DEFAULT_PUBLIC_NAME;
}

export function toPublicAuthor(input: {
  userId: number;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}) {
  const username = trimOrNull(input.username);
  return {
    id: input.userId,
    publicId: buildPublicId(input.userId),
    displayName: sanitizePublicDisplayName(input),
    username: username && !isEmailLike(username) ? username : null,
    avatarUrl: trimOrNull(input.avatarUrl),
  };
}

export function toSharedProfilePayload(row: SharedProfileRow, includePrivateIdentity: boolean) {
  const displayName = sanitizePublicDisplayName({
    displayName: row.profile?.displayName ?? null,
    username: row.profile?.username ?? null,
  });
  const username = trimOrNull(row.profile?.username);
  return {
    id: row.id,
    publicId: buildPublicId(row.id),
    auth: includePrivateIdentity
      ? {
          email: row.auth?.email ?? '',
          phone: row.auth?.phone ?? null,
        }
      : {
          email: '',
          phone: null,
        },
    profile: {
      displayName,
      username: username && !isEmailLike(username) ? username : null,
      bio: row.profile?.bio ?? null,
      avatarMedia: toMediaPayload(row.profile?.avatarMedia),
      coverMedia: toMediaPayload(row.profile?.coverMedia),
      education: row.profile?.education ?? null,
      placeLive: row.profile?.placeLive ?? null,
      from: row.profile?.from ?? null,
      profileType: row.profile?.profileType ?? null,
      workStatus: row.profile?.workStatus ?? null,
      religiousStatus: row.profile?.religiousStatus ?? null,
      gender: row.profile?.gender ?? null,
      birthdate: row.profile?.birthdate?.toISOString() ?? null,
      maritalStatus: row.profile?.maritalStatus ?? null,
      visibility: row.profile?.visibility ?? 'PUBLIC',
      showEmail: Boolean(row.profile?.showEmail),
      showPhone: Boolean(row.profile?.showPhone),
      defaultPostAudience: row.profile?.defaultPostAudience ?? 'PUBLIC',
      followersVisibility: row.profile?.followersVisibility ?? 'PUBLIC',
      followingVisibility: row.profile?.followingVisibility ?? 'PUBLIC',
      discoverableByEmail: Boolean(row.profile?.discoverableByEmail),
      discoverableByPhone: Boolean(row.profile?.discoverableByPhone),
      discoverableBySearch: row.profile?.discoverableBySearch ?? true,
      whoCanFollow: row.profile?.whoCanFollow ?? 'EVERYONE',
      whoCanMessage: row.profile?.whoCanMessage ?? 'EVERYONE',
      whoCanComment: row.profile?.whoCanComment ?? 'EVERYONE',
      whoCanMention: row.profile?.whoCanMention ?? 'EVERYONE',
      whoCanTag: row.profile?.whoCanTag ?? 'EVERYONE',
      requiresTagReview: Boolean(row.profile?.requiresTagReview),
      requiresProfilePostReview: Boolean(row.profile?.requiresProfilePostReview),
      showActivityStatus: Boolean(row.profile?.showActivityStatus),
      showReadReceipts: Boolean(row.profile?.showReadReceipts),
      notificationPreferences: row.profile?.notificationPreferences ?? null,
    },
    publicAuthor: toPublicAuthor({
      userId: row.id,
      displayName,
      username: row.profile?.username ?? null,
      avatarUrl: row.profile?.avatarMedia?.url ?? null,
    }),
  };
}

async function loadRow(prisma: PrismaClient, userId: number): Promise<SharedProfileRow | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: {
        include: {
          avatarMedia: true,
          coverMedia: true,
        },
      },
    },
  });
  if (!user) return null;
  const auth = await prisma.userAuth.findFirst({
    where: { userId, provider: 'CENTRAL_AUTH' },
  });
  return {
    id: user.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    auth,
    profile: user.profile
      ? {
          displayName: user.profile.displayName,
          username: user.profile.username,
          bio: user.profile.bio,
          visibility: user.profile.visibility,
          showEmail: user.profile.showEmail,
          showPhone: user.profile.showPhone,
          education: user.profile.education,
          placeLive: user.profile.placeLive,
          from: user.profile.from,
          profileType: user.profile.profileType,
          workStatus: user.profile.workStatus,
          religiousStatus: user.profile.religiousStatus,
          gender: user.profile.gender,
          birthdate: user.profile.birthdate,
          maritalStatus: user.profile.maritalStatus,
          defaultPostAudience: user.profile.defaultPostAudience,
          followersVisibility: user.profile.followersVisibility,
          followingVisibility: user.profile.followingVisibility,
          discoverableByEmail: user.profile.discoverableByEmail,
          discoverableByPhone: user.profile.discoverableByPhone,
          discoverableBySearch: user.profile.discoverableBySearch,
          whoCanFollow: user.profile.whoCanFollow,
          whoCanMessage: user.profile.whoCanMessage,
          whoCanComment: user.profile.whoCanComment,
          whoCanMention: user.profile.whoCanMention,
          whoCanTag: user.profile.whoCanTag,
          requiresTagReview: user.profile.requiresTagReview,
          requiresProfilePostReview: user.profile.requiresProfilePostReview,
          showActivityStatus: user.profile.showActivityStatus,
          showReadReceipts: user.profile.showReadReceipts,
          notificationPreferences: user.profile.notificationPreferences,
          avatarMedia: user.profile.avatarMedia,
          coverMedia: user.profile.coverMedia,
        }
      : null,
  };
}

export async function getSharedProfileForUser(
  prisma: PrismaClient,
  userId: number,
  viewerId?: number | null,
  includePrivateIdentity = true,
) {
  if (viewerId && viewerId !== userId) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedUserId: userId },
          { blockerId: userId, blockedUserId: viewerId },
        ],
      },
    });
    if (block) throw AppError.notFound('User not found');
  }

  const row = await loadRow(prisma, userId);
  if (!row) throw AppError.notFound('User not found');
  return toSharedProfilePayload(row, includePrivateIdentity);
}

export async function getSharedProfileByUsername(
  prisma: PrismaClient,
  usernameRaw: string,
  viewerId?: number | null,
  includePrivateIdentity = false,
) {
  const username = normalizeUsername(usernameRaw);
  if (!username) throw AppError.notFound('User not found');
  const profile = await prisma.userProfile.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { userId: true, discoverableBySearch: true },
  });
  if (!profile) throw AppError.notFound('User not found');

  // discoverableBySearch=false hides the account from username lookup for
  // everyone except the account owner — reported as a plain 404, same as a
  // block, so a probe can't distinguish "not discoverable" from "doesn't
  // exist".
  if (viewerId !== profile.userId && !profile.discoverableBySearch) {
    throw AppError.notFound('User not found');
  }

  if (viewerId && viewerId !== profile.userId) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedUserId: profile.userId },
          { blockerId: profile.userId, blockedUserId: viewerId },
        ],
      },
    });
    if (block) throw AppError.notFound('User not found');
  }

  const row = await loadRow(prisma, profile.userId);
  if (!row) throw AppError.notFound('User not found');
  return toSharedProfilePayload(row, includePrivateIdentity);
}

export async function updateSharedProfile(
  prisma: PrismaClient,
  userId: number,
  input: SharedProfileUpdateInput,
) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!existing?.profile) throw AppError.notFound('User profile not found');

  const displayName =
    input.displayName !== undefined ? normalizeDisplayName(input.displayName) : undefined;
  const username = input.username !== undefined ? normalizeUsername(input.username) : undefined;
  const bio = input.bio !== undefined ? normalizeBio(input.bio) : undefined;
  const visibility = normalizeVisibility(input.visibility);
  const showEmail = normalizeOptionalBool(input.showEmail, 'showEmail');
  const showPhone = normalizeOptionalBool(input.showPhone, 'showPhone');
  const education =
    input.education !== undefined
      ? normalizeOptionalProfileText(input.education, 'education')
      : undefined;
  const placeLive =
    input.placeLive !== undefined
      ? normalizeOptionalProfileText(input.placeLive, 'placeLive')
      : undefined;
  const from =
    input.from !== undefined ? normalizeOptionalProfileText(input.from, 'from') : undefined;
  const profileType =
    input.profileType !== undefined
      ? normalizeOptionalProfileText(input.profileType, 'profileType')
      : undefined;
  const workStatus =
    input.workStatus !== undefined
      ? normalizeOptionalProfileText(input.workStatus, 'workStatus')
      : undefined;
  const religiousStatus =
    input.religiousStatus !== undefined
      ? normalizeOptionalProfileText(input.religiousStatus, 'religiousStatus')
      : undefined;
  const gender =
    input.gender !== undefined ? normalizeOptionalProfileText(input.gender, 'gender') : undefined;
  // DEPRECATED: birthdate is no longer writable through the Furtail profile
  // PATCH — Central Auth's User.dateOfBirth is canonical (see
  // scripts/migrate-dob-to-central-auth.ts). input.birthdate is intentionally
  // ignored rather than applied, even if an older client still sends it.
  const maritalStatus =
    input.maritalStatus !== undefined
      ? normalizeOptionalProfileText(input.maritalStatus, 'maritalStatus')
      : undefined;

  const defaultPostAudience = normalizePostPrivacy(input.defaultPostAudience);
  const followersVisibility = normalizeVisibility(input.followersVisibility);
  const followingVisibility = normalizeVisibility(input.followingVisibility);
  
  const discoverableByEmail = normalizeOptionalBool(input.discoverableByEmail, 'discoverableByEmail');
  const discoverableByPhone = normalizeOptionalBool(input.discoverableByPhone, 'discoverableByPhone');
  const discoverableBySearch = normalizeOptionalBool(input.discoverableBySearch, 'discoverableBySearch');
  
  const whoCanFollow = normalizeInteractionSetting(input.whoCanFollow, 'whoCanFollow');
  const whoCanMessage = normalizeInteractionSetting(input.whoCanMessage, 'whoCanMessage');
  const whoCanComment = normalizeInteractionSetting(input.whoCanComment, 'whoCanComment');
  const whoCanMention = normalizeInteractionSetting(input.whoCanMention, 'whoCanMention');
  const whoCanTag = normalizeInteractionSetting(input.whoCanTag, 'whoCanTag');
  
  const requiresTagReview = normalizeOptionalBool(input.requiresTagReview, 'requiresTagReview');
  const requiresProfilePostReview = normalizeOptionalBool(input.requiresProfilePostReview, 'requiresProfilePostReview');
  
  const showActivityStatus = normalizeOptionalBool(input.showActivityStatus, 'showActivityStatus');
  const showReadReceipts = normalizeOptionalBool(input.showReadReceipts, 'showReadReceipts');
  
  const notificationPreferences =
    input.notificationPreferences !== undefined
      ? (input.notificationPreferences as Prisma.InputJsonValue)
      : undefined;

  if (username && username !== existing.profile.username) {
    const conflict = await prisma.userProfile.findFirst({
      where: {
        userId: { not: userId },
        username: { equals: username, mode: 'insensitive' },
      },
      select: { userId: true },
    });
    if (conflict) {
      throw new AppError(ErrorCode.USERNAME_TAKEN, 'Username already taken', 409, {
        field: 'username',
      });
    }
  }

  if (input.avatarMediaId !== undefined && input.avatarMediaId !== null) {
    const media = await prisma.media.findUnique({ where: { id: input.avatarMediaId } });
    if (!media || media.ownerUserId !== userId) {
      throw AppError.mediaNotOwned('Avatar media is not owned by the current user', {
        field: 'avatarMediaId',
      });
    }
  }
  if (input.coverMediaId !== undefined && input.coverMediaId !== null) {
    const media = await prisma.media.findUnique({ where: { id: input.coverMediaId } });
    if (!media || media.ownerUserId !== userId) {
      throw AppError.mediaNotOwned('Cover media is not owned by the current user', {
        field: 'coverMediaId',
      });
    }
  }

  await prisma.userProfile.update({
    where: { userId },
    data: {
      ...(displayName !== undefined ? { displayName: displayName ?? DEFAULT_PUBLIC_NAME } : {}),
      ...(username !== undefined ? { username: username ?? existing.profile.username } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(visibility !== undefined ? { visibility } : {}),
      ...(showEmail !== undefined ? { showEmail } : {}),
      ...(showPhone !== undefined ? { showPhone } : {}),
      ...(education !== undefined ? { education } : {}),
      ...(placeLive !== undefined ? { placeLive } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(profileType !== undefined ? { profileType } : {}),
      ...(workStatus !== undefined ? { workStatus } : {}),
      ...(religiousStatus !== undefined ? { religiousStatus } : {}),
      ...(gender !== undefined ? { gender } : {}),
      // birthdate intentionally omitted — see deprecation note above.
      ...(maritalStatus !== undefined ? { maritalStatus } : {}),
      ...(input.avatarMediaId !== undefined ? { avatarMediaId: input.avatarMediaId } : {}),
      ...(input.coverMediaId !== undefined ? { coverMediaId: input.coverMediaId } : {}),
      ...(defaultPostAudience !== undefined ? { defaultPostAudience } : {}),
      ...(followersVisibility !== undefined ? { followersVisibility } : {}),
      ...(followingVisibility !== undefined ? { followingVisibility } : {}),
      ...(discoverableByEmail !== undefined ? { discoverableByEmail } : {}),
      ...(discoverableByPhone !== undefined ? { discoverableByPhone } : {}),
      ...(discoverableBySearch !== undefined ? { discoverableBySearch } : {}),
      ...(whoCanFollow !== undefined ? { whoCanFollow } : {}),
      ...(whoCanMessage !== undefined ? { whoCanMessage } : {}),
      ...(whoCanComment !== undefined ? { whoCanComment } : {}),
      ...(whoCanMention !== undefined ? { whoCanMention } : {}),
      ...(whoCanTag !== undefined ? { whoCanTag } : {}),
      ...(requiresTagReview !== undefined ? { requiresTagReview } : {}),
      ...(requiresProfilePostReview !== undefined ? { requiresProfilePostReview } : {}),
      ...(showActivityStatus !== undefined ? { showActivityStatus } : {}),
      ...(showReadReceipts !== undefined ? { showReadReceipts } : {}),
      ...(notificationPreferences !== undefined ? { notificationPreferences } : {}),
    },
  });

  return getSharedProfileForUser(prisma, userId);
}

export function buildProvisionedProfileSeed(input: {
  subject: string;
  principalName?: string | null;
}) {
  const displayName = isEmailLike(trimOrNull(input.principalName))
    ? DEFAULT_PUBLIC_NAME
    : (normalizeDisplayName(input.principalName) ?? DEFAULT_PUBLIC_NAME);
  const username = generatedUsernameForUser(0, input.subject);
  return {
    displayName,
    username,
  };
}

export async function repairEmailDerivedProfiles(
  prisma: PrismaClient,
  options: { dryRun?: boolean } = {},
): Promise<{
  scanned: number;
  changed: number;
  repairable: number;
  skipped: number;
  conflicting: number;
  items: RepairResultItem[];
}> {
  const rows = await prisma.user.findMany({
    include: {
      centralAuthLink: true,
      profile: true,
    },
    orderBy: { id: 'asc' },
  });

  // Existing (non-email-like) usernames already on file, used to detect a
  // collision between a freshly generated replacement username and a
  // username some other user already legitimately holds. Case-insensitive,
  // matching the @unique constraint's actual DB behavior isn't
  // case-insensitive here, but username lookups elsewhere in this module
  // (getSharedProfileByUsername) are — checking case-insensitively is the
  // more conservative (fewer false negatives) choice for a repair tool.
  const existingUsernames = new Map<string, number>();
  for (const user of rows) {
    const username = trimOrNull(user.profile?.username);
    if (username) existingUsernames.set(username.toLowerCase(), user.id);
  }
  // Usernames this run has already claimed for another user in the same
  // pass, so two rows needing a repair in the same run can't both pick the
  // same generated username.
  const claimedThisRun = new Set<string>();

  const items: RepairResultItem[] = [];
  for (const user of rows) {
    if (!user.profile) continue;
    const beforeDisplayName = user.profile.displayName;
    const beforeUsername = user.profile.username;
    const beforeBio = user.profile.bio;
    const changedDisplayName =
      isEmailLike(beforeDisplayName) || trimOrNull(beforeDisplayName) === null;
    const changedUsername = isEmailLike(beforeUsername);
    const changedBio = typeof beforeBio === 'string' && beforeBio.toLowerCase().includes('@');
    const afterDisplayName = changedDisplayName
      ? DEFAULT_PUBLIC_NAME
      : sanitizePublicDisplayName({
          displayName: beforeDisplayName,
          username: beforeUsername,
        });
    // generatedUsernameForUser derives the replacement ONLY from the
    // immutable Central Auth `sub` (or, failing that, the internal numeric
    // userId) — never from the email address itself. This is the guarantee
    // that a repaired username never leaks or transforms the email
    // local-part into a public identifier.
    const candidateUsername = changedUsername
      ? generatedUsernameForUser(user.id, user.centralAuthLink?.subject)
      : trimOrNull(beforeUsername);
    const afterBio = changedBio ? null : beforeBio;
    const changed = changedDisplayName || changedUsername || changedBio;

    let outcome: RepairResultItem['outcome'] = 'skipped';
    let afterUsername = candidateUsername;

    if (changed) {
      const candidateKey = candidateUsername?.toLowerCase();
      const heldBy = candidateKey ? existingUsernames.get(candidateKey) : undefined;
      const claimedInRun = candidateKey ? claimedThisRun.has(candidateKey) : false;
      const collides =
        changedUsername && ((heldBy !== undefined && heldBy !== user.id) || claimedInRun);

      if (collides) {
        // Never auto-apply a colliding username — leave the row untouched
        // and report it for manual disambiguation instead of silently
        // picking a different value or crashing the whole run on a DB
        // unique-constraint violation.
        outcome = 'conflicting';
        afterUsername = beforeUsername;
      } else {
        outcome = 'repairable';
        if (changedUsername && candidateKey) {
          claimedThisRun.add(candidateKey);
          existingUsernames.set(candidateKey, user.id);
        }
      }
    }

    items.push({
      userId: user.id,
      subject: user.centralAuthLink?.subject ?? null,
      beforeDisplayName,
      beforeUsername,
      beforeBio,
      afterDisplayName,
      afterUsername,
      afterBio,
      changed,
      outcome,
    });

    if (outcome === 'repairable' && !options.dryRun) {
      await prisma.userProfile.update({
        where: { userId: user.id },
        data: {
          displayName: afterDisplayName,
          username: afterUsername ?? beforeUsername,
          bio: afterBio,
        },
      });
    }
  }

  return {
    scanned: items.length,
    changed: items.filter((item) => item.changed).length,
    repairable: items.filter((item) => item.outcome === 'repairable').length,
    skipped: items.filter((item) => item.outcome === 'skipped').length,
    conflicting: items.filter((item) => item.outcome === 'conflicting').length,
    items,
  };
}
