import crypto from 'crypto';
import * as otpTokenRepo from '../../repositories/otp-token.repository';
import * as userRepo from '../../repositories/user.repository';
import * as orgRepo from '../../repositories/organisation.repository';
import * as refreshTokenRepo from '../../repositories/refresh-token.repository';
import * as sesClient from '../../utils/ses.client';
import * as jwtUtils from '../../utils/jwt';
import { OtpService } from './otp.service';
import { AuthError, RateLimitError } from '../../types/errors';
import {
  UserRole,
  UserStatus,
  OrgStatus,
  SubscriptionStatus,
} from '../../types/enums';
import { User } from '../../entities/user.entity';
import { Organisation } from '../../entities/organisation.entity';
import { OtpToken } from '../../entities/otp-token.entity';

jest.mock('../../repositories/otp-token.repository');
jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/organisation.repository');
jest.mock('../../repositories/refresh-token.repository');
jest.mock('../../utils/ses.client');
jest.mock('../../utils/jwt');

const mockFindLatestOtpToken =
  otpTokenRepo.findLatestOtpToken as jest.MockedFunction<
    typeof otpTokenRepo.findLatestOtpToken
  >;
const mockMarkOtpTokenUsed =
  otpTokenRepo.markOtpTokenUsed as jest.MockedFunction<
    typeof otpTokenRepo.markOtpTokenUsed
  >;
const mockIncrementOtpAttempts =
  otpTokenRepo.incrementOtpAttempts as jest.MockedFunction<
    typeof otpTokenRepo.incrementOtpAttempts
  >;
const mockInsertOtpToken = otpTokenRepo.insertOtpToken as jest.MockedFunction<
  typeof otpTokenRepo.insertOtpToken
>;
const mockFindUserByEmail = userRepo.findUserByEmail as jest.MockedFunction<
  typeof userRepo.findUserByEmail
>;
const mockFindOrgById = orgRepo.findOrgById as jest.MockedFunction<
  typeof orgRepo.findOrgById
>;
const mockInsertRefreshToken =
  refreshTokenRepo.insertRefreshToken as jest.MockedFunction<
    typeof refreshTokenRepo.insertRefreshToken
  >;
const mockSendOtpEmail = sesClient.sendOtpEmail as jest.MockedFunction<
  typeof sesClient.sendOtpEmail
>;
const mockSignJwt = jwtUtils.signJwt as jest.MockedFunction<
  typeof jwtUtils.signJwt
>;
const mockGenerateRefreshToken =
  jwtUtils.generateRefreshToken as jest.MockedFunction<
    typeof jwtUtils.generateRefreshToken
  >;

const TEST_EMAIL = 'user@example.com';
const VALID_OTP = '482931';
const WRONG_OTP = '000000';
const MOCK_SESSION_TOKEN = 'mock.jwt.session.token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-base64url';

function makeOtpToken(overrides: Partial<OtpToken> = {}): OtpToken {
  const otp = VALID_OTP;
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  return {
    id: 'mock-otp-token-uuid-1',
    email_hash: crypto
      .createHash('sha256')
      .update(TEST_EMAIL.toLowerCase())
      .digest('hex'),
    otp_hash: hash,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    used: false,
    attempts: 0,
    created_at: new Date(),
    ...overrides,
  } as OtpToken;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 'mock-user-uuid-1',
    org_id: 'mock-org-uuid-1',
    email: TEST_EMAIL,
    password_hash: '$2b$12$mock_only',
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

let service: OtpService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new OtpService();
  mockSignJwt.mockReturnValue(MOCK_SESSION_TOKEN);
  mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  mockInsertRefreshToken.mockResolvedValue(undefined);
  mockMarkOtpTokenUsed.mockResolvedValue(undefined);
  mockIncrementOtpAttempts.mockResolvedValue(undefined);
  mockInsertOtpToken.mockResolvedValue(undefined);
  mockSendOtpEmail.mockResolvedValue(undefined);
});

