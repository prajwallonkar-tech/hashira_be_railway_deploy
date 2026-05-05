import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
  invitation_token: z.string().optional(),
});

export type LoginBody = z.infer<typeof LoginSchema>;
