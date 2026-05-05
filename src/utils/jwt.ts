import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface JwtPayload {
  user_id: string;
  org_id: string | null;
  role: string;
  email: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
