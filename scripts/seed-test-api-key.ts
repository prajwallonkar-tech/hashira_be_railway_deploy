import 'reflect-metadata';
import { randomBytes } from 'crypto';
import type { DeepPartial } from 'typeorm';
import { AppDataSource } from '../src/config/database';
import { Organisation } from '../src/entities/organisation.entity';
import { ApiKey } from '../src/entities/api-key.entity';
import { User } from '../src/entities/user.entity';
import {
  OrgStatus,
  SubscriptionStatus,
  ApiKeyStatus,
  ApiKeyPermission,
  UserRole,
  UserStatus,
} from '../src/types/enums';
import { hashSHA256 } from '../src/utils/crypto';

async function seedMember(
  orgId: string,
  email: string,
  apiKeyRepo: ReturnType<typeof AppDataSource.getRepository<ApiKey>>,
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
): Promise<{ user: User; plaintextKey: string; apiKey: ApiKey }> {
  const user = await userRepo.save(
    userRepo.create({
      org_id: orgId,
      email,
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
    } as DeepPartial<User>),
  );

  const plaintextKey = `hsk_test_${randomBytes(24).toString('base64url')}`;
  const keyData: DeepPartial<ApiKey> = {
    org_id: orgId,
    user_id: user.user_id,
    key_hash: hashSHA256(plaintextKey),
    key_prefix: plaintextKey.slice(0, 10),
    status: ApiKeyStatus.ACTIVE,
    permissions: [ApiKeyPermission.EVENTS_WRITE],
  };
  const apiKey = await apiKeyRepo.save(apiKeyRepo.create(keyData));

  return { user, plaintextKey, apiKey };
}

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const orgRepo = AppDataSource.getRepository(Organisation);
  const apiKeyRepo = AppDataSource.getRepository(ApiKey);
  const userRepo = AppDataSource.getRepository(User);

  const org = await orgRepo.save(
    orgRepo.create({
      name: 'Demo Org',
      status: OrgStatus.ACTIVE,
      subscription_status: SubscriptionStatus.ACTIVE,
      user_limit: 10,
    }),
  );

  const alice = await seedMember(
    org.org_id,
    'alice@demo.com',
    apiKeyRepo,
    userRepo,
  );
  const bob = await seedMember(
    org.org_id,
    'bob@demo.com',
    apiKeyRepo,
    userRepo,
  );

  console.log('\n=== DEMO SEED COMPLETE ===\n');
  console.log(`Org ID:        ${org.org_id}`);
  console.log(`Org name:      ${org.name}\n`);

  console.log('--- Member 1: Alice ---');
  console.log(`User ID:       ${alice.user.user_id}`);
  console.log(`Email:         alice@demo.com`);
  console.log(`API key ID:    ${alice.apiKey.key_id}`);
  console.log(`X-API-Key:     ${alice.plaintextKey}\n`);

  console.log('--- Member 2: Bob ---');
  console.log(`User ID:       ${bob.user.user_id}`);
  console.log(`Email:         bob@demo.com`);
  console.log(`API key ID:    ${bob.apiKey.key_id}`);
  console.log(`X-API-Key:     ${bob.plaintextKey}\n`);

  console.log('Plaintext keys will NOT be shown again.\n');

  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
