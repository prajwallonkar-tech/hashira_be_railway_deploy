import bcrypt from 'bcrypt';
import * as userRepo from '../../repositories/user.repository';
import * as orgRepo from '../../repositories/organisation.repository';
import * as invitationRepo from '../../repositories/invitation.repository';
import * as otpTokenRepo from '../../repositories/otp-token.repository';
import * as sesClient from '../../utils/ses.client';
import { AuthService, resetFailedAttempts } from './auth.service';
import { AuthError, RateLimitError } from '../../types/errors';
import {
  UserRole,
  UserStatus,
  OrgStatus,
  SubscriptionStatus,
  InvitationStatus,
} from '../../types/enums';
import { User } from '../../entities/user.entity';
import { Organisation } from '../../entities/organisation.entity';
import { Invitation } from '../../entities/invitation.entity';

jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/organisation.repository');
jest.mock('../../repositories/invitation.repository');
jest.mock('../../repositories/otp-token.repository');
jest.mock('../../utils/ses.client');
jest.mock('bcrypt');

const mockFindUserByEmail = userRepo.findUserByEmail as jest.MockedFunction<
  typeof userRepo.findUserByEmail
>;
const mockCountActiveUsersByOrg =
  userRepo.countActiveUsersByOrg as jest.MockedFunction<
    typeof userRepo.countActiveUsersByOrg
  >;
const mockFindOrgById = orgRepo.findOrgById as jest.MockedFunction<
  typeof orgRepo.findOrgById
>;
const mockFindInvitationByTokenHash =
  invitationRepo.findInvitationByTokenHash as jest.MockedFunction<
    typeof invitationRepo.findInvitationByTokenHash
  >;
const mockAcceptInvitationAndCreateUser =
  invitationRepo.acceptInvitationAndCreateUser as jest.MockedFunction<
    typeof invitationRepo.acceptInvitationAndCreateUser
  >;
const mockInsertOtpToken = otpTokenRepo.insertOtpToken as jest.MockedFunction<
  typeof otpTokenRepo.insertOtpToken
>;
const mockSendOtpEmail = sesClient.sendOtpEmail as jest.MockedFunction<
  typeof sesClient.sendOtpEmail
>;
const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;
const mockBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

// Test fixture constants — not real credentials
const MOCK_STORED_HASH = '$2b$12$mock_only';
const MOCK_NEW_HASH = '$2b$12$new_hash_only';
const TEST_EMAIL = 'test@example.com';
const GOOGLE_EMAIL = 'google@example.com';
const UNKNOWN_EMAIL = 'unknown@example.com';
const CORRECT_INPUT = 'correct_test_input_1';
const WRONG_INPUT = 'wrong_test_input_1';
const VALID_INVITATION_TOKEN = 'valid-plaintext-invitation-token-abc123';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 'mock-user-uuid-1',
    org_id: 'mock-org-uuid-1',
    email: TEST_EMAIL,
    password_hash: MOCK_STORED_HASH,
    google_sub: null,
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    mfa_enabled: false,
    totp_secret: null,
    totp_secret_pending: null,
    invited_by: null,
    created_at: new Date(),
    ...overrides,
  } as User;
}

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    org_id: 'mock-org-uuid-1',
    name: 'Test Org',
    status: OrgStatus.ACTIVE,
    user_limit: 10,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: SubscriptionStatus.TRIALING,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Organisation;
}

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    invitation_id: 'mock-invitation-uuid-1',
    org_id: 'mock-org-uuid-1',
    invited_by: 'mock-admin-uuid-1',
    role: UserRole.MEMBER,
    status: InvitationStatus.PENDING,
    token_hash: 'mock-token-hash-64chars-placeholder',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    ...overrides,
  } as Invitation;
}

let service: AuthService;

beforeEach(() => {
  jest.clearAllMocks();
  resetFailedAttempts();
  service = new AuthService();
  mockInsertOtpToken.mockResolvedValue(undefined);
  mockSendOtpEmail.mockResolvedValue(undefined);
  mockCountActiveUsersByOrg.mockResolvedValue(5);
  mockAcceptInvitationAndCreateUser.mockResolvedValue(makeUser());
  (mockBcryptHash as unknown as jest.Mock).mockResolvedValue(MOCK_NEW_HASH);
});

