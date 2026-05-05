import type { Queue } from 'bullmq';
import { CanonicalisationService } from '../CanonicalisationService';
import { encrypt } from '../../utils/encryption';
import { updateEventToAnchoring } from '../../repositories/event.repository';
import { EventStatus } from '../../types/enums';
import type { AnchorEventJobData } from '../../queues/anchor.queue';
import { logger } from '../../logger';

export interface ProcessableEvent {
  event_id: string;
  org_id: string;
  prompt: string;
  output: string;
  model_id: string;
  timestamp: string;
  workflow_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProcessedEvent {
  event_id: string;
  org_id: string;
  canonical_hash: string;
  status: EventStatus.ANCHORING;
}

export class EventProcessingService {
  private readonly canonicalisationService = new CanonicalisationService();

  constructor(private readonly anchorQueue: Queue<AnchorEventJobData>) {}

  async process(event: ProcessableEvent): Promise<ProcessedEvent> {
    const startMs = Date.now();

    logger.info(
      {
        event: 'event.processing',
        event_id: event.event_id,
        org_id: event.org_id,
      },
      'Processing event for anchoring',
    );

    const canonicalString = this.canonicalisationService.canonicalise(event);
    const canonical_hash = this.canonicalisationService.hash(canonicalString);

    const encrypted_prompt = encrypt(event.prompt);
    const encrypted_output = encrypt(event.output);

    await updateEventToAnchoring({
      event_id: event.event_id,
      org_id: event.org_id,
      canonical_hash,
      encrypted_prompt,
      encrypted_output,
      status: EventStatus.ANCHORING,
    });

    await this.anchorQueue.add('anchor-event', {
      eventId: event.event_id,
      orgId: event.org_id,
      canonicalHash: canonical_hash,
    });

    logger.info(
      {
        event: 'event.queued',
        event_id: event.event_id,
        org_id: event.org_id,
        canonical_hash,
        duration_ms: Date.now() - startMs,
      },
      'Event queued for anchoring',
    );

    return {
      event_id: event.event_id,
      org_id: event.org_id,
      canonical_hash,
      status: EventStatus.ANCHORING,
    };
  }
}
