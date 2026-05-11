import { AppDataSource } from '../config/database';
import { Event } from '../entities/event.entity';
import { EventStatus } from '../types/enums';

export interface CreateEventInput {
  org_id: string;
  api_key_id: string | null;
  user_id: string | null;
  prompt: string;
  output: string;
  model_id: string;
  workflow_id: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
  idempotency_key: string | null;
}

export async function findEventByIdempotencyKey(
  orgId: string,
  idempotencyKey: string,
): Promise<Event | null> {
  return AppDataSource.getRepository(Event).findOne({
    where: { org_id: orgId, idempotency_key: idempotencyKey },
  });
}

export interface UpdateEventToAnchoringInput {
  event_id: string;
  org_id: string;
  canonical_hash: string;
  encrypted_prompt: string;
  encrypted_output: string;
  status: EventStatus;
}

export async function updateEventToAnchoring(
  input: UpdateEventToAnchoringInput,
): Promise<void> {
  await AppDataSource.getRepository(Event).update(
    { event_id: input.event_id, org_id: input.org_id },
    {
      canonical_hash: input.canonical_hash,
      prompt: input.encrypted_prompt,
      output: input.encrypted_output,
      status: input.status,
    },
  );
}

export interface UpdateEventToAnchoredInput {
  event_id: string;
  org_id: string;
  tx_hash: `0x${string}`;
  block_number: bigint;
  chain_id: number;
  anchored_at: Date;
  status: EventStatus.ANCHORED;
}

export async function updateEventToAnchored(
  input: UpdateEventToAnchoredInput,
): Promise<void> {
  await AppDataSource.getRepository(Event).update(
    { event_id: input.event_id, org_id: input.org_id },
    {
      tx_hash: input.tx_hash,
      block_number: input.block_number.toString(),
      chain_id: input.chain_id,
      anchored_at: input.anchored_at,
      status: input.status,
    },
  );
}

export interface UpdateEventToAnchorFailedInput {
  event_id: string;
  org_id: string;
  anchor_error: string;
}

export async function updateEventToAnchorFailed(
  input: UpdateEventToAnchorFailedInput,
): Promise<void> {
  await AppDataSource.getRepository(Event).update(
    { event_id: input.event_id, org_id: input.org_id },
    {
      status: EventStatus.ANCHOR_FAILED,
      anchor_error: input.anchor_error,
    },
  );
}

export async function createEvent(input: CreateEventInput): Promise<Event> {
  const repo = AppDataSource.getRepository(Event);
  const event = repo.create({
    org_id: input.org_id,
    api_key_id: input.api_key_id,
    user_id: input.user_id,
    prompt: input.prompt,
    output: input.output,
    model_id: input.model_id,
    workflow_id: input.workflow_id,
    metadata: input.metadata,
    timestamp: input.timestamp,
    idempotency_key: input.idempotency_key,
    canonical_hash: null,
    status: EventStatus.PROCESSING,
  });
  return repo.save(event);
}

export interface ListEventsInput {
  org_id: string;
  user_id?: string;
  page: number;
  page_size: number;
  sort: 'asc' | 'desc';
  status?: EventStatus[];
  from?: Date;
  to?: Date;
  workflow_id?: string;
  model_id?: string;
}

export interface ListEventsResult {
  events: Event[];
  total: number;
}

export async function listEvents(
  input: ListEventsInput,
): Promise<ListEventsResult> {
  const repo = AppDataSource.getRepository(Event);
  const qb = repo
    .createQueryBuilder('event')
    .where('event.org_id = :org_id', { org_id: input.org_id });

  if (input.user_id) {
    qb.andWhere('event.user_id = :user_id', { user_id: input.user_id });
  }

  if (input.status && input.status.length > 0) {
    qb.andWhere('event.status IN (:...statuses)', { statuses: input.status });
  }
  if (input.from) {
    qb.andWhere('event.created_at >= :from', { from: input.from });
  }
  if (input.to) {
    qb.andWhere('event.created_at <= :to', { to: input.to });
  }
  if (input.workflow_id) {
    qb.andWhere('event.workflow_id = :workflow_id', {
      workflow_id: input.workflow_id,
    });
  }
  if (input.model_id) {
    qb.andWhere('event.model_id = :model_id', { model_id: input.model_id });
  }

  qb.orderBy('event.created_at', input.sort === 'asc' ? 'ASC' : 'DESC')
    .skip((input.page - 1) * input.page_size)
    .take(input.page_size);

  const [events, total] = await qb.getManyAndCount();
  return { events, total };
}

export async function findEventById(
  eventId: string,
  orgId: string,
): Promise<Event | null> {
  return AppDataSource.getRepository(Event).findOne({
    where: { event_id: eventId, org_id: orgId },
  });
}
