import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import * as userRepo from '../../repositories/user.repository';
import * as passwordResetRepo from '../../repositories/password-reset-token.repository';
import * as sesClient from '../../utils/ses.client';
import {
  PasswordResetService,
  resetConfirmAttempts,
} from './password-reset.service';
import { GoneError, RateLimitError } from '../../types/errors';
import { UserRole, UserStatus } from '../../types/enums';
import { User } from '../../entities/user.entity';
import { PasswordResetToken } from '../../entities/password-reset-token.entity';

jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/password-reset-token.repository');
jest.mock('../../utils/ses.client');
jest.mock('bcrypt');

const mockFindUserByEmail = userRepo.findUserByEmail as jest.MockedFunction<
  typeof userRepo.findUserByEmail
>;
const mockFindPasswordResetToken =
  passwordResetRepo.findPasswordResetToken as jest.MockedFunction<
    typeof passwordResetRepo.findPasswordResetToken
  >;
const mockInsertPasswordResetToken =
  passwordResetRepo.insertPasswordResetToken as jest.MockedFunction<
    typeof passwordResetRepo.insertPasswordResetToken
  >;
const mockApplyPasswordReset =
  passwordResetRepo.applyPasswordReset as jest.MockedFunction<
    typeof passwordResetRepo.applyPasswordReset
  >;
const mockSendPasswordResetEmail =
  sesClient.sendPasswordResetEmail as jest.MockedFunction<
    typeof sesClient.sendPasswordResetEmail
  >;
const mockBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

const TEST_EMAIL = 'user@example.com';
const UNKNOWN_EMAIL = 'unknown@example.com';
const VALID_OTP = '482931';
const WRONG_OTP = '000000';
const NEW_PASSWORD = 'newpassword123';
const MOCK_PASSWORD_HASH = '$2b$12$new_hash_only';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 'mock-user-uuid-1',
    org_id: 'mock-org-uuid-1',
    email: TEST_EMAIL,
    password_hash: '$2b$12$existing_hash',
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

function makeResetToken(
  overrides: Partial<PasswordResetToken> = {},
): PasswordResetToken {
  return {
    token_id: 'mock-token-uuid-1',
    user_id: 'mock-user-uuid-1',
    token_hash: 'a'.repeat(64),
    used: false,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    created_at: new Date(),
    ...overrides,
  } as PasswordResetToken;
}

let service: PasswordResetService;

beforeEach(() => {
  jest.clearAllMocks();
  resetConfirmAttempts();
  service = new PasswordResetService();
  mockInsertPasswordResetToken.mockResolvedValue(undefined);
  mockApplyPasswordReset.mockResolvedValue(undefined);
  mockSendPasswordResetEmail.mockResolvedValue(undefined);
  (mockBcryptHash as unknown as jest.Mock).mockResolvedValue(
    MOCK_PASSWORD_HASH,
  );
});

