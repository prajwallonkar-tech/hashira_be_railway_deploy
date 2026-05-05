import { MoreThan } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { User } from '../entities/user.entity';

export async function findPasswordResetToken(
  tokenHash: string,
): Promise<PasswordResetToken | null> {
  return AppDataSource.getRepository(PasswordResetToken).findOne({
    where: {
      token_hash: tokenHash,
      used: false,
      expires_at: MoreThan(new Date()),
    },
  });
}

export async function insertPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  const repo = AppDataSource.getRepository(PasswordResetToken);
  const token = repo.create({
    user_id: userId,
    token_hash: tokenHash,
    used: false,
    expires_at: expiresAt,
  });
  await repo.save(token);
}

export async function applyPasswordReset(
  userId: string,
  tokenId: string,
  passwordHash: string,
): Promise<void> {
  await AppDataSource.transaction(async (manager) => {
    await manager.update(
      User,
      { user_id: userId },
      { password_hash: passwordHash },
    );
    await manager.update(
      PasswordResetToken,
      { token_id: tokenId },
      { used: true },
    );
  });
}
