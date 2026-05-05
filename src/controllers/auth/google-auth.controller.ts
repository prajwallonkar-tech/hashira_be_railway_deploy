import { Request, Response, NextFunction } from 'express';
import { googleAuthService } from '../../services/auth/google-auth.service';
import { GoogleAuthBody } from '../../validators/google-auth.validator';

const SESSION_MAX_AGE_MS = 86400 * 1000;
const REFRESH_MAX_AGE_MS = 604800 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createGoogleSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/google hit');
  const { google_id_token, invitation_token } = req.body as GoogleAuthBody;
  googleAuthService
    .createGoogleSession(google_id_token, invitation_token)
    .then(({ sessionToken, refreshToken, user }) => {
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
        data: {
          user_id: user.user_id,
          email: user.email,
          role: user.role,
        },
      });
    })
    .catch((err: unknown) => next(err));
}
