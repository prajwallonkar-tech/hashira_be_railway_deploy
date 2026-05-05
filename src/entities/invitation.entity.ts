import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { UserRole, InvitationStatus } from '../types/enums';

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  invitation_id!: string;

  @Column({ type: 'uuid' })
  org_id!: string;

  @Column({ type: 'uuid' })
  invited_by!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status!: InvitationStatus;

  @Column({ type: 'char', length: 64, unique: true })
  token_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
