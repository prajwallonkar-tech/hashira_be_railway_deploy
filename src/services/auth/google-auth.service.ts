import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  findUserByGoogleSub,
  findUserByEmail,
  updateUserGoogleSub,
  countActiveUsersByOrg,
} from '../../repositories/user.repository';
import { findOrgById } from '../../repositories/organisation.repository';
import {
  findInvitationByTokenHash,
  acceptInvitationAndCreateUser,
} from '../../repositories/invitation.repository';
import { insertRefreshToken } from '../../repositories/refresh-token.repository';
import { signJwt, generateRefreshToken, JwtPayload } from '../../utils/jwt';
import { hashSHA256 } from '../../utils/crypto';
import { AuthError, ForbiddenError, GoneError } from '../../types/errors';
import { OrgStatus, UserStatus } from '../../types/enums';
import { env } from '../../config/env';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { cacheMaxAge: 60 * 60 * 1000 },
);

export interface GoogleSessionResult {
  sessionToken: string;
  refreshToken: string;
  user: JwtPayload;
}

export class GoogleAuthService {
  async createGoogleSession(
    idToken: string,
    invitationToken?: string,
  ): Promise<GoogleSessionResult> {
    let sub: string;
    let email: string;
    let emailVerified: boolean;

    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        audience: env.GOOGLE_CLIENT_ID,
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
      });
      sub = payload.sub as string;
      email = payload['email'] as string;
      emailVerified = payload['email_verified'] as boolean;
    } catch {
      throw new AuthError('Invalid or expired Google ID token', 'UNAUTHORIZED');
    }

    if (!emailVerified) {
      throw new AuthError(
        'Google account email is not verified',
        'UNAUTHORIZED',
      );
    }

    let user = await findUserByGoogleSub(sub);

    if (!user) {
      const existingUser = await findUserByEmail(email);
      if (existingUser && existingUser.google_sub === null) {
        await updateUserGoogleSub(existingUser.user_id, sub);
        user = { ...existingUser, google_sub: sub };
      }
    }

    if (!user) {
      if (!invitationToken) {
        throw new ForbiddenError(
          'No invitation found for this account',
          'NO_INVITATION',
        );
      }

      const invitationTokenHash = hashSHA256(invitationToken);
      const invitation = await findInvitationByTokenHash(invitationTokenHash);

      if (!invitation) {
        throw new GoneError('Invitation not found or expired', 'GONE');
      }

      const org = await findOrgById(invitation.org_id);
      if (org?.status === OrgStatus.SUSPENDED) {
        throw new ForbiddenError('Organisation is suspended', 'ORG_SUSPENDED');
      }

      const memberCount = await countActiveUsersByOrg(invitation.org_id);
      if (memberCount >= (org?.user_limit ?? 0)) {
        throw new ForbiddenError(
          'Organisation has reached its user limit',
          'USER_LIMIT_REACHED',
        );
      }

      user = await acceptInvitationAndCreateUser(invitation, {
        email,
        google_sub: sub,
        org_id: invitation.org_id,
        role: invitation.role,
        invited_by: invitation.invited_by,
        status: UserStatus.ACTIVE,
        mfa_enabled: false,
      });
    }

    const org = await findOrgById(user.org_id!);
    if (org?.status === OrgStatus.SUSPENDED) {
      throw new ForbiddenError('Organisation is suspended', 'ORG_SUSPENDED');
    }

    const jwtPayload: JwtPayload = {
      user_id: user.user_id,
      org_id: user.org_id,
      role: user.role,
      email: user.email,
    };

    const sessionToken = signJwt(jwtPayload);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashSHA256(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await insertRefreshToken(user.user_id, tokenHash, expiresAt);

    return { sessionToken, refreshToken, user: jwtPayload };
  }
}

export const googleAuthService = new GoogleAuthService();
