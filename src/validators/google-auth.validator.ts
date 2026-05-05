import { z } from 'zod';

export const GoogleAuthSchema = z.object({
  google_id_token: z
    .string()
    .min(1, { message: 'Google ID token is required' }),
  invitation_token: z.string().optional(),
});

export type GoogleAuthBody = z.infer<typeof GoogleAuthSchema>;
