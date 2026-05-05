import { z } from 'zod';

export const CreateOrgSchema = z
  .object({
    org_name: z
      .string()
      .min(2, { message: 'Organisation name must be at least 2 characters' })
      .max(100, {
        message: 'Organisation name must be at most 100 characters',
      }),
    admin_email: z
      .string()
      .email({ message: 'Invalid email format' })
      .optional(),
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters' })
      .optional(),
    google_id_token: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasEmailPath =
      data.admin_email !== undefined && data.password !== undefined;
    const hasGooglePath = data.google_id_token !== undefined;

    if (!hasEmailPath && !hasGooglePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either admin_email + password or google_id_token is required',
      });
      return;
    }

    if (hasEmailPath && hasGooglePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'admin_email + password and google_id_token are mutually exclusive',
      });
    }
  });

export type CreateOrgBody = z.infer<typeof CreateOrgSchema>;
