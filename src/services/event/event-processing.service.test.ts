import * as eventRepo from '../../repositories/event.repository';
import * as encryptionUtils from '../../utils/encryption';
import { EventProcessingService } from './event-processing.service';
import { EventStatus } from '../../types/enums';
import type { Queue } from 'bullmq';
import type { AnchorEventJobData } from '../../queues/anchor.queue';
import { logger } from '../../logger';

jest.mock('../../repositories/event.repository');
jest.mock('../../utils/encryption');
jest.mock('../../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const mockUpdateEventToAnchoring =
  eventRepo.updateEventToAnchoring as jest.MockedFunction<
    typeof eventRepo.updateEventToAnchoring
  >;
const mockCreateEvent = eventRepo.createEvent as jest.MockedFunction<
  typeof eventRepo.createEvent
>;

let mockAnchorQueueAdd: jest.Mock;
let mockAnchorQueue: Queue<AnchorEventJobData>;
const mockEncrypt = encryptionUtils.encrypt as jest.MockedFunction<
  typeof encryptionUtils.encrypt
>;

const ORG_ID = 'org-uuid-1';
const EVENT_ID = 'event-uuid-1';

const PROCESSABLE_EVENT = {
  event_id: EVENT_ID,
  org_id: ORG_ID,
  prompt: 'What is the capital of France?',
  output: 'Paris.',
  model_id: 'gpt-4o',
  timestamp: '2026-04-28T10:00:00.000Z',
};

let service: EventProcessingService;

beforeEach(() => {
  jest.clearAllMocks();
  mockAnchorQueueAdd = jest.fn().mockResolvedValue(undefined);
  mockAnchorQueue = {
    add: mockAnchorQueueAdd,
  } as unknown as Queue<AnchorEventJobData>;
  service = new EventProcessingService(mockAnchorQueue);
  mockUpdateEventToAnchoring.mockResolvedValue(undefined);
  mockEncrypt.mockImplementation((plaintext) => `enc:${plaintext}`);
});

describe('EventProcessingService.process', () => {
  it('returns a result with a 64-char hex canonical_hash and status anchoring', async () => {
    const result = await service.process(PROCESSABLE_EVENT);

    expect(result.canonical_hash).toHaveLength(64);
    expect(result.canonical_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.status).toBe(EventStatus.ANCHORING);
    expect(result.event_id).toBe(EVENT_ID);
    expect(result.org_id).toBe(ORG_ID);
  });

  it('calls updateEventToAnchoring — never createEvent', async () => {
    await service.process(PROCESSABLE_EVENT);

    expect(mockUpdateEventToAnchoring).toHaveBeenCalledTimes(1);
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('persists encrypted prompt and output (not plaintext)', async () => {
    await service.process(PROCESSABLE_EVENT);

    const call = mockUpdateEventToAnchoring.mock.calls[0][0];
    expect(call.encrypted_prompt).toBe(`enc:${PROCESSABLE_EVENT.prompt}`);
    expect(call.encrypted_output).toBe(`enc:${PROCESSABLE_EVENT.output}`);
    // Plaintext must NOT reach the DB
    expect(call.encrypted_prompt).not.toBe(PROCESSABLE_EVENT.prompt);
    expect(call.encrypted_output).not.toBe(PROCESSABLE_EVENT.output);
  });

  it('persists canonical_hash and status anchoring to the DB', async () => {
    await service.process(PROCESSABLE_EVENT);

    const call = mockUpdateEventToAnchoring.mock.calls[0][0];
    expect(call.canonical_hash).toHaveLength(64);
    expect(call.canonical_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.status).toBe(EventStatus.ANCHORING);
  });

  it('scopes the DB update with org_id (mandatory isolation)', async () => {
    await service.process(PROCESSABLE_EVENT);

    const call = mockUpdateEventToAnchoring.mock.calls[0][0];
    expect(call.org_id).toBe(ORG_ID);
    expect(call.event_id).toBe(EVENT_ID);
  });

  it('hashes from plaintext BEFORE encrypting — hash is deterministic', async () => {
    const result1 = await service.process(PROCESSABLE_EVENT);
    const result2 = await service.process(PROCESSABLE_EVENT);

    // Same plaintext → same canonical_hash regardless of random IV in encrypt
    expect(result1.canonical_hash).toBe(result2.canonical_hash);
  });

  it('encrypts prompt and output with the plaintext values (hash-then-encrypt order)', async () => {
    await service.process(PROCESSABLE_EVENT);

    // encrypt must be called with the original plaintext, not the hash
    expect(mockEncrypt).toHaveBeenCalledWith(PROCESSABLE_EVENT.prompt);
    expect(mockEncrypt).toHaveBeenCalledWith(PROCESSABLE_EVENT.output);
  });

  it('propagates repository errors', async () => {
    mockUpdateEventToAnchoring.mockRejectedValue(new Error('DB failure'));

    await expect(service.process(PROCESSABLE_EVENT)).rejects.toThrow(
      'DB failure',
    );
  });

  it('enqueues anchor job with correct payload after DB update', async () => {
    const result = await service.process(PROCESSABLE_EVENT);

    expect(mockAnchorQueueAdd).toHaveBeenCalledWith('anchor-event', {
      eventId: EVENT_ID,
      orgId: ORG_ID,
      canonicalHash: result.canonical_hash,
    });
  });

  it('enqueues anchor job after updateEventToAnchoring (not before)', async () => {
    const callOrder: string[] = [];
    mockUpdateEventToAnchoring.mockImplementation(() => {
      callOrder.push('db');
      return Promise.resolve();
    });
    mockAnchorQueueAdd.mockImplementation(() => {
      callOrder.push('queue');
      return Promise.resolve();
    });

    await service.process(PROCESSABLE_EVENT);

    expect(callOrder).toEqual(['db', 'queue']);
  });

  it('includes optional workflow_id and metadata in canonicalisation', async () => {
    const withOptionals = {
      ...PROCESSABLE_EVENT,
      workflow_id: 'wf-test',
      metadata: { source: 'unit-test' },
    };
    const withoutOptionals = { ...PROCESSABLE_EVENT };

    const result1 = await service.process(withOptionals);
    const result2 = await service.process(withoutOptionals);

    // Different inputs → different hashes
    expect(result1.canonical_hash).not.toBe(result2.canonical_hash);
  });
});

// ─── Logging ──────────────────────────────────────────────────────────────────

describe('EventProcessingService.process logging', () => {
  it('logs event.processing at info level with event_id and org_id at start', async () => {
    await service.process(PROCESSABLE_EVENT);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'event.processing',
        event_id: EVENT_ID,
        org_id: ORG_ID,
      }),
      expect.any(String),
    );
  });

  it('logs event.queued at info level with canonical_hash and duration_ms on success', async () => {
    await service.process(PROCESSABLE_EVENT);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'event.queued',
        event_id: EVENT_ID,
        org_id: ORG_ID,
        canonical_hash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
        duration_ms: expect.any(Number) as number,
      }),
      expect.any(String),
    );
  });

  it('does not log prompt or output plaintext (no sensitive data)', async () => {
    await service.process(PROCESSABLE_EVENT);

    const allLogCalls = [
      ...mockLogger.info.mock.calls,
      ...mockLogger.warn.mock.calls,
      ...mockLogger.error.mock.calls,
    ]
      .flat()
      .map((arg) => JSON.stringify(arg))
      .join(' ');

    expect(allLogCalls).not.toContain(PROCESSABLE_EVENT.prompt);
    expect(allLogCalls).not.toContain(PROCESSABLE_EVENT.output);
  });
});
