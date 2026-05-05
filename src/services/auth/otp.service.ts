import crypto from 'crypto';
import {
  findLatestOtpToken,
  markOtpTokenUsed,
  incrementOtpAttempts,
  insertOtpToken,
} from '../../repositories/otp-token.repository';
import { findUserByEmail } from '../../repositories/user.repository';
import { findOrgById } from '../../repositories/organisation.repository';
import { insertRefreshToken } from '../../repositories/refresh-token.repository';
import { signJwt, generateRefreshToken, JwtPayload } from '../../utils/jwt';
import { hashSHA256 } from '../../utils/crypto';
import { sendOtpEmail } from '../../utils/ses.client';
import { AuthError, ForbiddenError, RateLimitError } from '../../types/errors';
import { OrgStatus, UserStatus } from '../../types/enums';

const OTP_ATTEMPT_LIMIT = 5;

export type OtpVerifyResult =
  | { status: 'mfa_required' }
  | {
      status: 'authenticated';
      sessionToken: string;
      refreshToken: string;
      user: JwtPayload;
    };

export class OtpService {
  async verifyOtp(email: string, otp: string): Promise<OtpVerifyResult> {
    const emailHash = hashSHA256(email.toLowerCase());
    const token = await findLatestOtpToken(emailHash);

    if (!token) {
      throw new AuthError('Invalid or expired OTP', 'INVALID_OTP');
    }

    if (token.attempts >= OTP_ATTEMPT_LIMIT) {
      throw new RateLimitError(
        'Too many OTP attempts. Request a new code.',
        'RATE_LIMIT_EXCEEDED',
      );
    }

    const storedHash = Buffer.from(token.otp_hash, 'hex');
    const computedHash = Buffer.from(hashSHA256(otp), 'hex');
    const match = crypto.timingSafeEqual(storedHash, computedHash);

    if (!match) {
      await incrementOtpAttempts(token.id);
      throw new AuthError('Invalid OTP', 'INVALID_OTP');
    }

    await markOtpTokenUsed(token.id);

    const user = await findUserByEmail(email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AuthError('Invalid or expired OTP', 'INVALID_OTP');
    }

    const org = await findOrgById(user.org_id!);
    if (org?.status === OrgStatus.SUSPENDED) {
      throw new ForbiddenError('Organisation is suspended', 'ORG_SUSPENDED');
    }

    if (user.mfa_enabled) {
      return { status: 'mfa_required' };
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

    return {
      status: 'authenticated',
      sessionToken,
      refreshToken,
      user: jwtPayload,
    };
  }

  async resendOtp(email: string): Promise<void> {
    const emailHash = hashSHA256(email.toLowerCase());
    const existingToken = await findLatestOtpToken(emailHash);

    if (!existingToken) {
      return;
    }

    await markOtpTokenUsed(existingToken.id);

    const otp =
      process.env.SKIP_SES === 'true'
        ? '123456'
        : String(crypto.randomInt(100000, 999999));
    const otpHash = hashSHA256(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await insertOtpToken(emailHash, otpHash, expiresAt);
    await sendOtpEmail(email, otp);
  }
}

export const otpService = new OtpService();
