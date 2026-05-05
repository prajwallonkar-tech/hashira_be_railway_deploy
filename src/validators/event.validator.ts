import { z } from 'zod';

const MAX_PROMPT_LENGTH = 100_000;
const MAX_OUTPUT_LENGTH = 100_000;
const MAX_MODEL_LENGTH = 100;
const MAX_WORKFLOW_ID_LENGTH = 200;

export const CreateEventSchema = z.object({
  prompt: z
    .string({ required_error: 'prompt is required' })
    .min(1, { message: 'prompt must not be empty' })
    .max(MAX_PROMPT_LENGTH, {
      message: `prompt must be at most ${MAX_PROMPT_LENGTH} characters`,
    }),
  output: z
    .string({ required_error: 'output is required' })
    .min(1, { message: 'output must not be empty' })
    .max(MAX_OUTPUT_LENGTH, {
      message: `output must be at most ${MAX_OUTPUT_LENGTH} characters`,
    }),
  model_id: z
    .string({ required_error: 'model_id is required' })
    .min(1, { message: 'model_id must not be empty' })
    .max(MAX_MODEL_LENGTH, {
      message: `model_id must be at most ${MAX_MODEL_LENGTH} characters`,
    }),
  timestamp: z.string({ required_error: 'timestamp is required' }).datetime({
    message: 'timestamp must be an ISO 8601 datetime string',
    offset: true,
  }),
  workflow_id: z
    .string()
    .max(MAX_WORKFLOW_ID_LENGTH, {
      message: `workflow_id must be at most ${MAX_WORKFLOW_ID_LENGTH} characters`,
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateEventBody = z.infer<typeof CreateEventSchema>;
