import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { findUserByEmail } from '../../repositories/user.repository';
import {
  findPasswordResetToken,
  insertPasswordResetToken,
  applyPasswordReset,
} from '../../repositories/password-reset-token.repository';
import { sendPasswordResetEmail } from '../../utils/ses.client';
import { hashSHA256 } from '../../utils/crypto';
import { ForbiddenError, GoneError, RateLimitError } from '../../types/errors';

interface FailedAttemptRecord {
  count: number;
  windowStart: number;
}

const CONFIRM_ATTEMPT_LIMIT = 5;
const CONFIRM_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;

const confirmFailedAttempts = new Map<string, FailedAttemptRecord>();

export function resetConfirmAttempts(): void {
  confirmFailedAttempts.clear();
}

export class PasswordResetService {
  async requestReset(email: string): Promise<void> {
    const user = await findUserByEmail(email);
    if (!user || user.password_hash === null) return;

    const otp =
      process.env.SKIP_SES === 'true'
        ? '123456'
        : String(crypto.randomInt(100000, 999999));
    // Embed email in hash to avoid unique constraint collisions across users
    const tokenHash = hashSHA256(email.toLowerCase() + otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await insertPasswordResetToken(user.user_id, tokenHash, expiresAt);
    await sendPasswordResetEmail(email, otp);
  }

  async confirmReset(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    const emailKey = email.toLowerCase();

    const record = confirmFailedAttempts.get(emailKey);
    if (record) {
      const windowExpired =
        Date.now() - record.windowStart > CONFIRM_ATTEMPT_WINDOW_MS;
      if (windowExpired) {
        confirmFailedAttempts.delete(emailKey);
      } else if (record.count >= CONFIRM_ATTEMPT_LIMIT) {
        const retryAfterSec = Math.ceil(
          (CONFIRM_ATTEMPT_WINDOW_MS - (Date.now() - record.windowStart)) /
            1000,
        );
        throw new RateLimitError(
          'Too many password reset attempts. Try again later.',
          'RATE_LIMIT_EXCEEDED',
          retryAfterSec,
        );
      }
    }

    const tokenHash = hashSHA256(emailKey + otp);
    const token = await findPasswordResetToken(tokenHash);

    if (!token) {
      const current = confirmFailedAttempts.get(emailKey);
      if (current) {
        current.count += 1;
      } else {
        confirmFailedAttempts.set(emailKey, {
          count: 1,
          windowStart: Date.now(),
        });
      }
      throw new GoneError('Reset code not found or expired', 'GONE');
    }

    confirmFailedAttempts.delete(emailKey);

    const user = await findUserByEmail(email);
    if (!user || user.password_hash === null) {
      throw new ForbiddenError(
        'Password reset is not available for this account',
        'FORBIDDEN',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await applyPasswordReset(user.user_id, token.token_id, passwordHash);
  }
}

export const passwordResetService = new PasswordResetService();
