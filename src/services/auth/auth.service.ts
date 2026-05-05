import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  findUserByEmail,
  countActiveUsersByOrg,
} from '../../repositories/user.repository';
import {
  findInvitationByTokenHash,
  acceptInvitationAndCreateUser,
} from '../../repositories/invitation.repository';
import { findOrgById } from '../../repositories/organisation.repository';
import { insertOtpToken } from '../../repositories/otp-token.repository';
import { sendOtpEmail } from '../../utils/ses.client';
import { hashSHA256 } from '../../utils/crypto';
import { DUMMY_BCRYPT_HASH } from '../../utils/auth.constants';
import {
  AuthError,
  ForbiddenError,
  GoneError,
  RateLimitError,
} from '../../types/errors';
import { OrgStatus, UserStatus } from '../../types/enums';

interface FailedAttemptRecord {
  count: number;
  windowStart: number;
}

const FAILED_ATTEMPT_LIMIT = 10;
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

const emailFailedAttempts = new Map<string, FailedAttemptRecord>();

export function resetFailedAttempts(): void {
  emailFailedAttempts.clear();
}

export class AuthService {
  async createEmailPasswordSession(
    email: string,
    password: string,
    invitationToken?: string,
  ): Promise<void> {
    if (invitationToken) {
      return this.handleInvitedUserRegistration(
        email,
        password,
        invitationToken,
      );
    }
    return this.handleReturningUserLogin(email, password);
  }

  private async handleInvitedUserRegistration(
    email: string,
    password: string,
    invitationToken: string,
  ): Promise<void> {
    const tokenHash = hashSHA256(invitationToken);
    const invitation = await findInvitationByTokenHash(tokenHash);

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

    const passwordHash = await bcrypt.hash(password, 12);

    await acceptInvitationAndCreateUser(invitation, {
      email,
      password_hash: passwordHash,
      org_id: invitation.org_id,
      role: invitation.role,
      invited_by: invitation.invited_by,
      status: UserStatus.ACTIVE,
      mfa_enabled: false,
    });

    const otp =
      process.env.SKIP_SES === 'true'
        ? '123456'
        : String(crypto.randomInt(100000, 999999));
    const emailHash = hashSHA256(email.toLowerCase());
    const otpHash = hashSHA256(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await insertOtpToken(emailHash, otpHash, expiresAt);
    await sendOtpEmail(email, otp);
  }

  private async handleReturningUserLogin(
    email: string,
    password: string,
  ): Promise<void> {
    const emailKey = email.toLowerCase();

    const record = emailFailedAttempts.get(emailKey);
    if (record) {
      const windowExpired =
        Date.now() - record.windowStart > FAILED_ATTEMPT_WINDOW_MS;
      if (windowExpired) {
        emailFailedAttempts.delete(emailKey);
      } else if (record.count >= FAILED_ATTEMPT_LIMIT) {
        const retryAfterSec = Math.ceil(
          (FAILED_ATTEMPT_WINDOW_MS - (Date.now() - record.windowStart)) / 1000,
        );
        throw new RateLimitError(
          'Too many failed login attempts. Try again later.',
          'RATE_LIMIT_EXCEEDED',
          retryAfterSec,
        );
      }
    }

    const user = await findUserByEmail(email);
    const hashToCompare = user?.password_hash ?? DUMMY_BCRYPT_HASH;

    const match = await bcrypt.compare(password, hashToCompare);

    if (!match || !user) {
      const current = emailFailedAttempts.get(emailKey);
      if (current) {
        current.count += 1;
      } else {
        emailFailedAttempts.set(emailKey, {
          count: 1,
          windowStart: Date.now(),
        });
      }
      throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    emailFailedAttempts.delete(emailKey);

    const otp =
      process.env.SKIP_SES === 'true'
        ? '123456'
        : String(crypto.randomInt(100000, 999999));
    const emailHash = hashSHA256(email.toLowerCase());
    const otpHash = hashSHA256(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await insertOtpToken(emailHash, otpHash, expiresAt);
    await sendOtpEmail(email, otp);
  }
}

export const authService = new AuthService();
