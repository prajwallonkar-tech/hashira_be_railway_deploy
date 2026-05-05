import { z } from 'zod';

export const OtpVerifySchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  otp: z.string().regex(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' }),
});

export type OtpVerifyBody = z.infer<typeof OtpVerifySchema>;

export const OtpResendSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
});

export type OtpResendBody = z.infer<typeof OtpResendSchema>;