describe('AuthService.createEmailPasswordSession', () => {
  describe('unknown email', () => {
    it('runs bcrypt.compare with dummy hash (not early-exit)', async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(
        service.createEmailPasswordSession(UNKNOWN_EMAIL, WRONG_INPUT),
      ).rejects.toThrow(AuthError);

      expect(mockBcryptCompare).toHaveBeenCalledTimes(1);
      const [, hashArg] = (mockBcryptCompare as unknown as jest.Mock).mock
        .calls[0] as [string, string];
      expect(hashArg).toMatch(/^\$2b\$12\$/);
    });

    it('throws AuthError INVALID_CREDENTIALS', async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(
        service.createEmailPasswordSession(UNKNOWN_EMAIL, WRONG_INPUT),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    });
  });

  describe('known email, wrong input', () => {
    it('runs bcrypt.compare against stored hash and throws INVALID_CREDENTIALS', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(
        service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

      expect(mockBcryptCompare).toHaveBeenCalledWith(
        WRONG_INPUT,
        MOCK_STORED_HASH,
      );
    });
  });

  describe('Google-only account (password_hash is null)', () => {
    it('falls back to dummy hash and throws INVALID_CREDENTIALS', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser({ password_hash: null }));
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(
        service.createEmailPasswordSession(GOOGLE_EMAIL, WRONG_INPUT),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      const [, hashArg] = (mockBcryptCompare as unknown as jest.Mock).mock
        .calls[0] as [string, string];
      expect(hashArg).toMatch(/^\$2b\$12\$/);
    });
  });

  describe('valid credentials', () => {
    beforeEach(() => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(true);
      mockInsertOtpToken.mockResolvedValue(undefined);
      mockSendOtpEmail.mockResolvedValue(undefined);
    });

    it('inserts OTP token with SHA-256 hashed email and OTP', async () => {
      await service.createEmailPasswordSession(TEST_EMAIL, CORRECT_INPUT);

      expect(mockInsertOtpToken).toHaveBeenCalledTimes(1);
      const [emailHash, otpHash, expiresAt] = mockInsertOtpToken.mock.calls[0];
      expect(emailHash).toHaveLength(64);
      expect(otpHash).toHaveLength(64);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    });

    it('sends a 6-digit OTP via SES to the original email address', async () => {
      await service.createEmailPasswordSession(TEST_EMAIL, CORRECT_INPUT);

      expect(mockSendOtpEmail).toHaveBeenCalledWith(
        TEST_EMAIL,
        expect.any(String),
      );
      const sentOtp: string = mockSendOtpEmail.mock.calls[0][1];
      expect(sentOtp).toMatch(/^\d{6}$/);
    });

    it('does not call insertOtpToken or sendOtpEmail on wrong input', async () => {
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(
        service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
      ).rejects.toThrow(AuthError);

      expect(mockInsertOtpToken).not.toHaveBeenCalled();
      expect(mockSendOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('email-based rate limiting (10 failures / 5 min)', () => {
    it('throws RateLimitError after 10 consecutive failures on same email', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 10; i++) {
        await expect(
          service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
        ).rejects.toThrow(AuthError);
      }

      await expect(
        service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
      ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', statusCode: 429 });
    });

    it('includes a positive retryAfter value in the thrown RateLimitError', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 10; i++) {
        await expect(
          service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
        ).rejects.toThrow(AuthError);
      }

      let thrown: unknown;
      try {
        await service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(RateLimitError);
      expect((thrown as RateLimitError).retryAfter).toBeGreaterThan(0);
    });

    it('resets failed count after a successful login', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 5; i++) {
        await expect(
          service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
        ).rejects.toThrow(AuthError);
      }

      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(true);
      mockInsertOtpToken.mockResolvedValue(undefined);
      mockSendOtpEmail.mockResolvedValue(undefined);

      await expect(
        service.createEmailPasswordSession(TEST_EMAIL, CORRECT_INPUT),
      ).resolves.not.toThrow();
    });

    it('does not block a different email', async () => {
      const OTHER_EMAIL = 'other@example.com';
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 10; i++) {
        await expect(
          service.createEmailPasswordSession(TEST_EMAIL, WRONG_INPUT),
        ).rejects.toThrow(AuthError);
      }

      mockFindUserByEmail.mockResolvedValue(makeUser({ email: OTHER_EMAIL }));
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(true);
      mockInsertOtpToken.mockResolvedValue(undefined);
      mockSendOtpEmail.mockResolvedValue(undefined);

      await expect(
        service.createEmailPasswordSession(OTHER_EMAIL, CORRECT_INPUT),
      ).resolves.not.toThrow();
    });
  });
});

