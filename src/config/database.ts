import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Organisation } from '../entities/organisation.entity';
import { User } from '../entities/user.entity';
import { Event } from '../entities/event.entity';
import { ApiKey } from '../entities/api-key.entity';
import { Invitation } from '../entities/invitation.entity';
import { OtpToken } from '../entities/otp-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { AuditLog } from '../entities/audit-log.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: process.env.NODE_ENV === 'development',
  logging: false,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
  entities: [
    Organisation,
    User,
    Event,
    ApiKey,
    Invitation,
    OtpToken,
    RefreshToken,
    PasswordResetToken,
    AuditLog,
  ],
  migrations: ['dist/migrations/*.js'],
});
