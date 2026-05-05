import * as jose from 'jose';
import * as userRepo from '../../repositories/user.repository';
import * as orgRepo from '../../repositories/organisation.repository';
import * as invitationRepo from '../../repositories/invitation.repository';
import * as refreshTokenRepo from '../../repositories/refresh-token.repository';
import * as jwtUtils from '../../utils/jwt';
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
import { GoogleAuthService } from './google-auth.service';

jest.mock('jose');
jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/organisation.repository');
jest.mock('../../repositories/invitation.repository');
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
const mockUpdateUserGoogleSub =
  userRepo.updateUserGoogleSub as jest.MockedFunction<
    typeof userRepo.updateUserGoogleSub
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

const TEST_EMAIL = 'user@example.com';
const TEST_GOOGLE_SUB = 'google-sub-abc123';
const VALID_ID_TOKEN = 'valid.google.id.token';
const MOCK_SESSION_TOKEN = 'mock.jwt.session.token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-base64url';
const VALID_INVITATION_TOKEN = 'valid-plaintext-invitation-token-abc123';

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

function mockValidToken(overrides: Record<string, unknown> = {}): void {
  mockJwtVerify.mockResolvedValue({
    payload: {
      sub: TEST_GOOGLE_SUB,
      email: TEST_EMAIL,
      email_verified: true,
      ...overrides,
    },
    protectedHeader: { alg: 'RS256' },
  });
}

let service: GoogleAuthService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new GoogleAuthService();
  mockSignJwt.mockReturnValue(MOCK_SESSION_TOKEN);
  mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  mockInsertRefreshToken.mockResolvedValue(undefined);
  mockUpdateUserGoogleSub.mockResolvedValue(undefined);
});

describe('GoogleAuthService.createGoogleSession', () => {
  describe('token verification', () => {
    it('throws AuthError UNAUTHORIZED when jose.jwtVerify rejects', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWTExpired'));

      await expect(
        service.createGoogleSession(VALID_ID_TOKEN),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });

    it('throws AuthError UNAUTHORIZED when email_verified is false', async () => {
      mockValidToken({ email_verified: false });

      await expect(
        service.createGoogleSession(VALID_ID_TOKEN),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });
  });

  describe('user lookup', () => {
    it('throws ForbiddenError NO_INVITATION when no user found by google_sub or email', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);

      await expect(
        service.createGoogleSession(VALID_ID_TOKEN),
      ).rejects.toMatchObject({
        code: 'NO_INVITATION',
        statusCode: 403,
      });
    });

    it('links google_sub and proceeds when invited user found by email with no google_sub', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(makeUser({ google_sub: null }));
      mockFindOrgById.mockResolvedValue(makeOrg());

      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockUpdateUserGoogleSub).toHaveBeenCalledWith(
        'mock-user-uuid-1',
        TEST_GOOGLE_SUB,
      );
    });

    it('does not call updateUserGoogleSub when user already has google_sub', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());

      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockUpdateUserGoogleSub).not.toHaveBeenCalled();
    });

    it('does not fall back to email lookup when user found by google_sub', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());

      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockFindUserByEmail).not.toHaveBeenCalled();
    });
  });

  describe('org status check', () => {
    it('throws ForbiddenError ORG_SUSPENDED when org is suspended', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(
        makeOrg({ status: OrgStatus.SUSPENDED }),
      );

      await expect(
        service.createGoogleSession(VALID_ID_TOKEN),
      ).rejects.toMatchObject({
        code: 'ORG_SUSPENDED',
        statusCode: 403,
      });
    });
  });

  describe('successful session creation', () => {
    beforeEach(() => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());
    });

    it('calls signJwt with correct payload', async () => {
      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockSignJwt).toHaveBeenCalledWith({
        user_id: 'mock-user-uuid-1',
        org_id: 'mock-org-uuid-1',
        role: UserRole.MEMBER,
        email: TEST_EMAIL,
      });
    });

    it('inserts refresh token with SHA-256 hash and 7-day expiry', async () => {
      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockInsertRefreshToken).toHaveBeenCalledTimes(1);
      const [userId, tokenHash, expiresAt] =
        mockInsertRefreshToken.mock.calls[0];
      expect(userId).toBe('mock-user-uuid-1');
      expect(tokenHash).toHaveLength(64);
      expect(expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 6 * 24 * 60 * 60 * 1000,
      );
    });

    it('returns sessionToken, refreshToken, and user data', async () => {
      const result = await service.createGoogleSession(VALID_ID_TOKEN);

      expect(result.sessionToken).toBe(MOCK_SESSION_TOKEN);
      expect(result.refreshToken).toBe(MOCK_REFRESH_TOKEN);
      expect(result.user.user_id).toBe('mock-user-uuid-1');
      expect(result.user.email).toBe(TEST_EMAIL);
      expect(result.user.role).toBe(UserRole.MEMBER);
    });
  });
});

