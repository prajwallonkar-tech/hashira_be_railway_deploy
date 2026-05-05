import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  token_id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'char', length: 64, unique: true })
  token_hash!: string;

  @Column({ type: 'boolean', default: false })
  used!: boolean;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
