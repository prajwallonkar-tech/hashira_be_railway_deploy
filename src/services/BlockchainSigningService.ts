import {
  KMSClient,
  SignCommand,
  GetPublicKeyCommand,
  MessageType,
  SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import { keccak256, getAddress, recoverAddress } from 'viem';

export class BlockchainSigningService {
  constructor(private readonly kmsClient: KMSClient) {}

  async signHash(
    digest: Uint8Array,
  ): Promise<{ r: `0x${string}`; s: `0x${string}`; v: bigint }> {
    if (!process.env.KMS_SIGNING_KEY_ID) {
      throw new Error('KMS_SIGNING_KEY_ID environment variable is not set');
    }

    const command = new SignCommand({
      KeyId: process.env.KMS_SIGNING_KEY_ID,
      Message: digest,
      MessageType: MessageType.DIGEST,
      SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
    });

    const response = await this.kmsClient.send(command);

    if (!response.Signature) {
      throw new Error('KMS returned no signature');
    }

    const { r, s } = this.parseDerSignature(response.Signature);
    const v = await this.recoverV(digest, r, s);

    return { r, s, v };
  }

  async getSignerAddress(): Promise<`0x${string}`> {
    if (!process.env.KMS_SIGNING_KEY_ID) {
      throw new Error('KMS_SIGNING_KEY_ID environment variable is not set');
    }

    const command = new GetPublicKeyCommand({
      KeyId: process.env.KMS_SIGNING_KEY_ID,
    });

    const response = await this.kmsClient.send(command);

    if (!response.PublicKey) {
      throw new Error('KMS returned no public key');
    }

    const pubKeyBytes = this.parseDerPublicKey(response.PublicKey);

    const hash = keccak256(pubKeyBytes);
    return getAddress(`0x${hash.slice(-40)}`);
  }

  parseDerSignature(der: Uint8Array): { r: `0x${string}`; s: `0x${string}` } {
    if (der[0] !== 0x30) {
      throw new Error('Invalid DER signature: expected SEQUENCE tag 0x30');
    }

    // Skip tag + length field
    let offset = 1;
    if (der[offset] & 0x80) {
      offset += 1 + (der[offset] & 0x7f);
    } else {
      offset += 1;
    }

    // Parse r INTEGER
    if (der[offset] !== 0x02) {
      throw new Error('Invalid DER signature: expected INTEGER tag 0x02 for r');
    }
    offset++;
    let rLen = der[offset];
    offset++;
    if (der[offset] === 0x00) {
      rLen--;
      offset++;
    }
    const rBytes = der.slice(offset, offset + rLen);
    offset += rLen;

    // Parse s INTEGER
    if (der[offset] !== 0x02) {
      throw new Error('Invalid DER signature: expected INTEGER tag 0x02 for s');
    }
    offset++;
    let sLen = der[offset];
    offset++;
    if (der[offset] === 0x00) {
      sLen--;
      offset++;
    }
    const sBytes = der.slice(offset, offset + sLen);

    const r: `0x${string}` = `0x${Buffer.from(rBytes).toString('hex').padStart(64, '0')}`;
    const s: `0x${string}` = `0x${Buffer.from(sBytes).toString('hex').padStart(64, '0')}`;

    return { r, s };
  }

  parseDerPublicKey(der: Uint8Array): Uint8Array {
    // SubjectPublicKeyInfo ends with 0x04 [x-32] [y-32] (65 bytes)
    const point = der.slice(-65);
    if (point[0] !== 0x04) {
      throw new Error(
        'Expected uncompressed secp256k1 public key (0x04 prefix not found)',
      );
    }
    return point.slice(1); // 64 bytes: x || y
  }

  private async recoverV(
    digest: Uint8Array,
    r: `0x${string}`,
    s: `0x${string}`,
  ): Promise<bigint> {
    const hash: `0x${string}` = `0x${Buffer.from(digest).toString('hex')}`;
    const signerAddress = await this.getSignerAddress();

    for (const v of [27n, 28n]) {
      try {
        const recovered = await recoverAddress({
          hash,
          signature: { r, s, v },
        });
        if (recovered.toLowerCase() === signerAddress.toLowerCase()) {
          return v;
        }
      } catch {
        // try next v
      }
    }

    throw new Error(
      'Could not determine recovery bit: neither v=27 nor v=28 recovers the signer address',
    );
  }
}
