import { AppDataSource } from '../config/database';
import { Organisation } from '../entities/organisation.entity';
import { User } from '../entities/user.entity';
import { OrgStatus, UserRole, UserStatus } from '../types/enums';

export async function findOrgById(orgId: string): Promise<Organisation | null> {
  return AppDataSource.getRepository(Organisation).findOne({
    where: { org_id: orgId },
  });
}

export async function findOrgByName(
  name: string,
): Promise<Organisation | null> {
  return AppDataSource.getRepository(Organisation).findOne({ where: { name } });
}

export interface CreateOrgWithAdminInput {
  orgName: string;
  adminEmail: string;
  passwordHash: string | null;
  googleSub: string | null;
}

export interface CreateOrgWithAdminResult {
  org: Organisation;
  user: User;
}

export async function createOrgWithAdmin(
  input: CreateOrgWithAdminInput,
): Promise<CreateOrgWithAdminResult> {
  return AppDataSource.transaction(async (manager) => {
    const orgRepo = manager.getRepository(Organisation);
    const userRepo = manager.getRepository(User);

    const org = orgRepo.create({
      name: input.orgName,
      status: OrgStatus.PAYMENT_PENDING,
    });
    const savedOrg = await orgRepo.save(org);

    const user = userRepo.create({
      org_id: savedOrg.org_id,
      email: input.adminEmail,
      password_hash: input.passwordHash,
      google_sub: input.googleSub,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      mfa_enabled: false,
    });
    const savedUser = await userRepo.save(user);

    return { org: savedOrg, user: savedUser };
  });
}
