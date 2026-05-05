import { CanonicalisationService } from './CanonicalisationService';

const service = new CanonicalisationService();

// The exact worked example from LLD §5.1
const LLD_EXAMPLE_INPUT = {
  prompt: 'Summarise the Q3 financial report for ACME Corp.',
  output: 'Q3 revenue was $4.2M, up 12% YoY.',
  model_id: 'gpt-4o',
  timestamp: '2026-04-01T10:30:00Z',
  workflow_id: 'report-summarisation-v2',
  metadata: {
    user_ref: 'analyst_007',
    tags: ['finance', 'q3'],
    session_id: 'sess_abc123',
  },
};

const LLD_EXAMPLE_CANONICAL =
  '{"metadata":{"session_id":"sess_abc123","tags":["finance","q3"],"user_ref":"analyst_007"},"model_id":"gpt-4o","output":"Q3 revenue was $4.2M, up 12% YoY.","prompt":"Summarise the Q3 financial report for ACME Corp.","timestamp":"2026-04-01T10:30:00.000Z","workflow_id":"report-summarisation-v2"}';

const MINIMAL = {
  prompt: 'What is 2+2?',
  output: '4.',
  model_id: 'gpt-4o-mini',
  timestamp: '2026-04-28T10:00:00.000Z',
};

