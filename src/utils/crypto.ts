import { createHash } from 'crypto';

export function hashSHA256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
