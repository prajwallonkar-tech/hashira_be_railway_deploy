import { Request, Response, NextFunction } from 'express';
import { rotateRefreshToken } from '../../services/auth/refresh.service';
import { AuthError } from '../../types/errors';

const SESSION_MAX_AGE_MS = 86400 * 1000;
const REFRESH_MAX_AGE_MS = 604800 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function refresh(req: Request, res: Response, next: NextFunction): void {
  console.log('POST /v1/auth/refresh hit');
  const rawToken = req.cookies?.hashira_refresh as string | undefined;

  if (!rawToken) {
    next(new AuthError('Refresh token missing', 'UNAUTHORIZED'));
    return;
  }

  rotateRefreshToken(rawToken)
    .then(({ sessionToken, refreshToken }) => {
      res.cookie('hashira_session', sessionToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        maxAge: SESSION_MAX_AGE_MS,
      });
      res.cookie('hashira_refresh', refreshToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        maxAge: REFRESH_MAX_AGE_MS,
      });
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { refreshed: true },
      });
    })
    .catch((err: unknown) => next(err));
}
