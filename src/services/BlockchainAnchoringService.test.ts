import { BlockchainAnchoringService } from './BlockchainAnchoringService';
import type { BlockchainConfig } from '../config/blockchain.config';
import { EventStatus } from '../types/enums';

// withExponentialBackoff is a pass-through in service tests — retry logic
// is tested independently in withExponentialBackoff.test.ts
jest.mock('../utils/withExponentialBackoff', () => ({
  withExponentialBackoff: jest.fn(<T>(fn: () => Promise<T>) => fn()),
}));

jest.mock('../repositories/event.repository', () => ({
  updateEventToAnchored: jest.fn(),
  updateEventToAnchorFailed: jest.fn(),
}));

jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { withExponentialBackoff } from '../utils/withExponentialBackoff';
import {
  updateEventToAnchored,
  updateEventToAnchorFailed,
} from '../repositories/event.repository';
import { logger } from '../logger';

const mockWithExponentialBackoff =
  withExponentialBackoff as jest.MockedFunction<typeof withExponentialBackoff>;
const mockUpdateEventToAnchored = updateEventToAnchored as jest.MockedFunction<
  typeof updateEventToAnchored
>;
const mockUpdateEventToAnchorFailed =
  updateEventToAnchorFailed as jest.MockedFunction<
    typeof updateEventToAnchorFailed
  >;
const mockLogger = logger as jest.Mocked<typeof logger>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_CONFIG: BlockchainConfig = {
  rpcUrl: 'http://localhost:8545',
  contractAddress: '0x1234567890123456789012345678901234567890',
  chainId: 84532,
  confirmationDepth: 3,
};

