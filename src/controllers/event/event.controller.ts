import { Request, Response, NextFunction } from 'express';
import { eventIngestionService } from '../../services/event/event-ingestion.service';
import { CreateEventBody } from '../../validators/event.validator';
import { AuthError, ValidationError } from '../../types/errors';

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export function createEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.apiKey;
  if (!apiKey) {
    next(new AuthError('API key required', 'API_KEY_REQUIRED'));
    return;
  }

  const rawIdempotencyKey = req.header(IDEMPOTENCY_HEADER);
  const idempotencyKey =
    rawIdempotencyKey && rawIdempotencyKey.trim().length > 0
      ? rawIdempotencyKey.trim()
      : null;

  if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    next(
      new ValidationError('Idempotency key too long', 'VALIDATION_ERROR', [
        {
          field: IDEMPOTENCY_HEADER,
          message: `must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
        },
      ]),
    );
    return;
  }

  const body = req.body as CreateEventBody;

  eventIngestionService
    .ingest({
      org_id: apiKey.org_id,
      api_key_id: apiKey.key_id,
      user_id: apiKey.user_id ?? null,
      payload: body,
      idempotency_key: idempotencyKey,
    })
    .then((result) => {
      res.status(202).json({
        success: true,
        statusCode: 202,
        data: {
          event_id: result.event_id,
          status: result.status,
          received_at: result.received_at,
          idempotent_replay: result.idempotent_replay,
        },
      });
    })
    .catch((err: unknown) => next(err));
}
