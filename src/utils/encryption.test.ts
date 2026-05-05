import { encrypt, decrypt } from './encryption';

const VALID_KEY = Buffer.alloc(32, 0x42).toString('base64'); // 32-byte key, base64
const PLAINTEXT = 'Hello, this is a secret prompt!';

describe('encrypt / decrypt', () => {
  beforeEach(() => {
    process.env.EVENT_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.EVENT_ENCRYPTION_KEY;
  });

  it('round-trips plaintext through encrypt then decrypt', () => {
    const ciphertext = encrypt(PLAINTEXT);
    expect(decrypt(ciphertext)).toBe(PLAINTEXT);
  });

  it('encrypting the same plaintext twice produces different ciphertext (random IV)', () => {
    const a = encrypt(PLAINTEXT);
    const b = encrypt(PLAINTEXT);
    expect(a).not.toBe(b);
  });

  it('decrypting either copy still returns the original plaintext', () => {
    const a = encrypt(PLAINTEXT);
    const b = encrypt(PLAINTEXT);
    expect(decrypt(a)).toBe(PLAINTEXT);
    expect(decrypt(b)).toBe(PLAINTEXT);
  });

  it('returns a non-empty base64 string', () => {
    const result = encrypt(PLAINTEXT);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });

  it('encoded output is at least IV(12) + authTag(16) + 1 byte long', () => {
    const result = encrypt(PLAINTEXT);
    const buf = Buffer.from(result, 'base64');
    expect(buf.length).toBeGreaterThanOrEqual(12 + 16 + 1);
  });

  it('throws when ciphertext has been tampered (GCM auth tag mismatch)', () => {
    const ciphertext = encrypt(PLAINTEXT);
    const buf = Buffer.from(ciphertext, 'base64');
    // Flip a byte in the ciphertext portion (after IV + authTag)
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws when the auth tag itself is tampered', () => {
    const ciphertext = encrypt(PLAINTEXT);
    const buf = Buffer.from(ciphertext, 'base64');
    // Flip a byte in the auth tag region (bytes 12–27)
    buf[12] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws when EVENT_ENCRYPTION_KEY is missing', () => {
    delete process.env.EVENT_ENCRYPTION_KEY;
    expect(() => encrypt(PLAINTEXT)).toThrow(/EVENT_ENCRYPTION_KEY/);
  });

  it('throws when EVENT_ENCRYPTION_KEY is missing on decrypt', () => {
    const ciphertext = encrypt(PLAINTEXT);
    delete process.env.EVENT_ENCRYPTION_KEY;
    expect(() => decrypt(ciphertext)).toThrow(/EVENT_ENCRYPTION_KEY/);
  });

  it('throws when EVENT_ENCRYPTION_KEY is not a valid 32-byte base64 key', () => {
    process.env.EVENT_ENCRYPTION_KEY = 'tooshort';
    expect(() => encrypt(PLAINTEXT)).toThrow();
  });

  it('preserves unicode and multi-byte characters through round-trip', () => {
    const unicode = '日本語テスト — prompt with 🔥 emoji and symbols: €¥£';
    const ciphertext = encrypt(unicode);
    expect(decrypt(ciphertext)).toBe(unicode);
  });

  it('preserves an empty string through round-trip', () => {
    const ciphertext = encrypt('');
    expect(decrypt('')).toBe('');
    // If input is empty, decrypt of an encrypt of '' should work
    expect(decrypt(ciphertext)).toBe('');
  });
});
