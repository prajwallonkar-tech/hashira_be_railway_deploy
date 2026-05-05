import { z } from 'zod';

export const PasswordResetRequestSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
});

export const PasswordResetConfirmSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  otp: z.string().regex(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' }),
  new_password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
});

export type PasswordResetRequestBody = z.infer<
  typeof PasswordResetRequestSchema
>;
export type PasswordResetConfirmBody = z.infer<
  typeof PasswordResetConfirmSchema
>;
