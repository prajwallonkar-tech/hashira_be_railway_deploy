import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { EventStatus } from '../types/enums';

@Entity('events')
@Index('events_org_idempotency_uniq', ['org_id', 'idempotency_key'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
export class Event {
  @PrimaryGeneratedColumn('uuid')
  event_id!: string;

  @Column({ type: 'uuid' })
  org_id!: string;

  @Column({ type: 'uuid', nullable: true })
  user_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  api_key_id!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotency_key!: string | null;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'text' })
  output!: string;

  @Column({ type: 'varchar', length: 100 })
  model_id!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  workflow_id!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  received_at!: Date;

  @Column({ type: 'char', length: 64, nullable: true })
  canonical_hash!: string | null;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.PROCESSING,
  })
  status!: EventStatus;

  @Column({ type: 'varchar', length: 66, nullable: true })
  tx_hash!: string | null;

  @Column({ type: 'bigint', nullable: true })
  block_number!: string | null;

  @Column({ type: 'integer', nullable: true })
  chain_id!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  anchored_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  anchor_error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
