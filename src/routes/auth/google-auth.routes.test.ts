import request from 'supertest';
import { app } from '../../app';
import * as userRepo from '../../repositories/user.repository';
import * as orgRepo from '../../repositories/organisation.repository';
import * as refreshTokenRepo from '../../repositories/refresh-token.repository';
import * as jose from 'jose';
import * as jwtUtils from '../../utils/jwt';
import {
  UserRole,
  UserStatus,
  OrgStatus,
  SubscriptionStatus,
} from '../../types/enums';
import { User } from '../../entities/user.entity';
import { Organisation } from '../../entities/organisation.entity';

jest.mock('jose');
jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/organisation.repository');
jest.mock('../../repositories/refresh-token.repository');
jest.mock('../../utils/jwt');

const mockJwtVerify = jose.jwtVerify as jest.Mock;
const mockFindUserByGoogleSub =
  userRepo.findUserByGoogleSub as jest.MockedFunction<
    typeof userRepo.findUserByGoogleSub
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
  data?: { user_id?: string; email?: string; role?: string };
  message?: string;
}
function body(res: { body: unknown }): ApiBody {
  return res.body as ApiBody;
}

const TEST_EMAIL = 'user@example.com';
const TEST_GOOGLE_SUB = 'google-sub-abc123';
const VALID_ID_TOKEN = 'valid.google.id.token';
const MOCK_SESSION_TOKEN = 'mock.jwt.session.token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-base64url';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 'mock-user-uuid-1',
    org_id: 'mock-org-uuid-1',
    email: TEST_EMAIL,
    password_hash: null,
    google_sub: TEST_GOOGLE_SUB,
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
});

describe('POST /v1/auth/google', () => {
  describe('request validation', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/v1/auth/google').send({});
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(400);
    });

    it('returns 400 when google_id_token is missing', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ other: 'field' });
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });
  });

  describe('token verification', () => {
    it('returns 401 when token is invalid', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWTExpired'));

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(401);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(401);
    });

    it('returns 401 when email_verified is false', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: TEST_GOOGLE_SUB,
          email: TEST_EMAIL,
          email_verified: false,
        },
        protectedHeader: { alg: 'RS256' },
      });

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(401);
      expect(body(res).success).toBe(false);
    });
  });

  describe('user lookup', () => {
    it('returns 403 when user not found', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: TEST_GOOGLE_SUB,
          email: TEST_EMAIL,
          email_verified: true,
        },
        protectedHeader: { alg: 'RS256' },
      });
      mockFindUserByGoogleSub.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(403);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(403);
    });

    it('returns 403 when org is suspended', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: TEST_GOOGLE_SUB,
          email: TEST_EMAIL,
          email_verified: true,
        },
        protectedHeader: { alg: 'RS256' },
      });
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(
        makeOrg({ status: OrgStatus.SUSPENDED }),
      );

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(403);
      expect(body(res).success).toBe(false);
    });
  });

  describe('successful login', () => {
    beforeEach(() => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: TEST_GOOGLE_SUB,
          email: TEST_EMAIL,
          email_verified: true,
        },
        protectedHeader: { alg: 'RS256' },
      });
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());
    });

    it('returns 200 with user data', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(200);
      expect(body(res).success).toBe(true);
      expect(body(res).data?.email).toBe(TEST_EMAIL);
      expect(body(res).data?.role).toBe(UserRole.MEMBER);
    });

    it('sets hashira_session cookie', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      const cookies = res.headers['set-cookie'] as string[] | string;
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArr.some((c) => c.startsWith('hashira_session='))).toBe(
        true,
      );
    });

    it('sets hashira_refresh cookie', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      const cookies = res.headers['set-cookie'] as string[] | string;
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArr.some((c) => c.startsWith('hashira_refresh='))).toBe(
        true,
      );
    });
  });
});
