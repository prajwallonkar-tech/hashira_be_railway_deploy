import request from 'supertest';
import { app } from '../../app';
import * as userRepo from '../../repositories/user.repository';
import * as otpTokenRepo from '../../repositories/otp-token.repository';
import * as sesClient from '../../utils/ses.client';
import bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../../types/enums';
import { User } from '../../entities/user.entity';
import { resetFailedAttempts } from '../../services/auth/auth.service';

jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/otp-token.repository');
jest.mock('../../utils/ses.client');
jest.mock('bcrypt');

const mockFindUserByEmail = userRepo.findUserByEmail as jest.MockedFunction<
  typeof userRepo.findUserByEmail
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

interface ApiBody {
  success?: boolean;
  statusCode?: number;
  data?: { status?: string };
  message?: string;
}

function body(res: { body: unknown }): ApiBody {
  return res.body as ApiBody;
}

// Test fixture constants — not real credentials
const MOCK_STORED_HASH = '$2b$12$mock_only';
const TEST_EMAIL = 'user@example.com';
const UNKNOWN_EMAIL = 'unknown@example.com';
const CORRECT_INPUT = 'correct_test_input_1';
const WRONG_INPUT = 'wrong_test_input_1';
const SHORT_INPUT = 'short';
const INVALID_EMAIL = 'not-an-email';

function makeUser(): User {
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
  } as User;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFailedAttempts();
});

describe('POST /v1/auth/session', () => {
  describe('request validation', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/v1/auth/session').send({});
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });

    it('returns 400 when email is invalid format', async () => {
      const reqBody = { email: INVALID_EMAIL, password: CORRECT_INPUT };
      const res = await request(app).post('/v1/auth/session').send(reqBody);
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });

    it('returns 400 when input is under 8 characters', async () => {
      const reqBody = { email: TEST_EMAIL, password: SHORT_INPUT };
      const res = await request(app).post('/v1/auth/session').send(reqBody);
      expect(res.status).toBe(400);
      expect(body(res).success).toBe(false);
    });
  });

  describe('authentication logic', () => {
    it('returns 401 for unknown email', async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      const reqBody = { email: UNKNOWN_EMAIL, password: WRONG_INPUT };
      const res = await request(app).post('/v1/auth/session').send(reqBody);

      expect(res.status).toBe(401);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(401);
    });

    it('returns 401 for wrong input', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);

      const reqBody = { email: TEST_EMAIL, password: WRONG_INPUT };
      const res = await request(app).post('/v1/auth/session').send(reqBody);

      expect(res.status).toBe(401);
      expect(body(res).success).toBe(false);
    });

    it('returns 200 { status: otp_required } on valid credentials', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(true);
      mockInsertOtpToken.mockResolvedValue(undefined);
      mockSendOtpEmail.mockResolvedValue(undefined);

      const reqBody = { email: TEST_EMAIL, password: CORRECT_INPUT };
      const res = await request(app).post('/v1/auth/session').send(reqBody);

      expect(res.status).toBe(200);
      expect(body(res).success).toBe(true);
      expect(body(res).data?.status).toBe('otp_required');
    });

    it('401 response is identical for unknown email vs wrong input (no enumeration)', async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);
      const unknownReqBody = { email: UNKNOWN_EMAIL, password: WRONG_INPUT };
      const unknownRes = await request(app)
        .post('/v1/auth/session')
        .send(unknownReqBody);

      resetFailedAttempts();
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);
      const wrongReqBody = { email: TEST_EMAIL, password: WRONG_INPUT };
      const wrongRes = await request(app)
        .post('/v1/auth/session')
        .send(wrongReqBody);

      expect(unknownRes.status).toBe(wrongRes.status);
      expect(body(unknownRes).message).toBe(body(wrongRes).message);
    });
  });

  describe('email-based rate limiting', () => {
    it('returns 429 with Retry-After header after 10 failed attempts', async () => {
      mockFindUserByEmail.mockResolvedValue(makeUser());
      (mockBcryptCompare as unknown as jest.Mock).mockResolvedValue(false);
      const reqBody = { email: TEST_EMAIL, password: WRONG_INPUT };

      for (let i = 0; i < 10; i++) {
        await request(app).post('/v1/auth/session').send(reqBody);
      }

      const res = await request(app).post('/v1/auth/session').send(reqBody);

      expect(res.status).toBe(429);
      expect(body(res).success).toBe(false);
      expect(body(res).statusCode).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });
});
