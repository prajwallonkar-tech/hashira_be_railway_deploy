import { KMSClient } from '@aws-sdk/client-kms';
import { recoverAddress, keccak256, getAddress } from 'viem';
import { BlockchainSigningService } from './BlockchainSigningService';

// Keep keccak256 and getAddress real — only mock recoverAddress
jest.mock('viem', () => {
  const actual = jest.requireActual<typeof import('viem')>('viem');
  return { ...actual, recoverAddress: jest.fn() };
});

const mockRecoverAddress = recoverAddress as jest.MockedFunction<
  typeof recoverAddress
>;

// ─── DER test-fixture builders ────────────────────────────────────────────────

function buildDerSig(rHex: string, sHex: string): Uint8Array {
  const r = Buffer.from(rHex, 'hex');
  const s = Buffer.from(sHex, 'hex');
  // DER positive-integer encoding: prepend 0x00 when high bit is set
  const rEnc = r[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), r]) : r;
  const sEnc = s[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), s]) : s;
  const body = Buffer.concat([
    Buffer.from([0x02, rEnc.length]),
    rEnc,
    Buffer.from([0x02, sEnc.length]),
    sEnc,
  ]);
  return Uint8Array.from(
    Buffer.concat([Buffer.from([0x30, body.length]), body]),
  );
}

function buildDerPubKey(xHex: string, yHex: string): Uint8Array {
  const x = Buffer.from(xHex, 'hex');
  const y = Buffer.from(yHex, 'hex');
  const point = Buffer.concat([Buffer.from([0x04]), x, y]); // 65 bytes
  const bitStringBody = Buffer.concat([Buffer.from([0x00]), point]);
  const algId = Buffer.from([
    0x30,
    0x10,
    0x06,
    0x07,
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x02,
    0x01, // OID id-ecPublicKey
    0x06,
    0x05,
    0x2b,
    0x81,
    0x04,
    0x00,
    0x0a, // OID secp256k1
  ]);
  const bitStringTag = Buffer.from([0x03, bitStringBody.length]);
  const seqContent = Buffer.concat([algId, bitStringTag, bitStringBody]);
  return Uint8Array.from(
    Buffer.concat([Buffer.from([0x30, seqContent.length]), seqContent]),
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// r and s both < 0x80 — no padding needed
const R_HEX =
  '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
const S_HEX =
  '2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40';
// r with high bit set — needs 0x00 prefix in DER
const R_HIGH_HEX =
  '8102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

const X_HEX =
  '0101010101010101010101010101010101010101010101010101010101010101';
const Y_HEX =
  '0202020202020202020202020202020202020202020202020202020202020202';

const DER_SIG = buildDerSig(R_HEX, S_HEX);
const DER_SIG_HIGH_R = buildDerSig(R_HIGH_HEX, S_HEX);
const DER_PUB_KEY = buildDerPubKey(X_HEX, Y_HEX);

// Derive expected address from X_HEX + Y_HEX using the same logic as the service
const PUB_KEY_BYTES = Uint8Array.from(
  Buffer.concat([Buffer.from(X_HEX, 'hex'), Buffer.from(Y_HEX, 'hex')]),
);
const EXPECTED_ADDRESS = getAddress(`0x${keccak256(PUB_KEY_BYTES).slice(-40)}`);

const TEST_DIGEST = new Uint8Array(32).fill(0xab);

// ─── Setup ────────────────────────────────────────────────────────────────────

let service: BlockchainSigningService;
let mockSend: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.KMS_SIGNING_KEY_ID =
    'arn:aws:kms:us-east-1:123456789:key/test-key-id';
  mockSend = jest.fn();
  service = new BlockchainSigningService({
    send: mockSend,
  } as unknown as KMSClient);
});

afterEach(() => {
  delete process.env.KMS_SIGNING_KEY_ID;
});

// ─── parseDerSignature ────────────────────────────────────────────────────────

