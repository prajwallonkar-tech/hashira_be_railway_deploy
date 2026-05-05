import { Request, Response, NextFunction } from 'express';
import {
  setupMfa,
  confirmMfa,
  verifyMfaAtLogin,
  disableMfa,
} from '../../services/auth/mfa.service';
import { MfaCodeBody, MfaVerifyBody } from '../../validators/mfa.validator';

const SESSION_MAX_AGE_MS = 86400 * 1000;
const REFRESH_MAX_AGE_MS = 604800 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function mfaSetup(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/mfa/setup hit');
  setupMfa(req.user!.user_id)
    .then(({ totp_uri, qr_code_data_url }) => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { totp_uri, qr_code_data_url },
      });
    })
    .catch((err: unknown) => next(err));
}

export function mfaConfirm(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/mfa/confirm hit');
  const { totp_code } = req.body as MfaCodeBody;
  confirmMfa(req.user!.user_id, totp_code)
    .then(() => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { mfa_enabled: true },
      });
    })
    .catch((err: unknown) => next(err));
}

export function mfaVerify(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/mfa/verify hit');
  const { email, totp_code } = req.body as MfaVerifyBody;
  verifyMfaAtLogin(email, totp_code)
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

export function mfaDisable(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/mfa/disable hit');
  const { totp_code } = req.body as MfaCodeBody;
  disableMfa(req.user!.user_id, totp_code)
    .then(() => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { mfa_enabled: false },
      });
    })
    .catch((err: unknown) => next(err));
}
