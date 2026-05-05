import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  token_hash!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'boolean', default: false })
  used!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