describe('OtpService.verifyOtp', () => {
  describe('token lookup', () => {
    it('throws INVALID_OTP when no valid token found', async () => {
      mockFindLatestOtpToken.mockResolvedValue(null);

      await expect(
        service.verifyOtp(TEST_EMAIL, VALID_OTP),
      ).rejects.toMatchObject({ code: 'INVALID_OTP', statusCode: 401 });
    });
  });

  describe('attempt limit', () => {
    it('throws RATE_LIMIT_EXCEEDED when attempts >= 5', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken({ attempts: 5 }));

      await expect(
        service.verifyOtp(TEST_EMAIL, VALID_OTP),
      ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', statusCode: 429 });
    });

    it('does not increment attempts when limit is already reached', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken({ attempts: 5 }));

      await expect(service.verifyOtp(TEST_EMAIL, VALID_OTP)).rejects.toThrow(
        RateLimitError,
      );

      expect(mockIncrementOtpAttempts).not.toHaveBeenCalled();
    });
  });

  describe('hash mismatch', () => {
    it('throws INVALID_OTP and increments attempts on wrong OTP', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

      await expect(
        service.verifyOtp(TEST_EMAIL, WRONG_OTP),
      ).rejects.toMatchObject({ code: 'INVALID_OTP', statusCode: 401 });

      expect(mockIncrementOtpAttempts).toHaveBeenCalledWith(
        'mock-otp-token-uuid-1',
      );
    });

    it('does not mark token used on wrong OTP', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

      await expect(service.verifyOtp(TEST_EMAIL, WRONG_OTP)).rejects.toThrow(
        AuthError,
      );

      expect(mockMarkOtpTokenUsed).not.toHaveBeenCalled();
    });
  });

  describe('valid OTP', () => {
    beforeEach(() => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());
      mockFindUserByEmail.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());
    });

    it('marks token used before checking user', async () => {
      await service.verifyOtp(TEST_EMAIL, VALID_OTP);

      expect(mockMarkOtpTokenUsed).toHaveBeenCalledWith(
        'mock-otp-token-uuid-1',
      );
    });

    it('returns authenticated result with session and refresh tokens', async () => {
      const result = await service.verifyOtp(TEST_EMAIL, VALID_OTP);

      expect(result.status).toBe('authenticated');
      if (result.status === 'authenticated') {
        expect(result.sessionToken).toBe(MOCK_SESSION_TOKEN);
        expect(result.refreshToken).toBe(MOCK_REFRESH_TOKEN);
        expect(result.user.email).toBe(TEST_EMAIL);
        expect(result.user.role).toBe(UserRole.MEMBER);
      }
    });

    it('inserts refresh token with SHA-256 hash and 7-day expiry', async () => {
      await service.verifyOtp(TEST_EMAIL, VALID_OTP);

      expect(mockInsertRefreshToken).toHaveBeenCalledTimes(1);
      const [userId, tokenHash, expiresAt] =
        mockInsertRefreshToken.mock.calls[0];
      expect(userId).toBe('mock-user-uuid-1');
      expect(tokenHash).toHaveLength(64);
      expect(expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 6 * 24 * 60 * 60 * 1000,
      );
    });

    it('returns mfa_required without issuing tokens for MFA-enrolled user', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser({ mfa_enabled: true }));

      const result = await service.verifyOtp(TEST_EMAIL, VALID_OTP);

      expect(result.status).toBe('mfa_required');
      expect(mockInsertRefreshToken).not.toHaveBeenCalled();
      expect(mockSignJwt).not.toHaveBeenCalled();
    });
  });

  describe('org status check', () => {
    it('throws ORG_SUSPENDED when org is suspended', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());
      mockFindUserByEmail.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(
        makeOrg({ status: OrgStatus.SUSPENDED }),
      );

      await expect(
        service.verifyOtp(TEST_EMAIL, VALID_OTP),
      ).rejects.toMatchObject({ code: 'ORG_SUSPENDED', statusCode: 403 });

      expect(mockInsertRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('user status check', () => {
    it('throws INVALID_OTP when user account is removed', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());
      mockFindUserByEmail.mockResolvedValue(
        makeUser({ status: UserStatus.REMOVED }),
      );

      await expect(
        service.verifyOtp(TEST_EMAIL, VALID_OTP),
      ).rejects.toMatchObject({ code: 'INVALID_OTP', statusCode: 401 });
    });
  });
});

describe('OtpService.resendOtp', () => {
  it('returns silently when no valid OTP token exists (prevents enumeration)', async () => {
    mockFindLatestOtpToken.mockResolvedValue(null);

    await expect(service.resendOtp(TEST_EMAIL)).resolves.toBeUndefined();

    expect(mockMarkOtpTokenUsed).not.toHaveBeenCalled();
    expect(mockInsertOtpToken).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('marks old token used when valid token exists', async () => {
    mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

    await service.resendOtp(TEST_EMAIL);

    expect(mockMarkOtpTokenUsed).toHaveBeenCalledWith('mock-otp-token-uuid-1');
  });

  it('inserts a new OTP token with correct email_hash and 10-min expiry', async () => {
    mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

    await service.resendOtp(TEST_EMAIL);

    expect(mockInsertOtpToken).toHaveBeenCalledTimes(1);
    const [emailHash, otpHash, expiresAt] = mockInsertOtpToken.mock.calls[0];
    expect(emailHash).toHaveLength(64);
    expect(otpHash).toHaveLength(64);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it('sends OTP email to the original email address', async () => {
    mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

    await service.resendOtp(TEST_EMAIL);

    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      TEST_EMAIL,
      expect.stringMatching(/^\d{6}$/),
    );
  });
});
