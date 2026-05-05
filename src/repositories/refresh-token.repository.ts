import { MoreThan } from 'typeorm';
import { AppDataSource } from '../config/database';
import { RefreshToken } from '../entities/refresh-token.entity';

export async function findRefreshTokenByHash(
  tokenHash: string,
): Promise<RefreshToken | null> {
  return AppDataSource.getRepository(RefreshToken).findOne({
    where: {
      token_hash: tokenHash,
      used: false,
      expires_at: MoreThan(new Date()),
    },
  });
}

export async function markRefreshTokenUsedByHash(
  tokenHash: string,
): Promise<void> {
  await AppDataSource.getRepository(RefreshToken).update(
    { token_hash: tokenHash, used: false },
    { used: true },
  );
}

export async function insertRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  const repo = AppDataSource.getRepository(RefreshToken);
  const token = repo.create({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used: false,
  });
  await repo.save(token);
}
