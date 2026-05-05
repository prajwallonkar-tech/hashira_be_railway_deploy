import { Request, Response, NextFunction } from 'express';
import { hashSHA256 } from '../../utils/crypto';
import { markRefreshTokenUsedByHash } from '../../repositories/refresh-token.repository';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'strict' as const,
  maxAge: 0,
};

export function logout(req: Request, res: Response, next: NextFunction): void {
  console.log('POST /v1/auth/logout hit');
  const refreshToken = req.cookies?.hashira_refresh as string | undefined;

  const markUsed = refreshToken
    ? markRefreshTokenUsedByHash(hashSHA256(refreshToken))
    : Promise.resolve();

  markUsed
    .then(() => {
      res.clearCookie('hashira_session', COOKIE_CLEAR_OPTIONS);
      res.clearCookie('hashira_refresh', COOKIE_CLEAR_OPTIONS);
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { status: 'logout successful' },
      });
    })
    .catch((err: unknown) => next(err));
}
