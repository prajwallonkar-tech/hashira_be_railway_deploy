import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/enums';
import { ForbiddenError } from '../types/errors';

export function orgIdCrossCheck(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const user = req.user;

  if (!user) {
    next(new ForbiddenError('No authenticated user', 'ORG_ACCESS_DENIED'));
    return;
  }

  const paramOrgId = req.params.org_id;

  if (!paramOrgId) {
    next();
    return;
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    next();
    return;
  }

  if (user.org_id !== paramOrgId) {
    next(
      new ForbiddenError(
        'Access denied to this organisation',
        'ORG_ACCESS_DENIED',
      ),
    );
    return;
  }

  next();
}
