import { AppDataSource } from '../config/database';
import { ApiKey } from '../entities/api-key.entity';
import { ApiKeyPermission, ApiKeyStatus } from '../types/enums';

export interface CreateApiKeyInput {
  org_id: string;
  user_id?: string | null;
  key_hash: string;
  key_prefix: string;
  permissions: ApiKeyPermission[];
  name?: string | null;
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
  const repo = AppDataSource.getRepository(ApiKey);
  return repo.save(
    repo.create({
      org_id: input.org_id,
      user_id: input.user_id ?? null,
      key_hash: input.key_hash,
      key_prefix: input.key_prefix,
      permissions: input.permissions,
      name: input.name ?? null,
    }),
  );
}

export async function findApiKeyByHash(
  keyHash: string,
): Promise<ApiKey | null> {
  return AppDataSource.getRepository(ApiKey).findOne({
    where: { key_hash: keyHash, status: ApiKeyStatus.ACTIVE },
  });
}

export async function touchLastUsed(keyId: string): Promise<void> {
  await AppDataSource.getRepository(ApiKey).update(
    { key_id: keyId },
    { last_used_at: new Date() },
  );
}

export async function listApiKeysByOrg(orgId: string): Promise<ApiKey[]> {
  return AppDataSource.getRepository(ApiKey).find({
    where: { org_id: orgId },
    order: { created_at: 'DESC' },
  });
}

export async function findApiKeyByIdAndOrg(
  keyId: string,
  orgId: string,
): Promise<ApiKey | null> {
  return AppDataSource.getRepository(ApiKey).findOne({
    where: { key_id: keyId, org_id: orgId },
  });
}

export async function revokeApiKey(
  keyId: string,
  orgId: string,
): Promise<void> {
  await AppDataSource.getRepository(ApiKey).update(
    { key_id: keyId, org_id: orgId },
    { status: ApiKeyStatus.REVOKED },
  );
}
