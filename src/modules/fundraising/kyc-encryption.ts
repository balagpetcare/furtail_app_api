import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Application-level authenticated encryption (AES-256-GCM) for KYC/identity
 * fields on `FundraisingVerificationAccount` — national ID, birth
 * registration, passport, student ID, driving licence numbers, addresses,
 * and date of birth. Authorization on the route/service layer is not
 * sufficient on its own for these fields; ciphertext at rest means a raw
 * database read (backup leak, compromised replica, careless `SELECT *`
 * in a future admin tool) does not expose plaintext identity data.
 *
 * Storage format: each encrypted field is one self-describing envelope
 * string — `v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>` — kept in
 * a single `String?` column rather than exploding every sensitive column
 * into three/four parallel columns. The version prefix supports future key
 * rotation: `decryptField` looks up the key by the version embedded in the
 * envelope, so old rows stay decryptable after the active key changes.
 *
 * Keys are loaded ONLY from environment variables, never hardcoded:
 * - `FUNDRAISING_KYC_ENCRYPTION_KEYS`: JSON object mapping key version
 *   (string) to a base64-encoded 32-byte AES-256 key, e.g.
 *   `{"1":"<base64>","2":"<base64>"}`.
 * - `FUNDRAISING_KYC_ACTIVE_KEY_VERSION`: which version new writes use
 *   (defaults to the highest numeric key present).
 *
 * Rotation procedure: add a new version to `FUNDRAISING_KYC_ENCRYPTION_KEYS`,
 * point `FUNDRAISING_KYC_ACTIVE_KEY_VERSION` at it, deploy — new writes use
 * the new key immediately, existing rows keep decrypting fine with their
 * original (still-present) key until a background re-encryption pass (not
 * included here) rewrites them under the new version.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the GCM-recommended size
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

export class KycEncryptionConfigError extends Error {}

interface KeyRing {
  keys: Map<string, Buffer>;
  activeVersion: string;
}

let cachedKeyRing: KeyRing | null = null;

function loadKeyRing(): KeyRing {
  if (cachedKeyRing) return cachedKeyRing;

  const rawKeys = process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS;
  if (!rawKeys || !rawKeys.trim()) {
    throw new KycEncryptionConfigError(
      'FUNDRAISING_KYC_ENCRYPTION_KEYS is not set — refusing to read/write KYC fields ' +
        'without an encryption key configured.',
    );
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(rawKeys);
  } catch {
    throw new KycEncryptionConfigError(
      'FUNDRAISING_KYC_ENCRYPTION_KEYS must be a JSON object of {"version": "base64Key"}.',
    );
  }

  const keys = new Map<string, Buffer>();
  for (const [version, base64Key] of Object.entries(parsed)) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new KycEncryptionConfigError(
        `FUNDRAISING_KYC_ENCRYPTION_KEYS version "${version}" must decode to exactly ` +
          `${KEY_LENGTH} bytes (AES-256) — got ${key.length}.`,
      );
    }
    keys.set(version, key);
  }
  if (keys.size === 0) {
    throw new KycEncryptionConfigError('FUNDRAISING_KYC_ENCRYPTION_KEYS has no key entries.');
  }

  const configuredActive = process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION?.trim();
  const activeVersion =
    configuredActive && keys.has(configuredActive)
      ? configuredActive
      : [...keys.keys()].sort((a, b) => Number(a) - Number(b)).at(-1);
  if (!activeVersion) {
    throw new KycEncryptionConfigError('Could not determine an active KYC encryption key version.');
  }
  if (configuredActive && !keys.has(configuredActive)) {
    throw new KycEncryptionConfigError(
      `FUNDRAISING_KYC_ACTIVE_KEY_VERSION="${configuredActive}" has no matching entry in ` +
        'FUNDRAISING_KYC_ENCRYPTION_KEYS.',
    );
  }

  cachedKeyRing = { keys, activeVersion };
  return cachedKeyRing;
}

/** Test-only: forces the next call to reload keys from process.env. */
export function resetKycEncryptionCacheForTests(): void {
  cachedKeyRing = null;
}

/**
 * Encrypts a plaintext KYC value. A fresh random IV is generated on every
 * call — never reused/static — which is required for GCM's authentication
 * guarantee to hold.
 */
export function encryptKycField(plaintext: string): string {
  const { keys, activeVersion } = loadKeyRing();
  const key = keys.get(activeVersion)!;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    `v${activeVersion}`,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Decrypts an envelope produced by `encryptKycField`, using the key version embedded in it (supports rotation). */
export function decryptKycField(envelope: string): string {
  const { keys } = loadKeyRing();
  const parts = envelope.split(':');
  if (parts.length !== 4 || !parts[0]!.startsWith('v')) {
    throw new Error('Malformed KYC encryption envelope.');
  }
  const [versionTag, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const version = versionTag.slice(1);
  const key = keys.get(version);
  if (!key) {
    throw new Error(`No decryption key available for KYC envelope version "${version}".`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** True if a stored string looks like our envelope format (vs legacy/plain text — used defensively during backfill). */
export function looksLikeKycEnvelope(value: string): boolean {
  return /^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Deterministic keyed hash (HMAC-SHA256) for the rare case where an exact-
 * match lookup against an encrypted field is genuinely required (GCM
 * ciphertext is non-deterministic — different every time — so it can never
 * be queried directly). Not currently wired to any column: no fundraising
 * lookup queries by national ID/passport/etc. today. Kept available so a
 * future genuine need (e.g. duplicate-NID fraud detection) doesn't require
 * a novel design, without adding an unused index today for "just in case".
 */
export function blindIndexForKycValue(plaintext: string): string {
  const raw = process.env.FUNDRAISING_KYC_BLIND_INDEX_KEY;
  if (!raw) {
    throw new KycEncryptionConfigError('FUNDRAISING_KYC_BLIND_INDEX_KEY is not set.');
  }
  const key = Buffer.from(raw, 'base64');
  return createHmac('sha256', key).update(plaintext.trim().toLowerCase()).digest('base64');
}

/** Constant-time comparison for blind-index lookups, to avoid timing side channels. */
export function blindIndexesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
