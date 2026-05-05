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
