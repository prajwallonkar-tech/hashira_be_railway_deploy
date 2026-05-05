import * as eventRepo from '../../repositories/event.repository';
import {
  EventIngestionService,
  setEventProcessingService,
} from './event-ingestion.service';
import type { EventProcessingService } from './event-processing.service';
import { EventStatus } from '../../types/enums';
import { Event } from '../../entities/event.entity';

jest.mock('../../repositories/event.repository');
jest.mock('../../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindEventByIdempotencyKey =
  eventRepo.findEventByIdempotencyKey as jest.MockedFunction<
    typeof eventRepo.findEventByIdempotencyKey
  >;
const mockCreateEvent = eventRepo.createEvent as jest.MockedFunction<
  typeof eventRepo.createEvent
>;

const ORG_ID = 'org-uuid-1';
const KEY_ID = 'key-uuid-1';
const EVENT_ID = 'event-uuid-1';
const TIMESTAMP_ISO = '2026-04-28T10:00:00.000Z';

const VALID_PAYLOAD = {
  prompt: 'What is the capital of France?',
  output: 'The capital of France is Paris.',
  model_id: 'gpt-4o',
  timestamp: TIMESTAMP_ISO,
};

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: EVENT_ID,
    org_id: ORG_ID,
    api_key_id: KEY_ID,
    user_id: null,
    idempotency_key: null,
    prompt: VALID_PAYLOAD.prompt,
    output: VALID_PAYLOAD.output,
    model_id: VALID_PAYLOAD.model_id,
    workflow_id: null,
    metadata: null,
    timestamp: new Date(TIMESTAMP_ISO),
    received_at: new Date(TIMESTAMP_ISO),
    canonical_hash: null,
    status: EventStatus.PROCESSING,
    tx_hash: null,
    block_number: null,
    chain_id: null,
    anchored_at: null,
    anchor_error: null,
    created_at: new Date(TIMESTAMP_ISO),
    ...overrides,
  } as Event;
}

let service: EventIngestionService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new EventIngestionService();
  setEventProcessingService(null); // reset between tests
});

describe('EventIngestionService.ingest', () => {
  it('creates a new event and returns 202-shaped result for a valid submission', async () => {
    mockCreateEvent.mockResolvedValue(makeEvent());

    const result = await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: null,
    });

    expect(result.event_id).toBe(EVENT_ID);
    expect(result.status).toBe(EventStatus.PROCESSING);
    expect(result.idempotent_replay).toBe(false);
    expect(mockFindEventByIdempotencyKey).not.toHaveBeenCalled();
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        api_key_id: KEY_ID,
        user_id: null,
        prompt: VALID_PAYLOAD.prompt,
        output: VALID_PAYLOAD.output,
        model_id: VALID_PAYLOAD.model_id,
        workflow_id: null,
        metadata: null,
        idempotency_key: null,
      }),
    );
  });

  it('persists optional workflow_id and metadata when supplied', async () => {
    mockCreateEvent.mockResolvedValue(makeEvent());

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: {
        ...VALID_PAYLOAD,
        workflow_id: 'wf-123',
        metadata: { source: 'unit-test' },
      },
      idempotency_key: null,
    });

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: 'wf-123',
        metadata: { source: 'unit-test' },
      }),
    );
  });

  it('returns the existing event when idempotency key matches a prior submission', async () => {
    const existing = makeEvent({ idempotency_key: 'idem-1' });
    mockFindEventByIdempotencyKey.mockResolvedValue(existing);

    const result = await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: 'idem-1',
    });

    expect(result).toMatchObject({
      event_id: EVENT_ID,
      status: EventStatus.PROCESSING,
      idempotent_replay: true,
    });
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('creates a new event when idempotency key is provided but no prior event matches', async () => {
    mockFindEventByIdempotencyKey.mockResolvedValue(null);
    mockCreateEvent.mockResolvedValue(
      makeEvent({ idempotency_key: 'idem-new' }),
    );

    const result = await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: 'idem-new',
    });

    expect(result.idempotent_replay).toBe(false);
    expect(mockFindEventByIdempotencyKey).toHaveBeenCalledWith(
      ORG_ID,
      'idem-new',
    );
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: 'idem-new' }),
    );
  });

  it('stores user_id on the event when the API key is member-scoped', async () => {
    const USER_ID = 'user-uuid-1';
    mockCreateEvent.mockResolvedValue(makeEvent({ user_id: USER_ID }));

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: USER_ID,
      payload: VALID_PAYLOAD,
      idempotency_key: null,
    });

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID }),
    );
  });

  it('stores user_id: null on the event when the API key is org-level', async () => {
    mockCreateEvent.mockResolvedValue(makeEvent({ user_id: null }));

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: null,
    });

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });

  it('parses ISO timestamp into a Date when persisting', async () => {
    mockCreateEvent.mockResolvedValue(makeEvent());

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: null,
    });

    const passed = mockCreateEvent.mock.calls[0]?.[0];
    expect(passed?.timestamp).toBeInstanceOf(Date);
    expect(passed?.timestamp.toISOString()).toBe(TIMESTAMP_ISO);
  });
});

// ─── Processing dispatch ───────────────────────────────────────────────────────

describe('EventIngestionService.ingest — processing dispatch', () => {
  it('calls processing service with event_id, org_id, and payload fields after creation', async () => {
    mockCreateEvent.mockResolvedValue(makeEvent());
    const mockProcess = jest.fn().mockResolvedValue(undefined);
    setEventProcessingService({
      process: mockProcess,
    } as unknown as EventProcessingService);

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: null,
    });

    // setImmediate fires on next tick
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: EVENT_ID,
        org_id: ORG_ID,
        prompt: VALID_PAYLOAD.prompt,
        output: VALID_PAYLOAD.output,
        model_id: VALID_PAYLOAD.model_id,
      }),
    );
  });

  it('does not call processing service when none is set', async () => {
    mockCreateEvent.mockResolvedValue(makeEvent());
    const mockProcess = jest.fn();
    // processingService is null (reset in beforeEach)

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: null,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('does not call processing service on idempotent replay', async () => {
    const existing = makeEvent({ idempotency_key: 'idem-x' });
    mockFindEventByIdempotencyKey.mockResolvedValue(existing);
    const mockProcess = jest.fn();
    setEventProcessingService({
      process: mockProcess,
    } as unknown as EventProcessingService);

    await service.ingest({
      org_id: ORG_ID,
      api_key_id: KEY_ID,
      user_id: null,
      payload: VALID_PAYLOAD,
      idempotency_key: 'idem-x',
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockProcess).not.toHaveBeenCalled();
  });
});
