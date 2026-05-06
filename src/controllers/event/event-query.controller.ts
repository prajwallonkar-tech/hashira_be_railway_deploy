import { Request, Response, NextFunction } from 'express';
import { eventQueryService } from '../../services/event/event-query.service';
import { ValidationError } from '../../types/errors';
import { EventStatus } from '../../types/enums';

const PAGE_SIZE_MAX = 100;
const VALID_SORT = new Set(['created_at:asc', 'created_at:desc']);
const VALID_STATUS = new Set<string>(Object.values(EventStatus));

export function listEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const orgId = req.apiKey!.org_id;

  const page = parseInt((req.query['page'] as string) ?? '1', 10);
  const page_size = parseInt((req.query['page_size'] as string) ?? '20', 10);
  const sortParam = (req.query['sort'] as string) ?? 'created_at:desc';
  const status = req.query['status'] as string | undefined;
  const fromStr = req.query['from'] as string | undefined;
  const toStr = req.query['to'] as string | undefined;
  const workflow_id = req.query['workflow_id'] as string | undefined;

  if (isNaN(page) || page < 1) {
    next(
      new ValidationError(
        'page must be a positive integer',
        'VALIDATION_ERROR',
      ),
    );
    return;
  }
  if (isNaN(page_size) || page_size < 1 || page_size > PAGE_SIZE_MAX) {
    next(
      new ValidationError(
        `page_size must be between 1 and ${PAGE_SIZE_MAX}`,
        'VALIDATION_ERROR',
      ),
    );
    return;
  }
  if (!VALID_SORT.has(sortParam)) {
    next(
      new ValidationError(
        'sort must be created_at:asc or created_at:desc',
        'VALIDATION_ERROR',
      ),
    );
    return;
  }
  if (status !== undefined && !VALID_STATUS.has(status)) {
    next(new ValidationError('invalid status filter', 'VALIDATION_ERROR'));
    return;
  }

  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  if (from && isNaN(from.getTime())) {
    next(
      new ValidationError(
        'from must be a valid ISO 8601 date',
        'VALIDATION_ERROR',
      ),
    );
    return;
  }
  if (to && isNaN(to.getTime())) {
    next(
      new ValidationError(
        'to must be a valid ISO 8601 date',
        'VALIDATION_ERROR',
      ),
    );
    return;
  }

  const sort = sortParam.endsWith('asc') ? 'asc' : 'desc';

  eventQueryService
    .list({
      org_id: orgId,
      page,
      page_size,
      sort,
      status: status as EventStatus | undefined,
      from,
      to,
      workflow_id,
    })
    .then((result) => {
      res.status(200).json({ success: true, statusCode: 200, ...result });
    })
    .catch((err: unknown) => next(err));
}

export function getEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const orgId = req.apiKey!.org_id;
  const eventId = req.params['event_id'];

  eventQueryService
    .getById(eventId, orgId)
    .then((data) => {
      res.status(200).json({ success: true, statusCode: 200, data });
    })
    .catch((err: unknown) => next(err));
}

export function getVerification(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const orgId = req.apiKey!.org_id;
  const eventId = req.params['event_id'];

  eventQueryService
    .getVerification(eventId, orgId)
    .then((data) => {
      res.status(200).json({ success: true, statusCode: 200, data });
    })
    .catch((err: unknown) => next(err));
}
