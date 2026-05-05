import { AppDataSource } from '../config/database';
import { ApiKey } from '../entities/api-key.entity';
import { ApiKeyPermission, ApiKeyStatus } from '../types/enums';

export interface CreateApiKeyInput {
  org_id: string;
  key_hash: string;
  key_prefix: string;
  permissions: ApiKeyPermission[];
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
  const repo = AppDataSource.getRepository(ApiKey);
  return repo.save(
    repo.create({
      org_id: input.org_id,
      key_hash: input.key_hash,
      key_prefix: input.key_prefix,
      permissions: input.permissions,
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
