import { timingSafeEqual, randomBytes } from 'crypto';
import {
  findApiKeyByHash,
  touchLastUsed,
  createApiKey as repoCreateApiKey,
  listApiKeysByOrg,
  findApiKeyByIdAndOrg,
  revokeApiKey as repoRevokeApiKey,
} from '../../repositories/api-key.repository';
import { findOrgById } from '../../repositories/organisation.repository';
import { findUserByEmailAndOrg } from '../../repositories/user.repository';
import { hashSHA256 } from '../../utils/crypto';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../types/errors';
import { ApiKeyPermission, ApiKeyStatus, OrgStatus } from '../../types/enums';

export interface ValidatedApiKey {
  key_id: string;
  org_id: string;
  user_id: string | null;
  permissions: string[];
}

export interface CreateApiKeyInput {
  org_id: string;
  email?: string;
  permissions?: ApiKeyPermission[];
  name?: string;
}

export interface CreatedApiKey {
  key_id: string;
  api_key: string;
  key_prefix: string;
  name: string | null;
  permissions: ApiKeyPermission[];
  created_at: Date;
}

export interface ApiKeySummary {
  key_id: string;
  key_prefix: string;
  name: string | null;
  permissions: ApiKeyPermission[];
  status: ApiKeyStatus;
  created_at: Date;
  last_used_at: Date | null;
}

export class ApiKeyService {
  async validateApiKey(plaintextKey: string): Promise<ValidatedApiKey> {
    const inboundHash = hashSHA256(plaintextKey);
    const apiKey = await findApiKeyByHash(inboundHash);

    if (!apiKey) {
      throw new AuthError('Invalid API key', 'INVALID_API_KEY');
    }

    // Constant-time comparison guard against any future variations in storage
    const storedHashBuf = Buffer.from(apiKey.key_hash, 'hex');
    const inboundHashBuf = Buffer.from(inboundHash, 'hex');
    if (
      storedHashBuf.length !== inboundHashBuf.length ||
      !timingSafeEqual(storedHashBuf, inboundHashBuf)
    ) {
      throw new AuthError('Invalid API key', 'INVALID_API_KEY');
    }

    const org = await findOrgById(apiKey.org_id);
    if (!org) {
      throw new AuthError('Invalid API key', 'INVALID_API_KEY');
    }

    if (org.status === OrgStatus.SUSPENDED) {
      throw new ForbiddenError('Organisation is suspended', 'ORG_SUSPENDED');
    }

    if (org.status !== OrgStatus.ACTIVE) {
      throw new ForbiddenError('Organisation is not active', 'ORG_NOT_ACTIVE');
    }

    // Fire-and-forget last_used_at touch — failure should not block the request
    touchLastUsed(apiKey.key_id).catch(() => {
      /* swallow — non-critical */
    });

    return {
      key_id: apiKey.key_id,
      org_id: apiKey.org_id,
      user_id: apiKey.user_id,
      permissions: apiKey.permissions,
    };
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const permissions = input.permissions ?? [ApiKeyPermission.EVENTS_WRITE];

    let resolvedUserId: string | null = null;
    if (input.email) {
      const user = await findUserByEmailAndOrg(input.email, input.org_id);
      if (!user) {
        throw new ValidationError(
          'email does not belong to an active user in this organisation',
          'INVALID_USER_FOR_ORG',
          [{ field: 'email', value: input.email }],
        );
      }
      resolvedUserId = user.user_id;
    }

    const plaintextKey = `hsk_${randomBytes(32).toString('base64url')}`;
    const key_hash = hashSHA256(plaintextKey);
    const key_prefix = plaintextKey.slice(0, 8);

    const saved = await repoCreateApiKey({
      org_id: input.org_id,
      user_id: resolvedUserId,
      key_hash,
      key_prefix,
      permissions,
      name: input.name ?? null,
    });

    return {
      key_id: saved.key_id,
      api_key: plaintextKey,
      key_prefix,
      name: saved.name,
      permissions: saved.permissions,
      created_at: saved.created_at,
    };
  }

  async listKeys(orgId: string): Promise<ApiKeySummary[]> {
    const rows = await listApiKeysByOrg(orgId);
    return rows.map((k) => ({
      key_id: k.key_id,
      key_prefix: k.key_prefix,
      name: k.name,
      permissions: k.permissions,
      status: k.status,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    }));
  }

  async revokeKey(keyId: string, orgId: string): Promise<void> {
    const existing = await findApiKeyByIdAndOrg(keyId, orgId);
    if (!existing) {
      throw new NotFoundError('API key not found');
    }
    if (existing.status === ApiKeyStatus.REVOKED) {
      return;
    }
    await repoRevokeApiKey(keyId, orgId);
  }
}

export const apiKeyService = new ApiKeyService();
