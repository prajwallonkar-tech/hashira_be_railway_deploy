import { AppDataSource } from '../../config/database';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { User } from '../../entities/user.entity';
import { findRefreshTokenByHash } from '../../repositories/refresh-token.repository';
import { signJwt, generateRefreshToken, JwtPayload } from '../../utils/jwt';
import { hashSHA256 } from '../../utils/crypto';
import { AuthError } from '../../types/errors';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RefreshResult {
  sessionToken: string;
  refreshToken: string;
}

export async function rotateRefreshToken(
  inboundRawToken: string,
): Promise<RefreshResult> {
  const tokenHash = hashSHA256(inboundRawToken);
  const existing = await findRefreshTokenByHash(tokenHash);

  if (!existing) {
    throw new AuthError(
      'Refresh token is missing, expired, or already used',
      'UNAUTHORIZED',
    );
  }

  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { user_id: existing.user_id } });

  if (!user) {
    throw new AuthError('User not found', 'UNAUTHORIZED');
  }

  const newRawToken = generateRefreshToken();
  const newTokenHash = hashSHA256(newRawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await AppDataSource.transaction(async (manager) => {
    await manager
      .getRepository(RefreshToken)
      .update({ id: existing.id }, { used: true });
    const newToken = manager.getRepository(RefreshToken).create({
      user_id: user.user_id,
      token_hash: newTokenHash,
      expires_at: expiresAt,
      used: false,
    });
    await manager.getRepository(RefreshToken).save(newToken);
  });

  const payload: JwtPayload = {
    user_id: user.user_id,
    org_id: user.org_id,
    role: user.role,
    email: user.email,
  };

  return {
    sessionToken: signJwt(payload),
    refreshToken: newRawToken,
  };
}
