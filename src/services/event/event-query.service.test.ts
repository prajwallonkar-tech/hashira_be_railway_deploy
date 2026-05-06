import { EventQueryService } from './event-query.service';
import * as eventRepo from '../../repositories/event.repository';
import { decrypt } from '../../utils/encryption';
import { EventStatus } from '../../types/enums';
import { NotFoundError, UnprocessableError } from '../../types/errors';

jest.mock('../../repositories/event.repository');
jest.mock('../../utils/encryption', () => ({
  decrypt: jest.fn((v: string) => `decrypted:${v}`),
}));

const mockListEvents = eventRepo.listEvents as jest.Mock;
const mockFindEventById = eventRepo.findEventById as jest.Mock;
const mockDecrypt = decrypt as jest.Mock;

const ORG_ID = 'org-1';
const EVENT_ID = 'evt-1';

function makeEvent(overrides: Partial<ReturnType<typeof baseEvent>> = {}) {
  return { ...baseEvent(), ...overrides };
}

function baseEvent() {
  return {
    event_id: EVENT_ID,
    org_id: ORG_ID,
    user_id: null,
    api_key_id: 'key-1',
    idempotency_key: null,
    prompt: 'enc:prompt',
    output: 'enc:output',
    model_id: 'gpt-4o',
    workflow_id: null,
    metadata: null,
    timestamp: new Date('2026-01-01T10:00:00Z'),
    received_at: new Date('2026-01-01T10:00:01Z'),
    canonical_hash: 'abc123',
    status: EventStatus.ANCHORED,
    tx_hash: '0xdeadbeef' as string | null,
    block_number: '18000000',
    chain_id: 84532,
    anchored_at: new Date('2026-01-01T10:00:30Z'),
    anchor_error: null,
    created_at: new Date('2026-01-01T10:00:01Z'),
  };
}

const service = new EventQueryService();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EventQueryService.list', () => {
  it('returns paginated summary rows without decrypting prompt/output', async () => {
    mockListEvents.mockResolvedValue({ events: [makeEvent()], total: 1 });

    const result = await service.list({
      org_id: ORG_ID,
      page: 1,
      page_size: 20,
      sort: 'desc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('prompt');
    expect(result.data[0]).not.toHaveProperty('output');
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.has_next).toBe(false); // 1 total, page 1 of 20
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('passes filters through to the repository', async () => {
    mockListEvents.mockResolvedValue({ events: [], total: 0 });

    await service.list({
      org_id: ORG_ID,
      page: 2,
      page_size: 10,
      sort: 'asc',
      status: EventStatus.ANCHORED,
      workflow_id: 'wf-1',
    });

    expect(mockListEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        page: 2,
        page_size: 10,
        sort: 'asc',
        status: EventStatus.ANCHORED,
        workflow_id: 'wf-1',
      }),
    );
  });
});

describe('EventQueryService.getById', () => {
  it('returns full event detail with decrypted prompt and output', async () => {
    mockFindEventById.mockResolvedValue(makeEvent());

    const result = await service.getById(EVENT_ID, ORG_ID);

    expect(result.prompt).toBe('decrypted:enc:prompt');
    expect(result.output).toBe('decrypted:enc:output');
    expect(result.event_id).toBe(EVENT_ID);
  });

  it('throws NotFoundError when event does not exist', async () => {
    mockFindEventById.mockResolvedValue(null);

    await expect(service.getById(EVENT_ID, ORG_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('EventQueryService.getVerification', () => {
  it('returns verification data for an anchored event', async () => {
    mockFindEventById.mockResolvedValue(makeEvent());

    const result = await service.getVerification(EVENT_ID, ORG_ID);

    expect(result.event_id).toBe(EVENT_ID);
    expect(result.tx_hash).toBe('0xdeadbeef');
    expect(result.chain_id).toBe(84532);
    expect(result.chain_name).toBe('Base Sepolia');
    expect(result.chain_explorer_url).toBe(
      'https://sepolia.basescan.org/tx/0xdeadbeef',
    );
    expect(result.verification_status).toBe('anchored');
  });

  it('throws NotFoundError when event does not exist', async () => {
    mockFindEventById.mockResolvedValue(null);

    await expect(
      service.getVerification(EVENT_ID, ORG_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws UnprocessableError when event is not yet anchored', async () => {
    mockFindEventById.mockResolvedValue(
      makeEvent({
        status: EventStatus.ANCHORING,
        tx_hash: null as string | null,
      }),
    );

    const error = await service
      .getVerification(EVENT_ID, ORG_ID)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableError);
    expect((error as UnprocessableError).code).toBe('UNPROCESSABLE');
    expect((error as UnprocessableError).details).toEqual(
      expect.arrayContaining([
        { field: 'status', value: EventStatus.ANCHORING },
      ]),
    );
  });
});
