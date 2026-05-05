import { CreateEventSchema } from './event.validator';

const BASE = {
  prompt: 'What is the capital of France?',
  output: 'Paris.',
  model_id: 'gpt-4o',
  timestamp: '2026-04-28T10:00:00.000Z',
};

describe('CreateEventSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = CreateEventSchema.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  it('accepts a payload with optional workflow_id and metadata', () => {
    const result = CreateEventSchema.safeParse({
      ...BASE,
      workflow_id: 'wf-1',
      metadata: { user: 'alice' },
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['prompt', { ...BASE, prompt: undefined }],
    ['output', { ...BASE, output: undefined }],
    ['model_id', { ...BASE, model_id: undefined }],
    ['timestamp', { ...BASE, timestamp: undefined }],
  ])('rejects payload missing %s', (field, payload) => {
    const result = CreateEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes(field))).toBe(
        true,
      );
    }
  });

  it.each([
    ['prompt', { ...BASE, prompt: '' }],
    ['output', { ...BASE, output: '' }],
    ['model_id', { ...BASE, model_id: '' }],
  ])('rejects empty %s', (field, payload) => {
    const result = CreateEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes(field))).toBe(
        true,
      );
    }
  });

  it('rejects a non-ISO timestamp', () => {
    const result = CreateEventSchema.safeParse({
      ...BASE,
      timestamp: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects prompt longer than 100k characters', () => {
    const result = CreateEventSchema.safeParse({
      ...BASE,
      prompt: 'a'.repeat(100_001),
    });
    expect(result.success).toBe(false);
  });
});
