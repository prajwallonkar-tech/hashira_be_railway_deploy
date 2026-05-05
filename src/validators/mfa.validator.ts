import { z } from 'zod';

export const MfaCodeSchema = z.object({
  totp_code: z.string().regex(/^\d{6}$/, {
    message: 'Authenticator code must be exactly 6 digits',
  }),
});

export const MfaVerifySchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  totp_code: z.string().regex(/^\d{6}$/, {
    message: 'Authenticator code must be exactly 6 digits',
  }),
});

export type MfaCodeBody = z.infer<typeof MfaCodeSchema>;
export type MfaVerifyBody = z.infer<typeof MfaVerifySchema>;
