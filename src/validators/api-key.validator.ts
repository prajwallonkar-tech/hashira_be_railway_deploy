import { z } from 'zod';
import { ApiKeyPermission } from '../types/enums';

export const CreateApiKeySchema = z.object({
  permissions: z
    .array(z.nativeEnum(ApiKeyPermission))
    .min(1, 'At least one permission is required')
    .max(3, 'No more than 3 permissions allowed')
    .refine(
      (perms) => new Set(perms).size === perms.length,
      'Permissions must be unique',
    ),
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
});

export type CreateApiKeyBody = z.infer<typeof CreateApiKeySchema>;
