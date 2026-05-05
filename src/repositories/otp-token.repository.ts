import { MoreThan } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OtpToken } from '../entities/otp-token.entity';

export async function findLatestOtpToken(
  emailHash: string,
): Promise<OtpToken | null> {
  return AppDataSource.getRepository(OtpToken).findOne({
    where: {
      email_hash: emailHash,
      used: false,
      expires_at: MoreThan(new Date()),
    },
    order: { created_at: 'DESC' },
  });
}

export async function markOtpTokenUsed(id: string): Promise<void> {
  await AppDataSource.getRepository(OtpToken).update(id, { used: true });
}

export async function incrementOtpAttempts(id: string): Promise<void> {
  await AppDataSource.getRepository(OtpToken).increment({ id }, 'attempts', 1);
}

export async function insertOtpToken(
  emailHash: string,
  otpHash: string,
  expiresAt: Date,
): Promise<void> {
  const repo = AppDataSource.getRepository(OtpToken);
  const token = repo.create({
    email_hash: emailHash,
    otp_hash: otpHash,
    expires_at: expiresAt,
    used: false,
    attempts: 0,
  });
  await repo.save(token);
}