describe('CanonicalisationService.canonicalise', () => {
  it('produces the exact canonical string from the LLD §5.1 worked example', () => {
    expect(service.canonicalise(LLD_EXAMPLE_INPUT)).toBe(LLD_EXAMPLE_CANONICAL);
  });

  it('produces identical output regardless of input key order', () => {
    const shuffled = {
      workflow_id: LLD_EXAMPLE_INPUT.workflow_id,
      timestamp: LLD_EXAMPLE_INPUT.timestamp,
      output: LLD_EXAMPLE_INPUT.output,
      metadata: LLD_EXAMPLE_INPUT.metadata,
      model_id: LLD_EXAMPLE_INPUT.model_id,
      prompt: LLD_EXAMPLE_INPUT.prompt,
    };
    expect(service.canonicalise(shuffled)).toBe(LLD_EXAMPLE_CANONICAL);
  });

  it('top-level keys are sorted alphabetically', () => {
    const result = service.canonicalise(LLD_EXAMPLE_INPUT);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });

  it('minimal payload (no optional fields) serialises only the four required fields', () => {
    const result = service.canonicalise(MINIMAL);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      'model_id',
      'output',
      'prompt',
      'timestamp',
    ]);
  });

  it('omits workflow_id when null', () => {
    const result = service.canonicalise({ ...MINIMAL, workflow_id: null });
    expect(result).not.toContain('workflow_id');
  });

  it('omits workflow_id when undefined', () => {
    const result = service.canonicalise({ ...MINIMAL, workflow_id: undefined });
    expect(result).not.toContain('workflow_id');
  });

  it('includes workflow_id when present', () => {
    const result = service.canonicalise({ ...MINIMAL, workflow_id: 'wf-1' });
    expect(JSON.parse(result)).toMatchObject({ workflow_id: 'wf-1' });
  });

  it('omits metadata when null', () => {
    const result = service.canonicalise({ ...MINIMAL, metadata: null });
    expect(result).not.toContain('metadata');
  });

  it('omits metadata when undefined', () => {
    const result = service.canonicalise({ ...MINIMAL, metadata: undefined });
    expect(result).not.toContain('metadata');
  });

  it('includes metadata when empty object (non-null)', () => {
    const result = service.canonicalise({ ...MINIMAL, metadata: {} });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed).toHaveProperty('metadata');
    expect(parsed.metadata).toEqual({});
  });

  it('normalises timestamp without milliseconds to .000Z', () => {
    const result = service.canonicalise({
      ...MINIMAL,
      timestamp: '2026-04-28T10:00:00Z',
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.timestamp).toBe('2026-04-28T10:00:00.000Z');
  });

  it('normalises timestamp with partial milliseconds to full 3 decimal places', () => {
    const result = service.canonicalise({
      ...MINIMAL,
      timestamp: '2026-04-28T10:00:00.1Z',
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.timestamp).toBe('2026-04-28T10:00:00.100Z');
  });

  it('normalises timestamp that already has full milliseconds (idempotent)', () => {
    const result = service.canonicalise({
      ...MINIMAL,
      timestamp: '2026-04-28T10:00:00.000Z',
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.timestamp).toBe('2026-04-28T10:00:00.000Z');
  });

  it('converts non-UTC timezone offset to UTC', () => {
    // +05:30 offset (IST) → UTC
    const result = service.canonicalise({
      ...MINIMAL,
      timestamp: '2026-04-28T15:30:00.000+05:30',
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.timestamp).toBe('2026-04-28T10:00:00.000Z');
  });

  it('sorts nested metadata keys alphabetically', () => {
    const result = service.canonicalise({
      ...MINIMAL,
      metadata: { z_key: 1, a_key: 2, m_key: 3 },
    });
    const parsed = JSON.parse(result) as { metadata: Record<string, unknown> };
    expect(Object.keys(parsed.metadata)).toEqual(['a_key', 'm_key', 'z_key']);
  });

  it('preserves array element order within metadata', () => {
    const result = service.canonicalise({
      ...MINIMAL,
      metadata: { tags: ['z', 'a', 'm'] },
    });
    const parsed = JSON.parse(result) as { metadata: { tags: string[] } };
    expect(parsed.metadata.tags).toEqual(['z', 'a', 'm']);
  });

  it('sorts keys within objects nested inside metadata arrays', () => {
    const result = service.canonicalise({
      ...MINIMAL,
      metadata: {
        items: [
          { z: 1, a: 2 },
          { y: 3, b: 4 },
        ],
      },
    });
    const parsed = JSON.parse(result) as {
      metadata: { items: Array<Record<string, unknown>> };
    };
    expect(Object.keys(parsed.metadata.items[0])).toEqual(['a', 'z']);
    expect(Object.keys(parsed.metadata.items[1])).toEqual(['b', 'y']);
  });

  it('produces compact JSON with no structural whitespace (no spaces after : or ,)', () => {
    const result = service.canonicalise(LLD_EXAMPLE_INPUT);
    // Structural whitespace means spaces/tabs/newlines between JSON tokens.
    // Re-stringifying without spacing must be identical to the result.
    expect(result).toBe(JSON.stringify(JSON.parse(result)));
  });

  it('is deterministic — same input always produces identical output', () => {
    const a = service.canonicalise(LLD_EXAMPLE_INPUT);
    const b = service.canonicalise(LLD_EXAMPLE_INPUT);
    expect(a).toBe(b);
  });

  it('completes in under 5ms', () => {
    const start = performance.now();
    service.canonicalise(LLD_EXAMPLE_INPUT);
    expect(performance.now() - start).toBeLessThan(5);
  });
});

describe('CanonicalisationService.hash', () => {
  it('returns a 64-character lowercase hex string', () => {
    const h = service.hash(LLD_EXAMPLE_CANONICAL);
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not include a 0x prefix', () => {
    expect(service.hash(LLD_EXAMPLE_CANONICAL)).not.toMatch(/^0x/);
  });

  it('is deterministic — same input always produces identical hash', () => {
    expect(service.hash(LLD_EXAMPLE_CANONICAL)).toBe(
      service.hash(LLD_EXAMPLE_CANONICAL),
    );
  });

  it('different canonical strings produce different hashes', () => {
    const h1 = service.hash(service.canonicalise(MINIMAL));
    const h2 = service.hash(
      service.canonicalise({ ...MINIMAL, prompt: 'Different prompt' }),
    );
    expect(h1).not.toBe(h2);
  });
});
