import { createProcessor, registerWorkerListeners } from './anchoring.worker';
import type { BlockchainAnchoringService } from '../services/BlockchainAnchoringService';
import type { Job, Worker } from 'bullmq';
import type { AnchorEventJobData } from '../queues/anchor.queue';
import { logger } from '../logger';

jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const CANONICAL_HASH = 'a'.repeat(64);
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const ORG_ID = '11111111-2222-3333-4444-555555555555';

const JOB_DATA: AnchorEventJobData = {
  eventId: EVENT_ID,
  orgId: ORG_ID,
  canonicalHash: CANONICAL_HASH,
};

function makeJob(data: AnchorEventJobData = JOB_DATA): Job<AnchorEventJobData> {
  return { id: 'job-1', data } as Job<AnchorEventJobData>;
}

function makeWorker(): jest.Mocked<Pick<Worker<AnchorEventJobData>, 'on'>> {
  return { on: jest.fn() };
}

function handlerFor(
  worker: jest.Mocked<Pick<Worker<AnchorEventJobData>, 'on'>>,
  event: string,
): (...args: unknown[]) => void {
  const call = worker.on.mock.calls.find(([e]) => e === event);
  if (!call) throw new Error(`No listener registered for '${event}'`);
  return call[1] as (...args: unknown[]) => void;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── createProcessor ─────────────────────────────────────────────────────────

describe('createProcessor', () => {
  it('calls anchorEvent with snake_case fields mapped from camelCase job data', async () => {
    const mockAnchorEvent = jest.fn().mockResolvedValue(undefined);
    const service = {
      anchorEvent: mockAnchorEvent,
    } as unknown as BlockchainAnchoringService;

    const processor = createProcessor(service);
    await processor(makeJob());

    expect(mockAnchorEvent).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      org_id: ORG_ID,
      canonical_hash: CANONICAL_HASH,
    });
  });

  it('calls anchorEvent exactly once per job', async () => {
    const mockAnchorEvent = jest.fn().mockResolvedValue(undefined);
    const service = {
      anchorEvent: mockAnchorEvent,
    } as unknown as BlockchainAnchoringService;

    await createProcessor(service)(makeJob());

    expect(mockAnchorEvent).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from anchorEvent so BullMQ marks the job failed', async () => {
    const service = {
      anchorEvent: jest.fn().mockRejectedValue(new Error('rpc error')),
    } as unknown as BlockchainAnchoringService;

    await expect(createProcessor(service)(makeJob())).rejects.toThrow(
      'rpc error',
    );
  });

  it('logs worker.job.received at info level with job_id, event_id, org_id', async () => {
    const service = {
      anchorEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as BlockchainAnchoringService;

    await createProcessor(service)(makeJob());

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'worker.job.received',
        job_id: 'job-1',
        event_id: EVENT_ID,
        org_id: ORG_ID,
      }),
      expect.any(String),
    );
  });
});

// ─── registerWorkerListeners ──────────────────────────────────────────────────

describe('registerWorkerListeners', () => {
  it('registers exactly four listeners: completed, failed, stalled, error', () => {
    const worker = makeWorker();
    registerWorkerListeners(worker as unknown as Worker<AnchorEventJobData>);

    const events = worker.on.mock.calls.map(([event]) => event);
    expect(events).toContain('completed');
    expect(events).toContain('failed');
    expect(events).toContain('stalled');
    expect(events).toContain('error');
    expect(worker.on).toHaveBeenCalledTimes(4);
  });

  it('completed handler logs at info level with event_id', () => {
    const worker = makeWorker();
    registerWorkerListeners(worker as unknown as Worker<AnchorEventJobData>);

    handlerFor(
      worker,
      'completed',
    )({ id: 'job-1', data: { eventId: 'evt-abc' } });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'evt-abc' }),
      expect.any(String),
    );
  });

  it('failed handler logs at error level with event_id and error message', () => {
    const worker = makeWorker();
    registerWorkerListeners(worker as unknown as Worker<AnchorEventJobData>);

    handlerFor(worker, 'failed')(
      { id: 'job-2', data: { eventId: 'evt-xyz' } },
      new Error('tx failed'),
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'evt-xyz', error: 'tx failed' }),
      expect.any(String),
    );
  });

  it('stalled handler logs at warn level with job_id', () => {
    const worker = makeWorker();
    registerWorkerListeners(worker as unknown as Worker<AnchorEventJobData>);

    handlerFor(worker, 'stalled')('stalled-job-id');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 'stalled-job-id' }),
      expect.any(String),
    );
  });

  it('error handler logs at error level with error message', () => {
    const worker = makeWorker();
    registerWorkerListeners(worker as unknown as Worker<AnchorEventJobData>);

    handlerFor(worker, 'error')(new Error('connection lost'));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'connection lost' }),
      expect.any(String),
    );
  });
});
