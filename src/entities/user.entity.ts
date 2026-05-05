import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { UserRole, UserStatus } from '../types/enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  user_id!: string;

  @Column({ type: 'uuid', nullable: true })
  org_id!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password_hash!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  google_sub!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role!: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ type: 'boolean', default: false })
  mfa_enabled!: boolean;

  @Column({ type: 'text', nullable: true })
  totp_secret!: string | null;

  @Column({ type: 'text', nullable: true })
  totp_secret_pending!: string | null;

  @Column({ type: 'uuid', nullable: true })
  invited_by!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
