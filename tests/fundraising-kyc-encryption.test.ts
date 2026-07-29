import {
  blindIndexesEqual,
  blindIndexForKycValue,
  decryptKycField,
  encryptKycField,
  looksLikeKycEnvelope,
  resetKycEncryptionCacheForTests,
} from '../src/modules/fundraising/kyc-encryption';

describe('fundraising KYC field-level encryption', () => {
  const KEY_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const KEY_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=';

  const originalKeys = process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS;
  const originalActive = process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION;
  const originalBlindKey = process.env.FUNDRAISING_KYC_BLIND_INDEX_KEY;

  afterEach(() => {
    process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS = originalKeys;
    process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION = originalActive;
    process.env.FUNDRAISING_KYC_BLIND_INDEX_KEY = originalBlindKey;
    resetKycEncryptionCacheForTests();
  });

  it('round-trips a plaintext value through encrypt/decrypt', () => {
    const plaintext = 'SEED-NID-0001';
    const envelope = encryptKycField(plaintext);
    expect(envelope).not.toContain(plaintext);
    expect(decryptKycField(envelope)).toBe(plaintext);
  });

  it('preserves YYYY-MM-DD DOB semantics exactly (no timezone conversion)', () => {
    const dob = '1998-05-14';
    const envelope = encryptKycField(dob);
    expect(decryptKycField(envelope)).toBe(dob);
  });

  it('never uses a static nonce — two encryptions of the same value produce different envelopes', () => {
    const plaintext = 'repeat-me';
    const envelopeA = encryptKycField(plaintext);
    const envelopeB = encryptKycField(plaintext);
    expect(envelopeA).not.toBe(envelopeB);
    // IV is the second colon-delimited segment.
    expect(envelopeA.split(':')[1]).not.toBe(envelopeB.split(':')[1]);
    expect(decryptKycField(envelopeA)).toBe(plaintext);
    expect(decryptKycField(envelopeB)).toBe(plaintext);
  });

  it('embeds the key version in the envelope and is recognizable via looksLikeKycEnvelope', () => {
    const envelope = encryptKycField('value');
    expect(envelope.startsWith('v1:')).toBe(true);
    expect(looksLikeKycEnvelope(envelope)).toBe(true);
    expect(looksLikeKycEnvelope('SEED-NID-0001')).toBe(false);
    expect(looksLikeKycEnvelope('1995-01-01')).toBe(false);
  });

  it('rejects a tampered ciphertext/authTag (authenticated encryption)', () => {
    const envelope = encryptKycField('sensitive-value');
    const parts = envelope.split(':');
    // Flip the last character of the ciphertext segment.
    const tamperedCiphertext = parts[3]!.slice(0, -1) + (parts[3]!.endsWith('A') ? 'B' : 'A');
    const tampered = [parts[0], parts[1], parts[2], tamperedCiphertext].join(':');
    expect(() => decryptKycField(tampered)).toThrow();
  });

  it('supports key rotation — old envelopes keep decrypting under their original version after the active key changes', () => {
    process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS = JSON.stringify({ '1': KEY_A });
    process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION = '1';
    resetKycEncryptionCacheForTests();
    const oldEnvelope = encryptKycField('rotate-me');
    expect(oldEnvelope.startsWith('v1:')).toBe(true);

    // Rotate: version 2 becomes active, but version 1's key is still present.
    process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS = JSON.stringify({ '1': KEY_A, '2': KEY_B });
    process.env.FUNDRAISING_KYC_ACTIVE_KEY_VERSION = '2';
    resetKycEncryptionCacheForTests();

    const newEnvelope = encryptKycField('rotate-me');
    expect(newEnvelope.startsWith('v2:')).toBe(true);

    // Both the pre- and post-rotation envelopes must still decrypt.
    expect(decryptKycField(oldEnvelope)).toBe('rotate-me');
    expect(decryptKycField(newEnvelope)).toBe('rotate-me');
  });

  it('throws a clear config error when no encryption key is configured', () => {
    delete process.env.FUNDRAISING_KYC_ENCRYPTION_KEYS;
    resetKycEncryptionCacheForTests();
    expect(() => encryptKycField('x')).toThrow(/FUNDRAISING_KYC_ENCRYPTION_KEYS/);
  });

  it('blind index is deterministic for exact-match use cases and constant-time comparable', () => {
    process.env.FUNDRAISING_KYC_BLIND_INDEX_KEY = KEY_A;
    const indexA1 = blindIndexForKycValue('1234567890');
    const indexA2 = blindIndexForKycValue('1234567890');
    const indexB = blindIndexForKycValue('9999999999');
    expect(indexA1).toBe(indexA2);
    expect(blindIndexesEqual(indexA1, indexA2)).toBe(true);
    expect(blindIndexesEqual(indexA1, indexB)).toBe(false);
  });
});
