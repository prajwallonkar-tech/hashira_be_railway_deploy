import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../app';
import * as otpTokenRepo from '../../repositories/otp-token.repository';
import * as userRepo from '../../repositories/user.repository';
import * as orgRepo from '../../repositories/organisation.repository';
import * as refreshTokenRepo from '../../repositories/refresh-token.repository';
import * as sesClient from '../../utils/ses.client';
import * as jwtUtils from '../../utils/jwt';
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

interface ApiBody {
  success?: boolean;
  statusCode?: number;
  data?: Record<string, unknown>;
  message?: string;
}
function body(res: { body: unknown }): ApiBody {
  return res.body as ApiBody;
}

const TEST_EMAIL = 'user@example.com';
const VALID_OTP = '482931';
const WRONG_OTP = '000000';
const INVALID_EMAIL = 'not-an-email';
const MOCK_SESSION_TOKEN = 'mock.jwt.session.token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-base64url';

function makeOtpToken(overrides: Partial<OtpToken> = {}): OtpToken {
  const hash = crypto.createHash('sha256').update(VALID_OTP).digest('hex');
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSignJwt.mockReturnValue(MOCK_SESSION_TOKEN);
  mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  mockInsertRefreshToken.mockResolvedValue(undefined);
  mockMarkOtpTokenUsed.mockResolvedValue(undefined);
  mockIncrementOtpAttempts.mockResolvedValue(undefined);
  mockInsertOtpToken.mockResolvedValue(undefined);
  mockSendOtpEmail.mockResolvedValue(undefined);
});

describe('POST /v1/auth/otp/verify', () => {
  describe('request validation', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/v1/auth/otp/verify').send({});
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(400);
    });

    it('returns 400 when email is invalid format', async () => {
      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: INVALID_EMAIL, otp: VALID_OTP });
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });

    it('returns 400 when OTP is not exactly 6 digits', async () => {
      for (const badOtp of ['12345', '1234567', 'abcdef', '12 345']) {
        const res = await request(app)
          .post('/v1/auth/otp/verify')
          .send({ email: TEST_EMAIL, otp: badOtp });
        expect(res.status).toBe(400);
        expect(body(res).success).toBe(false);
      }
    });
  });

  describe('OTP validation', () => {
    it('returns 401 when no valid token found', async () => {
      mockFindLatestOtpToken.mockResolvedValue(null);

      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: TEST_EMAIL, otp: VALID_OTP });

      expect(res.status).toBe(401);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(401);
    });

    it('returns 401 when OTP is wrong', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: TEST_EMAIL, otp: WRONG_OTP });

      expect(res.status).toBe(401);
      expect(body(res).success).toBe(false);
    });

    it('returns 429 when attempt limit exhausted', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken({ attempts: 5 }));

      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: TEST_EMAIL, otp: VALID_OTP });

      expect(res.status).toBe(429);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(429);
    });
  });

  describe('successful verification', () => {
    it('returns 200 with user data and sets cookies for non-MFA user', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());
      mockFindUserByEmail.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());

      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: TEST_EMAIL, otp: VALID_OTP });

      expect(res.status).toBe(200);
      expect(body(res).success).toBe(true);
      expect(body(res).data?.email).toBe(TEST_EMAIL);
      expect(body(res).data?.role).toBe(UserRole.MEMBER);

      const cookies = res.headers['set-cookie'] as string[] | string;
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArr.some((c) => c.startsWith('hashira_session='))).toBe(
        true,
      );
      expect(cookieArr.some((c) => c.startsWith('hashira_refresh='))).toBe(
        true,
      );
    });

    it('returns 200 mfa_required and sets NO cookies for MFA-enrolled user', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());
      mockFindUserByEmail.mockResolvedValue(makeUser({ mfa_enabled: true }));
      mockFindOrgById.mockResolvedValue(makeOrg());

      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: TEST_EMAIL, otp: VALID_OTP });

      expect(res.status).toBe(200);
      expect(body(res).success).toBe(true);
      expect(body(res).data?.status).toBe('mfa_required');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 403 when org is suspended', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());
      mockFindUserByEmail.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(
        makeOrg({ status: OrgStatus.SUSPENDED }),
      );

      const res = await request(app)
        .post('/v1/auth/otp/verify')
        .send({ email: TEST_EMAIL, otp: VALID_OTP });

      expect(res.status).toBe(403);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(403);
    });
  });
});

describe('POST /v1/auth/otp/resend', () => {
  describe('request validation', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/v1/auth/otp/resend').send({});
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });

    it('returns 400 when email is invalid format', async () => {
      const res = await request(app)
        .post('/v1/auth/otp/resend')
        .send({ email: INVALID_EMAIL });
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });
  });

  describe('resend logic', () => {
    it('returns 200 otp_sent when valid token exists', async () => {
      mockFindLatestOtpToken.mockResolvedValue(makeOtpToken());

      const res = await request(app)
        .post('/v1/auth/otp/resend')
        .send({ email: TEST_EMAIL });

      expect(res.status).toBe(200);
      expect(body(res).success).toBe(true);
      expect(body(res).data?.status).toBe('otp_sent');
      expect(mockSendOtpEmail).toHaveBeenCalledWith(
        TEST_EMAIL,
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('returns 200 otp_sent silently when no valid token exists', async () => {
      mockFindLatestOtpToken.mockResolvedValue(null);

      const res = await request(app)
        .post('/v1/auth/otp/resend')
        .send({ email: TEST_EMAIL });

      expect(res.status).toBe(200);
      expect(body(res).success).toBe(true);
      expect(body(res).data?.status).toBe('otp_sent');
      expect(mockSendOtpEmail).not.toHaveBeenCalled();
    });
  });
});