describe('GoogleAuthService.createGoogleSession — invitation path', () => {
  beforeEach(() => {
    mockValidToken();
    mockFindUserByGoogleSub.mockResolvedValue(null);
    mockFindUserByEmail.mockResolvedValue(null);
    mockFindInvitationByTokenHash.mockResolvedValue(makeInvitation());
    mockFindOrgById.mockResolvedValue(makeOrg());
    mockCountActiveUsersByOrg.mockResolvedValue(5);
    mockAcceptInvitationAndCreateUser.mockResolvedValue(makeUser());
  });

  it('throws ForbiddenError NO_INVITATION when user not found and no invitation token', async () => {
    await expect(
      service.createGoogleSession(VALID_ID_TOKEN),
    ).rejects.toMatchObject({ code: 'NO_INVITATION', statusCode: 403 });

    expect(mockFindInvitationByTokenHash).not.toHaveBeenCalled();
  });

  it('throws GoneError GONE when invitation token not found', async () => {
    mockFindInvitationByTokenHash.mockResolvedValue(null);

    await expect(
      service.createGoogleSession(VALID_ID_TOKEN, VALID_INVITATION_TOKEN),
    ).rejects.toMatchObject({ code: 'GONE', statusCode: 410 });

    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError ORG_SUSPENDED when org is suspended', async () => {
    mockFindOrgById.mockResolvedValue(makeOrg({ status: OrgStatus.SUSPENDED }));

    await expect(
      service.createGoogleSession(VALID_ID_TOKEN, VALID_INVITATION_TOKEN),
    ).rejects.toMatchObject({ code: 'ORG_SUSPENDED', statusCode: 403 });

    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError USER_LIMIT_REACHED when org is at capacity', async () => {
    mockCountActiveUsersByOrg.mockResolvedValue(10);
    mockFindOrgById.mockResolvedValue(makeOrg({ user_limit: 10 }));

    await expect(
      service.createGoogleSession(VALID_ID_TOKEN, VALID_INVITATION_TOKEN),
    ).rejects.toMatchObject({ code: 'USER_LIMIT_REACHED', statusCode: 403 });

    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });

  it('calls acceptInvitationAndCreateUser with google_sub and invitation fields', async () => {
    const invitation = makeInvitation({
      org_id: 'mock-org-uuid-1',
      role: UserRole.ADMIN,
      invited_by: 'mock-admin-uuid-1',
    });
    mockFindInvitationByTokenHash.mockResolvedValue(invitation);

    await service.createGoogleSession(VALID_ID_TOKEN, VALID_INVITATION_TOKEN);

    expect(mockAcceptInvitationAndCreateUser).toHaveBeenCalledWith(
      invitation,
      expect.objectContaining({
        email: TEST_EMAIL,
        google_sub: TEST_GOOGLE_SUB,
        org_id: 'mock-org-uuid-1',
        role: UserRole.ADMIN,
        invited_by: 'mock-admin-uuid-1',
      }),
    );
  });

  it('issues session and refresh tokens after creating the user via invitation', async () => {
    await service.createGoogleSession(VALID_ID_TOKEN, VALID_INVITATION_TOKEN);

    expect(mockAcceptInvitationAndCreateUser).toHaveBeenCalledTimes(1);
    expect(mockSignJwt).toHaveBeenCalledTimes(1);
    expect(mockInsertRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('skips invitation path when returning user is found by google_sub', async () => {
    mockFindUserByGoogleSub.mockResolvedValue(makeUser());

    await service.createGoogleSession(VALID_ID_TOKEN, VALID_INVITATION_TOKEN);

    expect(mockFindInvitationByTokenHash).not.toHaveBeenCalled();
    expect(mockAcceptInvitationAndCreateUser).not.toHaveBeenCalled();
  });
});
