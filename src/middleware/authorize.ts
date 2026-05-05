import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/enums';
import { ForbiddenError } from '../types/errors';

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      next(new ForbiddenError('No authenticated user', 'INSUFFICIENT_ROLE'));
      return;
    }

    if (!roles.includes(user.role)) {
      next(
        new ForbiddenError(
          'Insufficient role for this action',
          'INSUFFICIENT_ROLE',
        ),
      );
      return;
    }

    next();
  };
}
