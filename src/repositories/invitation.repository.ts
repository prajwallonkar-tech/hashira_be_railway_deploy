import { MoreThan } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invitation } from '../entities/invitation.entity';
import { User } from '../entities/user.entity';
import { InvitationStatus } from '../types/enums';

export async function findInvitationByTokenHash(
  tokenHash: string,
): Promise<Invitation | null> {
  return AppDataSource.getRepository(Invitation).findOne({
    where: {
      token_hash: tokenHash,
      status: InvitationStatus.PENDING,
      expires_at: MoreThan(new Date()),
    },
  });
}

export async function acceptInvitationAndCreateUser(
  invitation: Invitation,
  userData: Partial<User>,
): Promise<User> {
  return AppDataSource.transaction(async (manager) => {
    const newUser = manager.create(User, userData);
    const saved = await manager.save(User, newUser);
    await manager.update(
      Invitation,
      { invitation_id: invitation.invitation_id },
      { status: InvitationStatus.ACCEPTED },
    );
    return saved;
  });
}
