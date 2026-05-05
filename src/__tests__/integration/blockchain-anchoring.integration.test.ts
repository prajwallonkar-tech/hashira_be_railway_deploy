/**
 * End-to-end integration test for the blockchain anchoring pipeline.
 *
 * Requires real infrastructure:
 *   - PostgreSQL (DATABASE_URL)
 *   - Redis (REDIS_URL)
 *   - Base Sepolia RPC (QUICKNODE_RPC_URL)
 *   - Deployed contract (ANCHOR_CONTRACT_ADDRESS)
 *   - Signing wallet (SIGNING_PRIVATE_KEY)
 *
 * Run with:  npm run test:integration
 * Skip in CI unit runs via testPathIgnorePatterns.
 */

// Set before any module import reads it (lazy inside encrypt(), but set early for safety)
process.env.EVENT_ENCRYPTION_KEY = Buffer.alloc(32, 0x61).toString('base64');

import 'reflect-metadata';
import request from 'supertest';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Queue, Worker } from 'bullmq';
import type IORedis from 'ioredis';

import { app, setAnchorQueue } from '../../app';
import { AppDataSource } from '../../config/database';
import { Organisation } from '../../entities/organisation.entity';
import { ApiKey } from '../../entities/api-key.entity';
import { Event } from '../../entities/event.entity';
import {
  OrgStatus,
  ApiKeyStatus,
  ApiKeyPermission,
  EventStatus,
  SubscriptionStatus,
} from '../../types/enums';
import { hashSHA256 } from '../../utils/crypto';
import {
  createRedisConnection,
  createAnchorQueue,
  createAnchorWorker,
} from '../../queues/anchor.queue';
import type { AnchorEventJobData } from '../../queues/anchor.queue';
import { BlockchainAnchoringService } from '../../services/BlockchainAnchoringService';
import { EventProcessingService } from '../../services/event/event-processing.service';
import { setEventProcessingService } from '../../services/event/event-ingestion.service';
import {
  createProcessor,
  registerWorkerListeners,
} from '../../workers/anchoring.worker';
import {
  createBlockchainConfig,
  createBlockchainWalletClient,
  createBlockchainPublicClient,
} from '../../config/blockchain.config';
import HashiraAnchorRegistryAbi from '../../abi/HashiraAnchorRegistry.json';

// ─── constants ────────────────────────────────────────────────────────────────

