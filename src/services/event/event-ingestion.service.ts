import {
  createEvent,
  findEventByIdempotencyKey,
} from '../../repositories/event.repository';
import { Event } from '../../entities/event.entity';
import { CreateEventBody } from '../../validators/event.validator';
import type { EventProcessingService } from './event-processing.service';
import { logger } from '../../logger';

let processingService: EventProcessingService | null = null;

export function setEventProcessingService(
  service: EventProcessingService | null,
): void {
  processingService = service;
}

export interface IngestEventInput {
  org_id: string;
  api_key_id: string;
  user_id: string | null;
  payload: CreateEventBody;
  idempotency_key: string | null;
}

export interface IngestEventResult {
  event_id: string;
  status: Event['status'];
  received_at: Date;
  idempotent_replay: boolean;
}

export class EventIngestionService {
  async ingest(input: IngestEventInput): Promise<IngestEventResult> {
    if (input.idempotency_key) {
      const existing = await findEventByIdempotencyKey(
        input.org_id,
        input.idempotency_key,
      );
      if (existing) {
        return {
          event_id: existing.event_id,
          status: existing.status,
          received_at: existing.received_at,
          idempotent_replay: true,
        };
      }
    }

    const event = await createEvent({
      org_id: input.org_id,
      api_key_id: input.api_key_id,
      user_id: input.user_id,
      prompt: input.payload.prompt,
      output: input.payload.output,
      model_id: input.payload.model_id,
      workflow_id: input.payload.workflow_id ?? null,
      metadata: input.payload.metadata ?? null,
      timestamp: new Date(input.payload.timestamp),
      idempotency_key: input.idempotency_key,
    });

    if (processingService) {
      const svc = processingService;
      setImmediate(() => {
        svc
          .process({
            event_id: event.event_id,
            org_id: event.org_id,
            prompt: input.payload.prompt,
            output: input.payload.output,
            model_id: input.payload.model_id,
            timestamp: event.timestamp.toISOString(),
            workflow_id: event.workflow_id ?? null,
            metadata: event.metadata,
          })
          .catch((err: unknown) => {
            logger.error(
              {
                event: 'event.processing.dispatch.failed',
                event_id: event.event_id,
                error: err instanceof Error ? err.message : String(err),
              },
              'Failed to dispatch event for processing',
            );
          });
      });
    }

    return {
      event_id: event.event_id,
      status: event.status,
      received_at: event.received_at,
      idempotent_replay: false,
    };
  }
}

export const eventIngestionService = new EventIngestionService();
