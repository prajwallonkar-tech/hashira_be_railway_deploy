import { Request, Response, NextFunction } from 'express';
import { eventQueryService } from '../../services/event/event-query.service';
import { findUserByEmailAndOrg } from '../../repositories/user.repository';
import { ValidationError, AuthError, ForbiddenError } from '../../types/errors';
import { EventStatus, UserRole, ApiKeyPermission } from '../../types/enums';

const PAGE_SIZE_MAX = 100;
const VALID_SORT = new Set(['created_at:asc', 'created_at:desc']);
const PUBLIC_STATUS_VALUES = [
  'processing',
  'anchoring',
  'anchored',
  'failed',
] as const;
const VALID_PUBLIC_STATUS = new Set<string>(PUBLIC_STATUS_VALUES);
const PUBLIC_TO_INTERNAL_STATUS: Record<string, EventStatus> = {
  processing: EventStatus.PROCESSING,
  anchoring: EventStatus.ANCHORING,
  anchored: EventStatus.ANCHORED,
  failed: EventStatus.ANCHOR_FAILED,
};

interface ResolvedScope {
  org_id: string;
  user_id_filter: string | undefined;
  email_filter: string | undefined;
}

function resolveListScope(req: Request): ResolvedScope {
  if (req.user) {
    if (!req.user.org_id) {
      throw new ForbiddenError(
        'User is not assigned to an organisation',
        'NO_ORG',
      );
    }
    if (req.user.role === UserRole.MEMBER) {
      return {
        org_id: req.user.org_id,
        user_id_filter: req.user.user_id,
        email_filter: undefined,
      };
    }
    // admin / super_admin: optional ?email= filter
    const queryEmail = req.query['email'] as string | undefined;
    return {
      org_id: req.user.org_id,
      user_id_filter: undefined,
      email_filter: queryEmail && queryEmail.length > 0 ? queryEmail : undefined,
    };
  }

  if (req.apiKey) {
    if (!req.apiKey.permissions.includes(ApiKeyPermission.EVENTS_READ)) {
      throw new ForbiddenError(
        'API key does not have required permission',
        'INSUFFICIENT_PERMISSIONS',
      );
    }
    return { org_id: req.apiKey.org_id, user_id_filter: undefined, email_filter: undefined };
  }

  throw new AuthError('Authentication required', 'UNAUTHORIZED');
}

function resolveDetailScope(
  req: Request,
  requiredApiKeyPermission: ApiKeyPermission,
): ResolvedScope {
  if (req.user) {
    if (!req.user.org_id) {
      throw new ForbiddenError(
        'User is not assigned to an organisation',
        'NO_ORG',
      );
    }
    return {
      org_id: req.user.org_id,
      user_id_filter:
        req.user.role === UserRole.MEMBER ? req.user.user_id : undefined,
      email_filter: undefined,
    };
  }

  if (req.apiKey) {
    if (!req.apiKey.permissions.includes(requiredApiKeyPermission)) {
      throw new ForbiddenError(
        'API key does not have required permission',
        'INSUFFICIENT_PERMISSIONS',
      );
    }
    return { org_id: req.apiKey.org_id, user_id_filter: undefined, email_filter: undefined };
  }

  throw new AuthError('Authentication required', 'UNAUTHORIZED');
}

export function listEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let scope: ResolvedScope;
  try {
    scope = resolveListScope(req);
  } catch (err) {
    next(err);
    return;
  }

  const page = parseInt((req.query['page'] as string) ?? '1', 10);
  const page_size = parseInt((req.query['page_size'] as string) ?? '20', 10);
  const sortParam = (req.query['sort'] as string) ?? 'created_at:desc';
  const statusParam = req.query['status'] as string | undefined;
  const fromStr = req.query['from'] as string | undefined;
  const toStr = req.query['to'] as string | undefined;
  const workflow_id = req.query['workflow_id'] as string | undefined;
  const model_id = req.query['model_id'] as string | undefined;

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
  let statusFilter: EventStatus[] | undefined;
  if (statusParam !== undefined) {
    const values = statusParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const v of values) {
      if (!VALID_PUBLIC_STATUS.has(v)) {
        next(
          new ValidationError(
            `invalid status filter — must be one of: ${PUBLIC_STATUS_VALUES.join(', ')}`,
            'VALIDATION_ERROR',
          ),
        );
        return;
      }
    }
    statusFilter =
      values.length > 0
        ? values.map((v) => PUBLIC_TO_INTERNAL_STATUS[v])
        : undefined;
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

  const resolveUserId = async (): Promise<string | undefined> => {
    if (scope.email_filter) {
      const user = await findUserByEmailAndOrg(scope.email_filter, scope.org_id);
      if (!user) {
        // Email doesn't match any active org member — return empty result set
        return '__no_match__';
      }
      return user.user_id;
    }
    return scope.user_id_filter;
  };

  resolveUserId()
    .then((resolvedUserId) => {
      if (resolvedUserId === '__no_match__') {
        return Promise.resolve({
          data: [],
          pagination: { page, page_size, total: 0, has_next: false },
        });
      }
      return eventQueryService.list({
        org_id: scope.org_id,
        user_id: resolvedUserId,
        page,
        page_size,
        sort,
        status: statusFilter,
        from,
        to,
        workflow_id,
        model_id,
      });
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
  let scope: ResolvedScope;
  try {
    scope = resolveDetailScope(req, ApiKeyPermission.EVENTS_READ);
  } catch (err) {
    next(err);
    return;
  }

  const eventId = req.params['event_id'];

  eventQueryService
    .getById(eventId, scope.org_id, scope.user_id_filter)
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
  let scope: ResolvedScope;
  try {
    scope = resolveDetailScope(req, ApiKeyPermission.VERIFICATION_READ);
  } catch (err) {
    next(err);
    return;
  }

  const eventId = req.params['event_id'];

  eventQueryService
    .getVerification(eventId, scope.org_id, scope.user_id_filter)
    .then((data) => {
      res.status(200).json({ success: true, statusCode: 200, data });
    })
    .catch((err: unknown) => next(err));
}
