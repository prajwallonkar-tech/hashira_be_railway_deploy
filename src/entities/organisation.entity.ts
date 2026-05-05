import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrgStatus, SubscriptionStatus } from '../types/enums';

@Entity('organisations')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  org_id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'enum', enum: OrgStatus, default: OrgStatus.PAYMENT_PENDING })
  status!: OrgStatus;

  @Column({ type: 'integer', default: 10 })
  user_limit!: number;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  stripe_customer_id!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  stripe_subscription_id!: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIALING,
  })
  subscription_status!: SubscriptionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