describe('AuthService.createEmailPasswordSession — invitation path', () => {
  beforeEach(() => {
    mockFindInvitationByTokenHash.mockResolvedValue(makeInvitation());
    mockFindOrgById.mockResolvedValue(makeOrg());
  });

  it('throws GoneError GONE when invitation token not found', async () => {
    mockFindInvitationByTokenHash.mockResolvedValue(null);

    await expect(
      service.createEmailPasswordSession(
        TEST_EMAIL,
        CORRECT_INPUT,
        VALID_INVITATION_TOKEN,
      ),
    ).rejects.toMatchObject({ code: 'GONE', statusCode: 410 });

    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError ORG_SUSPENDED when org is suspended', async () => {
    mockFindOrgById.mockResolvedValue(makeOrg({ status: OrgStatus.SUSPENDED }));

    await expect(
      service.createEmailPasswordSession(
        TEST_EMAIL,
        CORRECT_INPUT,
        VALID_INVITATION_TOKEN,
      ),
    ).rejects.toMatchObject({ code: 'ORG_SUSPENDED', statusCode: 403 });

    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError USER_LIMIT_REACHED when org is at capacity', async () => {
    mockCountActiveUsersByOrg.mockResolvedValue(10);
    mockFindOrgById.mockResolvedValue(makeOrg({ user_limit: 10 }));

    await expect(
      service.createEmailPasswordSession(
        TEST_EMAIL,
        CORRECT_INPUT,
        VALID_INVITATION_TOKEN,
      ),
    ).rejects.toMatchObject({ code: 'USER_LIMIT_REACHED', statusCode: 403 });

    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });

  it('hashes password with bcrypt.hash rounds=12, never bcrypt.compare', async () => {
    await service.createEmailPasswordSession(
      TEST_EMAIL,
      CORRECT_INPUT,
      VALID_INVITATION_TOKEN,
    );

    expect(mockBcryptHash).toHaveBeenCalledWith(CORRECT_INPUT, 12);
    expect(mockBcryptCompare).not.toHaveBeenCalled();
  });

  it('calls acceptInvitationAndCreateUser with correct user fields from invitation', async () => {
    const invitation = makeInvitation({
      org_id: 'mock-org-uuid-1',
      role: UserRole.ADMIN,
      invited_by: 'mock-admin-uuid-1',
    });
    mockFindInvitationByTokenHash.mockResolvedValue(invitation);

    await service.createEmailPasswordSession(
      TEST_EMAIL,
      CORRECT_INPUT,
      VALID_INVITATION_TOKEN,
    );

    expect(mockAcceptInvitationAndCreateUser).toHaveBeenCalledWith(
      invitation,
      expect.objectContaining({
        email: TEST_EMAIL,
        password_hash: MOCK_NEW_HASH,
        org_id: 'mock-org-uuid-1',
        role: UserRole.ADMIN,
        invited_by: 'mock-admin-uuid-1',
      }),
    );
  });

  it('sends OTP email and inserts token after user creation', async () => {
    await service.createEmailPasswordSession(
      TEST_EMAIL,
      CORRECT_INPUT,
      VALID_INVITATION_TOKEN,
    );

    expect(mockAcceptInvitationAndCreateUser).toHaveBeenCalledTimes(1);
    expect(mockInsertOtpToken).toHaveBeenCalledTimes(1);
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      TEST_EMAIL,
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('does not send OTP when user creation fails (transaction throws)', async () => {
    mockAcceptInvitationAndCreateUser.mockRejectedValue(new Error('DB error'));

    await expect(
      service.createEmailPasswordSession(
        TEST_EMAIL,
        CORRECT_INPUT,
        VALID_INVITATION_TOKEN,
      ),
    ).rejects.toThrow('DB error');

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('does not enter invitation path when invitationToken is undefined', async () => {
    mockFindUserByEmail.mockResolvedValue(makeUser());
    (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(true);

    await service.createEmailPasswordSession(TEST_EMAIL, CORRECT_INPUT);

    expect(mockFindInvitationByTokenHash).not.toHaveBeenCalled();
    expect(mockBcryptHash).not.toHaveBeenCalled();
  });
});
