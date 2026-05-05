import * as apiKeyRepo from '../../repositories/api-key.repository';
import * as orgRepo from '../../repositories/organisation.repository';
import { ApiKeyService } from './api-key.service';
import { AuthError, ForbiddenError } from '../../types/errors';
import {
  ApiKeyPermission,
  ApiKeyStatus,
  OrgStatus,
  SubscriptionStatus,
} from '../../types/enums';
import { hashSHA256 } from '../../utils/crypto';
import { ApiKey } from '../../entities/api-key.entity';
import { Organisation } from '../../entities/organisation.entity';

jest.mock('../../repositories/api-key.repository');
jest.mock('../../repositories/organisation.repository');

const mockFindApiKeyByHash = apiKeyRepo.findApiKeyByHash as jest.MockedFunction<
  typeof apiKeyRepo.findApiKeyByHash
>;
const mockTouchLastUsed = apiKeyRepo.touchLastUsed as jest.MockedFunction<
  typeof apiKeyRepo.touchLastUsed
>;
const mockFindOrgById = orgRepo.findOrgById as jest.MockedFunction<
  typeof orgRepo.findOrgById
>;

const PLAINTEXT_KEY = 'hsk_test_plaintext_key_value_abc123';
const ORG_ID = 'org-uuid-1';
const KEY_ID = 'key-uuid-1';

const USER_ID = 'user-uuid-1';

function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    key_id: KEY_ID,
    org_id: ORG_ID,
    user_id: null,
    key_hash: hashSHA256(PLAINTEXT_KEY),
    key_prefix: 'hsk_test_',
    status: ApiKeyStatus.ACTIVE,
    permissions: ['events:write'],
    created_at: new Date(),
    last_used_at: null,
    ...overrides,
  } as ApiKey;
}

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    org_id: ORG_ID,
    name: 'Test Org',
    status: OrgStatus.ACTIVE,
    user_limit: 10,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: SubscriptionStatus.ACTIVE,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Organisation;
}

let service: ApiKeyService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ApiKeyService();
  mockTouchLastUsed.mockResolvedValue(undefined);
});

