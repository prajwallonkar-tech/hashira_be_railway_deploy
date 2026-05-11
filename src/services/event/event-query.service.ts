import {
  listEvents,
  findEventById,
  ListEventsInput,
} from '../../repositories/event.repository';
import {
  findUsersByIds,
  findUserByIdAndOrg,
} from '../../repositories/user.repository';
import { decrypt } from '../../utils/encryption';
import { EventStatus } from '../../types/enums';
import { NotFoundError, UnprocessableError } from '../../types/errors';
import type { Event } from '../../entities/event.entity';

const CHAIN_META: Record<number, { name: string; explorerBase: string }> = {
  8453: { name: 'Base', explorerBase: 'https://basescan.org/tx' },
  84532: {
    name: 'Base Sepolia',
    explorerBase: 'https://sepolia.basescan.org/tx',
  },
};

function chainMeta(chainId: number): {
  name: string;
  explorerBase: string | null;
} {
  return (
    CHAIN_META[chainId] ?? { name: `Chain ${chainId}`, explorerBase: null }
  );
}

export type PublicEventStatus =
  | 'processing'
  | 'anchoring'
  | 'anchored'
  | 'failed';

const INTERNAL_TO_PUBLIC_STATUS: Record<EventStatus, PublicEventStatus> = {
  [EventStatus.PROCESSING]: 'processing',
  [EventStatus.ANCHORING]: 'anchoring',
  [EventStatus.ANCHORED]: 'anchored',
  [EventStatus.ANCHOR_FAILED]: 'failed',
};

function toPublicStatus(s: EventStatus): PublicEventStatus {
  return INTERNAL_TO_PUBLIC_STATUS[s];
}

export interface ListEventsQuery {
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

export interface EventSummary {
  event_id: string;
  user_id: string | null;
  email: string | null;
  model_id: string;
  workflow_id: string | null;
  status: PublicEventStatus;
  canonical_hash: string | null;
  tx_hash: string | null;
  anchored_at: Date | null;
  created_at: Date;
}

export interface EventDetail {
  event_id: string;
  org_id: string;
  user_id: string | null;
  email: string | null;
  prompt: string;
  output: string;
  model_id: string;
  workflow_id: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
  received_at: Date;
  canonical_hash: string | null;
  status: PublicEventStatus;
  tx_hash: string | null;
  block_number: string | null;
  chain_id: number | null;
  anchored_at: Date | null;
  created_at: Date;
}

export interface VerificationData {
  event_id: string;
  canonical_hash: string;
  tx_hash: string;
  block_number: string;
  chain_id: number;
  chain_name: string;
  chain_explorer_url: string | null;
  anchored_at: Date;
  verification_status: 'anchored';
}

export interface ListEventsResult {
  data: EventSummary[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    has_next: boolean;
  };
}

export class EventQueryService {
  async list(query: ListEventsQuery): Promise<ListEventsResult> {
    const input: ListEventsInput = {
      org_id: query.org_id,
      user_id: query.user_id,
      page: query.page,
      page_size: query.page_size,
      sort: query.sort,
      status: query.status,
      from: query.from,
      to: query.to,
      workflow_id: query.workflow_id,
      model_id: query.model_id,
    };

    const { events, total } = await listEvents(input);

    // Batch-fetch emails for the user_ids on this page so the response can
    // include each event's owner email alongside the user_id.
    const userIds = Array.from(
      new Set(events.map((e) => e.user_id).filter((id): id is string => !!id)),
    );
    const users = await findUsersByIds(userIds);
    const emailById = new Map(users.map((u) => [u.user_id, u.email]));

    return {
      data: events.map((e) =>
        this.toSummary(e, emailById.get(e.user_id ?? '')),
      ),
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total,
        has_next: query.page * query.page_size < total,
      },
    };
  }

  async getById(
    eventId: string,
    orgId: string,
    userId?: string,
  ): Promise<EventDetail> {
    const event = await findEventById(eventId, orgId);
    if (!event) throw new NotFoundError('Event not found');
    if (userId && event.user_id !== userId) {
      throw new NotFoundError('Event not found');
    }
    const ownerEmail = event.user_id
      ? ((await findUserByIdAndOrg(event.user_id, orgId))?.email ?? null)
      : null;
    return this.toDetail(event, ownerEmail);
  }

  async getVerification(
    eventId: string,
    orgId: string,
    userId?: string,
  ): Promise<VerificationData> {
    const event = await findEventById(eventId, orgId);
    if (!event) throw new NotFoundError('Event not found');
    if (userId && event.user_id !== userId) {
      throw new NotFoundError('Event not found');
    }

    if (
      event.status !== EventStatus.ANCHORED ||
      !event.tx_hash ||
      !event.block_number ||
      !event.chain_id ||
      !event.anchored_at ||
      !event.canonical_hash
    ) {
      throw new UnprocessableError(
        'Event is not yet anchored on-chain',
        'UNPROCESSABLE',
        [{ field: 'status', value: event.status }],
      );
    }

    const meta = chainMeta(event.chain_id);

    return {
      event_id: event.event_id,
      canonical_hash: event.canonical_hash,
      tx_hash: event.tx_hash,
      block_number: event.block_number,
      chain_id: event.chain_id,
      chain_name: meta.name,
      chain_explorer_url: meta.explorerBase
        ? `${meta.explorerBase}/${event.tx_hash}`
        : null,
      anchored_at: event.anchored_at,
      verification_status: 'anchored',
    };
  }

  private toSummary(e: Event, ownerEmail?: string | null): EventSummary {
    return {
      event_id: e.event_id,
      user_id: e.user_id,
      email: ownerEmail ?? null,
      model_id: e.model_id,
      workflow_id: e.workflow_id,
      status: toPublicStatus(e.status),
      canonical_hash: e.canonical_hash,
      tx_hash: e.tx_hash,
      anchored_at: e.anchored_at,
      created_at: e.created_at,
    };
  }

  private toDetail(e: Event, ownerEmail?: string | null): EventDetail {
    return {
      event_id: e.event_id,
      org_id: e.org_id,
      user_id: e.user_id,
      email: ownerEmail ?? null,
      prompt: decrypt(e.prompt),
      output: decrypt(e.output),
      model_id: e.model_id,
      workflow_id: e.workflow_id,
      metadata: e.metadata,
      timestamp: e.timestamp,
      received_at: e.received_at,
      canonical_hash: e.canonical_hash,
      status: toPublicStatus(e.status),
      tx_hash: e.tx_hash,
      block_number: e.block_number,
      chain_id: e.chain_id,
      anchored_at: e.anchored_at,
      created_at: e.created_at,
    };
  }
}

export const eventQueryService = new EventQueryService();