describe('PasswordResetService.requestReset', () => {
  it('resolves without throwing for any email', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    await expect(service.requestReset(UNKNOWN_EMAIL)).resolves.toBeUndefined();
  });

  it('does not insert token or send email for unknown email', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    await service.requestReset(UNKNOWN_EMAIL);
    expect(mockInsertPasswordResetToken).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('does not insert token or send email for Google-only account', async () => {
    mockFindUserByEmail.mockResolvedValue(makeUser({ password_hash: null }));
    await service.requestReset(TEST_EMAIL);
    expect(mockInsertPasswordResetToken).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('inserts token with 64-char hash and 10-min expiry', async () => {
    mockFindUserByEmail.mockResolvedValue(makeUser());
    await service.requestReset(TEST_EMAIL);

    expect(mockInsertPasswordResetToken).toHaveBeenCalledTimes(1);
    const [userId, tokenHash, expiresAt] =
      mockInsertPasswordResetToken.mock.calls[0];
    expect(userId).toBe('mock-user-uuid-1');
    expect(tokenHash).toHaveLength(64);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it('sends password reset email with 6-digit OTP', async () => {
    mockFindUserByEmail.mockResolvedValue(makeUser());
    await service.requestReset(TEST_EMAIL);

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      TEST_EMAIL,
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('embeds email in token hash — same OTP for different users produces different hashes', () => {
    const otp = '123456';
    const hash1 = createHash('sha256')
      .update('a@example.com' + otp)
      .digest('hex');
    const hash2 = createHash('sha256')
      .update('b@example.com' + otp)
      .digest('hex');
    expect(hash1).not.toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});

describe('PasswordResetService.confirmReset', () => {
  describe('rate limiting (5 failures / 5 min)', () => {
    it('throws RateLimitError after 5 consecutive failures on same email', async () => {
      mockFindPasswordResetToken.mockResolvedValue(null);

      for (let i = 0; i < 5; i++) {
        await expect(
          service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
        ).rejects.toMatchObject({ code: 'GONE' });
      }

      await expect(
        service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
      ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', statusCode: 429 });
    });

    it('includes positive retryAfter value in the thrown RateLimitError', async () => {
      mockFindPasswordResetToken.mockResolvedValue(null);

      for (let i = 0; i < 5; i++) {
        await expect(
          service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
        ).rejects.toMatchObject({ code: 'GONE' });
      }

      let thrown: unknown;
      try {
        await service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(RateLimitError);
      expect((thrown as RateLimitError).retryAfter).toBeGreaterThan(0);
    });

    it('resets counter after successful reset', async () => {
      mockFindPasswordResetToken
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeResetToken());
      mockFindUserByEmail.mockResolvedValue(makeUser());

      for (let i = 0; i < 2; i++) {
        await expect(
          service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
        ).rejects.toMatchObject({ code: 'GONE' });
      }

      await service.confirmReset(TEST_EMAIL, VALID_OTP, NEW_PASSWORD);

      mockFindPasswordResetToken.mockResolvedValue(null);
      await expect(
        service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
      ).rejects.toMatchObject({ code: 'GONE' });
    });

    it('does not block a different email', async () => {
      const OTHER_EMAIL = 'other@example.com';
      mockFindPasswordResetToken.mockResolvedValue(null);

      for (let i = 0; i < 5; i++) {
        await expect(
          service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
        ).rejects.toMatchObject({ code: 'GONE' });
      }

      mockFindPasswordResetToken.mockResolvedValue(makeResetToken());
      mockFindUserByEmail.mockResolvedValue(makeUser({ email: OTHER_EMAIL }));

      await expect(
        service.confirmReset(OTHER_EMAIL, VALID_OTP, NEW_PASSWORD),
      ).resolves.toBeUndefined();
    });
  });

  describe('token not found', () => {
    it('throws GoneError GONE when token not found', async () => {
      mockFindPasswordResetToken.mockResolvedValue(null);

      await expect(
        service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
      ).rejects.toMatchObject({ code: 'GONE', statusCode: 410 });
    });

    it('does not call applyPasswordReset when token not found', async () => {
      mockFindPasswordResetToken.mockResolvedValue(null);

      await expect(
        service.confirmReset(TEST_EMAIL, WRONG_OTP, NEW_PASSWORD),
      ).rejects.toThrow(GoneError);

      expect(mockApplyPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('Google-only account guard', () => {
    it('throws ForbiddenError FORBIDDEN for Google-only account', async () => {
      mockFindPasswordResetToken.mockResolvedValue(makeResetToken());
      mockFindUserByEmail.mockResolvedValue(makeUser({ password_hash: null }));

      await expect(
        service.confirmReset(TEST_EMAIL, VALID_OTP, NEW_PASSWORD),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });

      expect(mockApplyPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('successful reset', () => {
    beforeEach(() => {
      mockFindPasswordResetToken.mockResolvedValue(makeResetToken());
      mockFindUserByEmail.mockResolvedValue(makeUser());
    });

    it('hashes new password with bcrypt rounds=12', async () => {
      await service.confirmReset(TEST_EMAIL, VALID_OTP, NEW_PASSWORD);
      expect(mockBcryptHash).toHaveBeenCalledWith(NEW_PASSWORD, 12);
    });

    it('calls applyPasswordReset with correct userId, tokenId, and hashed password', async () => {
      await service.confirmReset(TEST_EMAIL, VALID_OTP, NEW_PASSWORD);

      expect(mockApplyPasswordReset).toHaveBeenCalledWith(
        'mock-user-uuid-1',
        'mock-token-uuid-1',
        MOCK_PASSWORD_HASH,
      );
    });

    it('resolves without throwing on valid OTP', async () => {
      await expect(
        service.confirmReset(TEST_EMAIL, VALID_OTP, NEW_PASSWORD),
      ).resolves.toBeUndefined();
    });

    it('does not send any email on successful reset', async () => {
      await service.confirmReset(TEST_EMAIL, VALID_OTP, NEW_PASSWORD);
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});
