import { verify as totpVerify, generateSecret, generateURI } from 'otplib';
import qrcode from 'qrcode';
import { AppDataSource } from '../../config/database';
import { User } from '../../entities/user.entity';
import { encryptTotp, decryptTotp } from '../../utils/totp-encryption';
import { hashSHA256 } from '../../utils/crypto';
import { signJwt, generateRefreshToken, JwtPayload } from '../../utils/jwt';
import { insertRefreshToken } from '../../repositories/refresh-token.repository';
import { findUserByEmail } from '../../repositories/user.repository';
import { AuthError, UnprocessableError } from '../../types/errors';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MfaSetupResult {
  totp_uri: string;
  qr_code_data_url: string;
}

export interface MfaVerifyResult {
  sessionToken: string;
  refreshToken: string;
  user: JwtPayload;
}

async function getUserOrThrow(userId: string): Promise<User> {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { user_id: userId },
  });
  if (!user) throw new AuthError('User not found', 'UNAUTHORIZED');
  return user;
}

async function checkTotp(totpCode: string, secret: string): Promise<boolean> {
  const result = await totpVerify({
    token: totpCode,
    secret,
    epochTolerance: 30,
  });
  return result.valid;
}

export async function setupMfa(userId: string): Promise<MfaSetupResult> {
  const user = await getUserOrThrow(userId);
  const secret = generateSecret();
  const totp_uri = String(
    generateURI({ label: user.email, issuer: 'Hashira', secret }),
  );
  const qr_code_data_url = await qrcode.toDataURL(totp_uri);

  await AppDataSource.getRepository(User).update(
    { user_id: userId },
    { totp_secret_pending: encryptTotp(secret) },
  );

  return { totp_uri, qr_code_data_url };
}

export async function confirmMfa(
  userId: string,
  totpCode: string,
): Promise<void> {
  const user = await getUserOrThrow(userId);

  if (!user.totp_secret_pending) {
    throw new UnprocessableError(
      'No pending MFA setup found — call /mfa/setup first',
      'UNPROCESSABLE',
    );
  }

  const secret = decryptTotp(user.totp_secret_pending);
  if (!(await checkTotp(totpCode, secret))) {
    throw new AuthError('Invalid TOTP code', 'INVALID_TOTP');
  }

  await AppDataSource.transaction(async (manager) => {
    await manager.getRepository(User).update(
      { user_id: userId },
      {
        totp_secret: user.totp_secret_pending,
        totp_secret_pending: null,
        mfa_enabled: true,
      },
    );
  });
}

export async function verifyMfaAtLogin(
  email: string,
  totpCode: string,
): Promise<MfaVerifyResult> {
  const user = await findUserByEmail(email);

  if (!user || !user.mfa_enabled || !user.totp_secret) {
    throw new AuthError('Invalid TOTP code', 'INVALID_TOTP');
  }

  const secret = decryptTotp(user.totp_secret);
  if (!(await checkTotp(totpCode, secret))) {
    throw new AuthError('Invalid TOTP code', 'INVALID_TOTP');
  }

  const payload: JwtPayload = {
    user_id: user.user_id,
    org_id: user.org_id,
    role: user.role,
    email: user.email,
  };
  const sessionToken = signJwt(payload);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashSHA256(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await insertRefreshToken(user.user_id, tokenHash, expiresAt);

  return { sessionToken, refreshToken, user: payload };
}

export async function disableMfa(
  userId: string,
  totpCode: string,
): Promise<void> {
  const user = await getUserOrThrow(userId);

  if (!user.mfa_enabled || !user.totp_secret) {
    throw new UnprocessableError(
      'MFA is not currently enabled',
      'UNPROCESSABLE',
    );
  }

  const secret = decryptTotp(user.totp_secret);
  if (!(await checkTotp(totpCode, secret))) {
    throw new AuthError('Invalid TOTP code', 'INVALID_TOTP');
  }

  await AppDataSource.getRepository(User).update(
    { user_id: userId },
    { mfa_enabled: false, totp_secret: null, totp_secret_pending: null },
  );
}