const TEST_CANONICAL_HASH = 'a'.repeat(64);
const TEST_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_ORG_ID = '11111111-2222-3333-4444-555555555555';
const TEST_TX_HASH: `0x${string}` = `0x${'f'.repeat(64)}`;
const TEST_BLOCK_NUMBER = 12345n;
const TEST_RECEIPT = {
  transactionHash: TEST_TX_HASH,
  blockNumber: TEST_BLOCK_NUMBER,
  status: 'success' as const,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockWriteContract: jest.Mock;
let mockWaitForTransactionReceipt: jest.Mock;
let service: BlockchainAnchoringService;

beforeEach(() => {
  jest.clearAllMocks();

  mockWriteContract = jest.fn().mockResolvedValue(TEST_TX_HASH);
  mockWaitForTransactionReceipt = jest.fn().mockResolvedValue(TEST_RECEIPT);

  mockUpdateEventToAnchored.mockResolvedValue(undefined);
  mockUpdateEventToAnchorFailed.mockResolvedValue(undefined);

  mockWithExponentialBackoff.mockImplementation(<T>(fn: () => Promise<T>) =>
    fn(),
  );

  service = new BlockchainAnchoringService(
    { writeContract: mockWriteContract } as never,
    { waitForTransactionReceipt: mockWaitForTransactionReceipt } as never,
    TEST_CONFIG,
  );
});

// ─── encodeCanonicalHash ──────────────────────────────────────────────────────

describe('encodeCanonicalHash', () => {
  it('prepends 0x to the 64-char hash', () => {
    expect(service.encodeCanonicalHash(TEST_CANONICAL_HASH)).toBe(
      `0x${TEST_CANONICAL_HASH}`,
    );
  });

  it('returns a 66-char 0x-prefixed lowercase hex string', () => {
    expect(service.encodeCanonicalHash(TEST_CANONICAL_HASH)).toMatch(
      /^0x[0-9a-f]{64}$/,
    );
  });
});

// ─── encodeEventId ────────────────────────────────────────────────────────────

describe('encodeEventId', () => {
  it('strips UUID dashes and left-pads to 32 bytes', () => {
    const stripped = '550e8400e29b41d4a716446655440000';
    const expected: `0x${string}` = `0x${stripped.padStart(64, '0')}`;
    expect(service.encodeEventId(TEST_EVENT_ID)).toBe(expected);
  });

  it('returns a 66-char 0x-prefixed bytes32 string', () => {
    expect(service.encodeEventId(TEST_EVENT_ID)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ─── anchorEvent ──────────────────────────────────────────────────────────────

describe('anchorEvent', () => {
  const INPUT = {
    event_id: TEST_EVENT_ID,
    org_id: TEST_ORG_ID,
    canonical_hash: TEST_CANONICAL_HASH,
  };

  it('calls writeContract with the configured contract address and anchorHash', async () => {
    await service.anchorEvent(INPUT);

    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TEST_CONFIG.contractAddress,
        functionName: 'anchorHash',
      }),
    );
  });

  it('passes encoded canonical hash and event ID as args', async () => {
    await service.anchorEvent(INPUT);

    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          service.encodeCanonicalHash(TEST_CANONICAL_HASH),
          service.encodeEventId(TEST_EVENT_ID),
        ],
      }),
    );
  });

  it('waits for receipt with the configured confirmation depth', async () => {
    await service.anchorEvent(INPUT);

    expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: TEST_TX_HASH,
        confirmations: TEST_CONFIG.confirmationDepth,
      }),
    );
  });

  it('updates the event to anchored with tx metadata and ANCHORED status', async () => {
    await service.anchorEvent(INPUT);

    expect(mockUpdateEventToAnchored).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: TEST_EVENT_ID,
        org_id: TEST_ORG_ID,
        tx_hash: TEST_TX_HASH,
        block_number: TEST_BLOCK_NUMBER,
        chain_id: TEST_CONFIG.chainId,
        anchored_at: expect.any(Date) as Date,
        status: EventStatus.ANCHORED,
      }),
    );
  });

  it('calls updateEventToAnchorFailed with org_id guard and error message on failure', async () => {
    mockWithExponentialBackoff.mockRejectedValueOnce(
      new Error('network timeout'),
    );

    await expect(service.anchorEvent(INPUT)).rejects.toThrow('network timeout');

    expect(mockUpdateEventToAnchorFailed).toHaveBeenCalledWith({
      event_id: TEST_EVENT_ID,
      org_id: TEST_ORG_ID,
      anchor_error: 'network timeout',
    });
  });

  it('re-throws the error after marking anchor_failed so the job is marked failed', async () => {
    mockWithExponentialBackoff.mockRejectedValueOnce(
      new Error('AlreadyAnchored'),
    );

    await expect(service.anchorEvent(INPUT)).rejects.toThrow('AlreadyAnchored');
  });

  it('does not call updateEventToAnchored when anchorEvent fails', async () => {
    mockWithExponentialBackoff.mockRejectedValueOnce(new Error('rpc error'));

    await expect(service.anchorEvent(INPUT)).rejects.toThrow();
    expect(mockUpdateEventToAnchored).not.toHaveBeenCalled();
  });
});

// ─── Logging ──────────────────────────────────────────────────────────────────

describe('anchorEvent logging', () => {
  const INPUT = {
    event_id: TEST_EVENT_ID,
    org_id: TEST_ORG_ID,
    canonical_hash: TEST_CANONICAL_HASH,
  };

  it('logs anchor.submit at info level before submitting the transaction', async () => {
    await service.anchorEvent(INPUT);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'anchor.submit',
        event_id: TEST_EVENT_ID,
        org_id: TEST_ORG_ID,
      }),
      expect.any(String),
    );
  });

  it('logs anchor.confirmed at info level with tx_hash, block_number, duration_ms on success', async () => {
    await service.anchorEvent(INPUT);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'anchor.confirmed',
        event_id: TEST_EVENT_ID,
        org_id: TEST_ORG_ID,
        tx_hash: TEST_TX_HASH,
        block_number: TEST_BLOCK_NUMBER.toString(),
        chain_id: TEST_CONFIG.chainId,
        duration_ms: expect.any(Number) as number,
      }),
      expect.any(String),
    );
  });

  it('logs anchor.failed at error level with error message on failure', async () => {
    mockWithExponentialBackoff.mockRejectedValueOnce(
      new Error('network timeout'),
    );

    await expect(service.anchorEvent(INPUT)).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'anchor.failed',
        event_id: TEST_EVENT_ID,
        org_id: TEST_ORG_ID,
        error: 'network timeout',
      }),
      expect.any(String),
    );
  });
});