const PLAINTEXT_API_KEY = 'hshk_integration_test_key_abc12345';
const TEST_ORG_NAME = '__integration_test_anchoring__';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function pollUntilStatus(
  eventId: string,
  orgId: string,
  targetStatus: EventStatus,
  timeoutMs: number,
): Promise<Event> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await AppDataSource.getRepository(Event).findOne({
      where: { event_id: eventId, org_id: orgId },
    });
    if (row && row.status === targetStatus) return row;
    await new Promise<void>((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Event ${eventId} did not reach status ${targetStatus} within ${timeoutMs}ms`,
  );
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('blockchain anchoring pipeline (integration)', () => {
  let orgId: string;
  let redis: IORedis;
  let anchorQueue: Queue<AnchorEventJobData>;
  let anchorWorker: Worker<AnchorEventJobData>;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    jest.setTimeout(120_000);

    await AppDataSource.initialize();

    // Seed organisation (ACTIVE so API key validation passes)
    const orgRepo = AppDataSource.getRepository(Organisation);
    const org = orgRepo.create({
      name: TEST_ORG_NAME,
      status: OrgStatus.ACTIVE,
      subscription_status: SubscriptionStatus.ACTIVE,
      user_limit: 5,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
    const savedOrg = await orgRepo.save(org);
    orgId = savedOrg.org_id;

    // Seed API key
    const keyRepo = AppDataSource.getRepository(ApiKey);
    const apiKey = keyRepo.create({
      org_id: orgId,
      key_hash: hashSHA256(PLAINTEXT_API_KEY),
      key_prefix: PLAINTEXT_API_KEY.slice(0, 8),
      status: ApiKeyStatus.ACTIVE,
      permissions: [ApiKeyPermission.EVENTS_WRITE],
    });
    await keyRepo.save(apiKey);

    // Bootstrap queue + good worker (real testnet)
    redis = createRedisConnection(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
    );
    anchorQueue = createAnchorQueue(redis);

    const blockchainConfig = createBlockchainConfig();
    const walletClient = createBlockchainWalletClient(blockchainConfig);
    const publicClient = createBlockchainPublicClient(blockchainConfig);
    const anchoringService = new BlockchainAnchoringService(
      walletClient as never,
      publicClient as never,
      blockchainConfig,
    );
    const processor = createProcessor(anchoringService);
    anchorWorker = createAnchorWorker(redis, processor);
    registerWorkerListeners(anchorWorker);

    setAnchorQueue(anchorQueue);
    setEventProcessingService(new EventProcessingService(anchorQueue));
  }, 30_000);

  afterAll(async () => {
    setEventProcessingService(null);
    setAnchorQueue(null);

    if (AppDataSource.isInitialized) {
      // Delete test data in dependency order
      if (createdEventIds.length) {
        await AppDataSource.getRepository(Event).delete({ org_id: orgId });
      }
      await AppDataSource.getRepository(ApiKey).delete({ org_id: orgId });
      await AppDataSource.getRepository(Organisation).delete({ org_id: orgId });
    }

    await anchorWorker.close().catch(() => {
      /* already closed in failure-path afterAll */
    });
    await anchorQueue.close();
    await redis.quit();
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }, 30_000);

  it('anchors an event end-to-end and records tx_hash, block_number, chain_id, anchored_at in DB', async () => {
    const res = await request(app)
      .post('/v1/events')
      .set('x-api-key', PLAINTEXT_API_KEY)
      .send({
        prompt: 'Integration test prompt',
        output: 'Integration test output',
        model_id: 'gpt-4o',
        timestamp: new Date().toISOString(),
      })
      .expect(202);

    const eventId: string = (res.body as { event_id: string }).event_id;
    createdEventIds.push(eventId);

    const event = await pollUntilStatus(
      eventId,
      orgId,
      EventStatus.ANCHORED,
      60_000,
    );

    expect(event.tx_hash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(event.block_number).not.toBeNull();
    expect(event.chain_id).toBe(84532); // Base Sepolia
    expect(event.anchored_at).toBeInstanceOf(Date);
    expect(event.canonical_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 65_000);

  it('verifies the canonical hash is recorded on-chain via verifyHash()', async () => {
    // Re-fetch the event anchored in the previous test
    const event = await AppDataSource.getRepository(Event).findOne({
      where: { org_id: orgId, status: EventStatus.ANCHORED },
      order: { anchored_at: 'DESC' },
    });
    expect(event).not.toBeNull();

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.QUICKNODE_RPC_URL),
    });

    const result = (await publicClient.readContract({
      address: process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}`,
      abi: HashiraAnchorRegistryAbi,
      functionName: 'verifyHash',
      args: [`0x${event!.canonical_hash}`],
    })) as [boolean, bigint, `0x${string}`];

    // result[0] = anchored bool
    expect(result[0]).toBe(true);
  }, 30_000);

  // ─── failure path ───────────────────────────────────────────────────────────

  describe('failure path — bad RPC', () => {
    let badWorker: Worker<AnchorEventJobData>;

    beforeAll(async () => {
      // Close the good worker so it doesn't race on failure-path jobs
      await anchorWorker.close();

      const account = privateKeyToAccount(
        `0x${process.env.SIGNING_PRIVATE_KEY}`,
      );
      const badWalletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http('http://localhost:19999'),
      });
      const badPublicClient = createPublicClient({
        chain: baseSepolia,
        transport: http('http://localhost:19999'),
      });

      const badAnchoringService = new BlockchainAnchoringService(
        badWalletClient as never,
        badPublicClient as never,
        {
          rpcUrl: 'http://localhost:19999',
          contractAddress: process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}`,
          chainId: 84532,
          confirmationDepth: 1,
        },
      );

      const badProcessor = createProcessor(badAnchoringService);
      badWorker = createAnchorWorker(redis, badProcessor);
      registerWorkerListeners(badWorker);
    }, 10_000);

    afterAll(async () => {
      await badWorker.close();
    }, 10_000);

    it('marks event as ANCHOR_FAILED and records anchor_error after all retries are exhausted', async () => {
      const res = await request(app)
        .post('/v1/events')
        .set('x-api-key', PLAINTEXT_API_KEY)
        .send({
          prompt: 'Failure path test prompt',
          output: 'Failure path test output',
          model_id: 'gpt-4o',
          timestamp: new Date().toISOString(),
        })
        .expect(202);

      const eventId: string = (res.body as { event_id: string }).event_id;
      createdEventIds.push(eventId);

      const event = await pollUntilStatus(
        eventId,
        orgId,
        EventStatus.ANCHOR_FAILED,
        30_000,
      );

      expect(event.anchor_error).toBeTruthy();
    }, 35_000);
  });
});
