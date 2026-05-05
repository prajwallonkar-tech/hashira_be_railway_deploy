import type { Job, Worker } from 'bullmq';
import type { AnchorEventJobData } from '../queues/anchor.queue';
import type { BlockchainAnchoringService } from '../services/BlockchainAnchoringService';
import { logger } from '../logger';

export function createProcessor(
  service: BlockchainAnchoringService,
): (job: Job<AnchorEventJobData>) => Promise<void> {
  return async (job: Job<AnchorEventJobData>): Promise<void> => {
    logger.info(
      {
        event: 'worker.job.received',
        job_id: job.id,
        event_id: job.data.eventId,
        org_id: job.data.orgId,
      },
      'Anchor job received',
    );

    await service.anchorEvent({
      event_id: job.data.eventId,
      org_id: job.data.orgId,
      canonical_hash: job.data.canonicalHash,
    });
  };
}

export function registerWorkerListeners(
  worker: Worker<AnchorEventJobData>,
): void {
  worker.on('completed', (job) => {
    logger.info(
      {
        event: 'worker.job.completed',
        job_id: job.id,
        event_id: job.data.eventId,
      },
      'Anchor job completed',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        event: 'worker.job.failed',
        job_id: job?.id,
        event_id: job?.data.eventId,
        error: error.message,
      },
      'Anchor job failed',
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      { event: 'worker.job.stalled', job_id: jobId },
      'Anchor job stalled',
    );
  });

  worker.on('error', (error) => {
    logger.error(
      { event: 'worker.error', error: error.message },
      'Anchor worker error',
    );
  });
}