describe('parseDerSignature', () => {
  it('parses standard DER signature into r and s hex strings', () => {
    const { r, s } = service.parseDerSignature(DER_SIG);
    expect(r).toBe(`0x${R_HEX}`);
    expect(s).toBe(`0x${S_HEX}`);
  });

  it('strips 0x00 padding from r when high bit is set', () => {
    const { r } = service.parseDerSignature(DER_SIG_HIGH_R);
    expect(r).toBe(`0x${R_HIGH_HEX}`);
  });

  it('returns 0x-prefixed 32-byte hex strings', () => {
    const { r, s } = service.parseDerSignature(DER_SIG);
    expect(r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('pads r to 32 bytes when DER integer is shorter', () => {
    // r of 31 bytes (leading zero stripped by DER)
    const shortR = '01'.repeat(31);
    const der = buildDerSig(shortR, S_HEX);
    const { r } = service.parseDerSignature(der);
    expect(r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.length).toBe(66); // '0x' + 64 hex chars
  });

  it('throws on invalid SEQUENCE tag', () => {
    const bad = Uint8Array.from([
      0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02,
    ]);
    expect(() => service.parseDerSignature(bad)).toThrow(/SEQUENCE/);
  });

  it('throws on invalid INTEGER tag for r', () => {
    const bad = Uint8Array.from([
      0x30, 0x06, 0x03, 0x01, 0x01, 0x02, 0x01, 0x02,
    ]);
    expect(() => service.parseDerSignature(bad)).toThrow(/INTEGER/);
  });

  it('throws on invalid INTEGER tag for s', () => {
    const bad = Uint8Array.from([
      0x30, 0x06, 0x02, 0x01, 0x01, 0x03, 0x01, 0x02,
    ]);
    expect(() => service.parseDerSignature(bad)).toThrow(/INTEGER/);
  });
});

// ─── parseDerPublicKey ────────────────────────────────────────────────────────

describe('parseDerPublicKey', () => {
  it('returns 64-byte uncompressed public key (strips 0x04 prefix)', () => {
    const result = service.parseDerPublicKey(DER_PUB_KEY);
    expect(result).toHaveLength(64);
    expect(result).toEqual(PUB_KEY_BYTES);
  });

  it('throws when 0x04 uncompressed prefix is not found', () => {
    // Replace the 0x04 marker with 0x03 (compressed key)
    const bad = Buffer.from(DER_PUB_KEY);
    bad[bad.length - 65] = 0x03;
    expect(() => service.parseDerPublicKey(Uint8Array.from(bad))).toThrow(
      /0x04/,
    );
  });
});

// ─── getSignerAddress ─────────────────────────────────────────────────────────

describe('getSignerAddress', () => {
  it('derives the EVM address from the KMS public key', async () => {
    mockSend.mockResolvedValue({ PublicKey: DER_PUB_KEY });

    const address = await service.getSignerAddress();

    expect(address).toBe(EXPECTED_ADDRESS);
  });

  it('returns a checksummed EIP-55 address', async () => {
    mockSend.mockResolvedValue({ PublicKey: DER_PUB_KEY });

    const address = await service.getSignerAddress();

    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // EIP-55 checksum: getAddress() would not change it
    expect(getAddress(address)).toBe(address);
  });

  it('throws when KMS returns no public key', async () => {
    mockSend.mockResolvedValue({});

    await expect(service.getSignerAddress()).rejects.toThrow(/no public key/i);
  });

  it('throws when KMS_SIGNING_KEY_ID env var is missing', async () => {
    delete process.env.KMS_SIGNING_KEY_ID;

    await expect(service.getSignerAddress()).rejects.toThrow(
      /KMS_SIGNING_KEY_ID/,
    );
  });
});

// ─── signHash ─────────────────────────────────────────────────────────────────

describe('signHash', () => {
  it('returns { r, s, v } with correct hex format and bigint v', async () => {
    mockSend
      .mockResolvedValueOnce({ Signature: DER_SIG })
      .mockResolvedValueOnce({ PublicKey: DER_PUB_KEY });
    mockRecoverAddress.mockResolvedValue(EXPECTED_ADDRESS);

    const result = await service.signHash(TEST_DIGEST);

    expect(result.r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.s).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typeof result.v).toBe('bigint');
  });

  it('calls KMS SignCommand with DIGEST message type and ECDSA_SHA_256', async () => {
    mockSend
      .mockResolvedValueOnce({ Signature: DER_SIG })
      .mockResolvedValueOnce({ PublicKey: DER_PUB_KEY });
    mockRecoverAddress.mockResolvedValue(EXPECTED_ADDRESS);

    await service.signHash(TEST_DIGEST);

    expect(mockSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        input: expect.objectContaining({
          KeyId: 'arn:aws:kms:us-east-1:123456789:key/test-key-id',
          Message: TEST_DIGEST,
          MessageType: 'DIGEST',
          SigningAlgorithm: 'ECDSA_SHA_256',
        }),
      }),
    );
  });

  it('returns v=27n when recovery with 27 matches signer address', async () => {
    mockSend
      .mockResolvedValueOnce({ Signature: DER_SIG })
      .mockResolvedValueOnce({ PublicKey: DER_PUB_KEY });
    mockRecoverAddress.mockImplementation(({ signature }) =>
      Promise.resolve(
        (signature as { v: bigint }).v === 27n
          ? EXPECTED_ADDRESS
          : '0x0000000000000000000000000000000000000001',
      ),
    );

    const { v } = await service.signHash(TEST_DIGEST);
    expect(v).toBe(27n);
  });

  it('returns v=28n when only recovery with 28 matches signer address', async () => {
    mockSend
      .mockResolvedValueOnce({ Signature: DER_SIG })
      .mockResolvedValueOnce({ PublicKey: DER_PUB_KEY });
    mockRecoverAddress.mockImplementation(({ signature }) =>
      Promise.resolve(
        (signature as { v: bigint }).v === 28n
          ? EXPECTED_ADDRESS
          : '0x0000000000000000000000000000000000000001',
      ),
    );

    const { v } = await service.signHash(TEST_DIGEST);
    expect(v).toBe(28n);
  });

  it('throws when neither v=27 nor v=28 recovers the signer address', async () => {
    mockSend
      .mockResolvedValueOnce({ Signature: DER_SIG })
      .mockResolvedValueOnce({ PublicKey: DER_PUB_KEY });
    mockRecoverAddress.mockResolvedValue(
      '0x0000000000000000000000000000000000000001',
    );

    await expect(service.signHash(TEST_DIGEST)).rejects.toThrow(
      /recovery bit/i,
    );
  });

  it('throws when KMS returns no signature', async () => {
    mockSend.mockResolvedValue({});

    await expect(service.signHash(TEST_DIGEST)).rejects.toThrow(
      /no signature/i,
    );
  });

  it('throws when KMS_SIGNING_KEY_ID env var is missing', async () => {
    delete process.env.KMS_SIGNING_KEY_ID;

    await expect(service.signHash(TEST_DIGEST)).rejects.toThrow(
      /KMS_SIGNING_KEY_ID/,
    );
  });

  it('propagates KMS network errors', async () => {
    mockSend.mockRejectedValue(new Error('KMS timeout'));

    await expect(service.signHash(TEST_DIGEST)).rejects.toThrow('KMS timeout');
  });
});
