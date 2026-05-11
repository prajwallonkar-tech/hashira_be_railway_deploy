import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { UserStatus } from '../types/enums';

export async function findUserByEmail(email: string): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({ where: { email } });
}

export async function findUserByGoogleSub(
  googleSub: string,
): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({
    where: { google_sub: googleSub },
  });
}

export async function updateUserGoogleSub(
  userId: string,
  googleSub: string,
): Promise<void> {
  await AppDataSource.getRepository(User).update(
    { user_id: userId },
    { google_sub: googleSub },
  );
}

export async function countActiveUsersByOrg(orgId: string): Promise<number> {
  return AppDataSource.getRepository(User).count({
    where: { org_id: orgId, status: UserStatus.ACTIVE },
  });
}

export async function findUserByIdAndOrg(
  userId: string,
  orgId: string,
): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({
    where: { user_id: userId, org_id: orgId, status: UserStatus.ACTIVE },
  });
}

export async function findUserByEmailAndOrg(
  email: string,
  orgId: string,
): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({
    where: { email, org_id: orgId, status: UserStatus.ACTIVE },
  });
}

export async function findUsersByIds(
  userIds: string[],
): Promise<Pick<User, 'user_id' | 'email'>[]> {
  if (userIds.length === 0) return [];
  return AppDataSource.getRepository(User).find({
    where: { user_id: In(userIds) },
    select: { user_id: true, email: true },
  });
}
