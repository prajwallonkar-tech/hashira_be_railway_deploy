import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('otp_tokens')
export class OtpToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  email_hash!: string;

  @Column({ type: 'varchar', length: 64 })
  otp_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'boolean', default: false })
  used!: boolean;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
