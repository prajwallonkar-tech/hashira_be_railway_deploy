import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  log_id!: string;

  @Column({ type: 'uuid' })
  actor_user_id!: string;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'uuid', nullable: true })
  target_org_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  target_user_id!: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
