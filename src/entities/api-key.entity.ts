import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ApiKeyPermission, ApiKeyStatus } from '../types/enums';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  key_id!: string;

  @Column({ type: 'uuid' })
  org_id!: string;

  @Column({ type: 'uuid', nullable: true })
  user_id!: string | null;

  @Column({ type: 'char', length: 64, unique: true })
  key_hash!: string;

  @Column({ type: 'varchar', length: 10 })
  key_prefix!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({
    type: 'enum',
    enum: ApiKeyStatus,
    default: ApiKeyStatus.ACTIVE,
  })
  status!: ApiKeyStatus;

  @Column({ type: 'text', array: true, default: () => "'{events:write}'" })
  permissions!: ApiKeyPermission[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at!: Date | null;
}