describe('ApiKeyService.validateApiKey', () => {
  it('returns key context for a valid active key on an active org', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey());
    mockFindOrgById.mockResolvedValue(makeOrg());

    const result = await service.validateApiKey(PLAINTEXT_KEY);

    expect(result).toEqual({
      key_id: KEY_ID,
      org_id: ORG_ID,
      user_id: null,
      permissions: ['events:write'],
    });
    expect(mockFindApiKeyByHash).toHaveBeenCalledWith(
      hashSHA256(PLAINTEXT_KEY),
    );
  });

  it('includes user_id in context when the key is scoped to a member', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey({ user_id: USER_ID }));
    mockFindOrgById.mockResolvedValue(makeOrg());

    const result = await service.validateApiKey(PLAINTEXT_KEY);

    expect(result.user_id).toBe(USER_ID);
  });

  it('includes user_id: null in context when the key is org-level (not member-scoped)', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey({ user_id: null }));
    mockFindOrgById.mockResolvedValue(makeOrg());

    const result = await service.validateApiKey(PLAINTEXT_KEY);

    expect(result.user_id).toBeNull();
  });

  it('throws INVALID_API_KEY when no key matches the hash', async () => {
    mockFindApiKeyByHash.mockResolvedValue(null);

    await expect(service.validateApiKey('bogus-key')).rejects.toMatchObject({
      code: 'INVALID_API_KEY',
      statusCode: 401,
    });
    expect(mockFindOrgById).not.toHaveBeenCalled();
  });

  it('throws ORG_SUSPENDED when org is suspended', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey());
    mockFindOrgById.mockResolvedValue(makeOrg({ status: OrgStatus.SUSPENDED }));

    await expect(service.validateApiKey(PLAINTEXT_KEY)).rejects.toMatchObject({
      code: 'ORG_SUSPENDED',
      statusCode: 403,
    });
  });

  it('throws ORG_NOT_ACTIVE when org is in payment_pending', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey());
    mockFindOrgById.mockResolvedValue(
      makeOrg({ status: OrgStatus.PAYMENT_PENDING }),
    );

    await expect(service.validateApiKey(PLAINTEXT_KEY)).rejects.toMatchObject({
      code: 'ORG_NOT_ACTIVE',
      statusCode: 403,
    });
  });

  it('throws INVALID_API_KEY when org for the key cannot be resolved', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey());
    mockFindOrgById.mockResolvedValue(null);

    await expect(service.validateApiKey(PLAINTEXT_KEY)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('does not block on touchLastUsed failures', async () => {
    mockFindApiKeyByHash.mockResolvedValue(makeApiKey());
    mockFindOrgById.mockResolvedValue(makeOrg());
    mockTouchLastUsed.mockRejectedValueOnce(new Error('db blip'));

    await expect(service.validateApiKey(PLAINTEXT_KEY)).resolves.toMatchObject({
      key_id: KEY_ID,
    });
  });

  it('rejects with AuthError (not ForbiddenError) when key not found', async () => {
    mockFindApiKeyByHash.mockResolvedValue(null);

    await expect(service.validateApiKey('bogus')).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(service.validateApiKey('bogus')).rejects.not.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

// ─── createApiKey ─────────────────────────────────────────────────────────────

const mockCreateApiKey = apiKeyRepo.createApiKey as jest.MockedFunction<
  typeof apiKeyRepo.createApiKey
>;

describe('ApiKeyService.createApiKey', () => {
  const ORG_ID = 'org-uuid-1';

  function makeSavedKey(overrides: Partial<ApiKey> = {}): ApiKey {
    return {
      key_id: 'key-uuid-new',
      org_id: ORG_ID,
      key_hash: 'some-hash',
      key_prefix: 'hsk_test_',
      status: ApiKeyStatus.ACTIVE,
      permissions: [ApiKeyPermission.EVENTS_WRITE],
      created_at: new Date('2026-05-01T00:00:00Z'),
      last_used_at: null,
      ...overrides,
    } as ApiKey;
  }

  it('defaults permissions to [events:write] when not supplied', async () => {
    mockCreateApiKey.mockResolvedValue(makeSavedKey());

    await service.createApiKey({ org_id: ORG_ID });

    expect(mockCreateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        permissions: [ApiKeyPermission.EVENTS_WRITE],
      }),
    );
  });

  it('stores custom permissions when supplied', async () => {
    const perms = [
      ApiKeyPermission.EVENTS_READ,
      ApiKeyPermission.VERIFICATION_READ,
    ];
    mockCreateApiKey.mockResolvedValue(makeSavedKey({ permissions: perms }));

    await service.createApiKey({ org_id: ORG_ID, permissions: perms });

    expect(mockCreateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: perms }),
    );
  });

  it('returns plaintext key, key_id, key_prefix, permissions, and created_at', async () => {
    mockCreateApiKey.mockResolvedValue(makeSavedKey());

    const result = await service.createApiKey({ org_id: ORG_ID });

    expect(result.api_key).toMatch(/^hsk_/);
    expect(result.key_id).toBe('key-uuid-new');
    expect(result.key_prefix).toHaveLength(8);
    expect(result.permissions).toEqual([ApiKeyPermission.EVENTS_WRITE]);
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('stores the SHA-256 hash of the plaintext key, never the plaintext itself', async () => {
    mockCreateApiKey.mockResolvedValue(makeSavedKey());

    await service.createApiKey({ org_id: ORG_ID });

    const storedHash = (
      mockCreateApiKey.mock.calls[0][0] as { key_hash: string }
    ).key_hash;
    expect(storedHash).toHaveLength(64); // SHA-256 hex
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
