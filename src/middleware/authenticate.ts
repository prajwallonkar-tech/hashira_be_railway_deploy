import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { Organisation } from '../entities/organisation.entity';
import { UserRole, UserStatus, OrgStatus } from '../types/enums';
import { AuthError, ForbiddenError } from '../types/errors';

export interface AuthUser {
  user_id: string;
  org_id: string | null;
  role: UserRole;
  email: string;
}

interface JwtPayload {
  user_id: string;
  org_id: string | null;
  role: UserRole;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.hashira_session as string | undefined;

  if (!token) {
    next(new AuthError('Authentication required', 'UNAUTHORIZED'));
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    next(new AuthError('Invalid or expired token', 'UNAUTHORIZED'));
    return;
  }

  const userRepo = AppDataSource.getRepository(User);

  userRepo
    .findOne({ where: { user_id: payload.user_id } })
    .then((user) => {
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new AuthError('User account is not active', 'UNAUTHORIZED');
      }

      if (!user.org_id) {
        req.user = {
          user_id: user.user_id,
          org_id: user.org_id,
          role: user.role,
          email: user.email,
        };
        next();
        return;
      }

      const orgRepo = AppDataSource.getRepository(Organisation);
      return orgRepo.findOne({ where: { org_id: user.org_id } }).then((org) => {
        if (org?.status === OrgStatus.SUSPENDED) {
          const url = req.originalUrl.split('?')[0];
          const isGetMe = req.method === 'GET' && url === '/v1/me';
          const isLogout = req.method === 'POST' && url === '/v1/auth/logout';

          if (!isGetMe && !isLogout) {
            throw new ForbiddenError(
              'Organisation is suspended',
              'ORG_SUSPENDED',
            );
          }
        }

        req.user = {
          user_id: user.user_id,
          org_id: user.org_id,
          role: user.role,
          email: user.email,
        };
        next();
      });
    })
    .catch((err: unknown) => next(err));
}
