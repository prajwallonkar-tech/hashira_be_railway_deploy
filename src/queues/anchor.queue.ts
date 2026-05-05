import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

export interface AnchorEventJobData {
  eventId: string;
  orgId: string;
  canonicalHash: string;
}

export const ANCHOR_QUEUE_NAME = 'anchor-events';

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
  });
}

export function createAnchorQueue(
  connection: IORedis,
): Queue<AnchorEventJobData> {
  return new Queue<AnchorEventJobData>(ANCHOR_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1, // withExponentialBackoff handles retries internally
      removeOnComplete: { count: 100 }, // keep last 100 completed jobs for observability
      removeOnFail: { count: 100 }, // keep last 100 failed jobs for debugging
    },
  });
}

export function createAnchorWorker(
  connection: IORedis,
  processor: (job: Job<AnchorEventJobData>) => Promise<void>,
): Worker<AnchorEventJobData> {
  return new Worker<AnchorEventJobData>(ANCHOR_QUEUE_NAME, processor, {
    connection,
  });
}
