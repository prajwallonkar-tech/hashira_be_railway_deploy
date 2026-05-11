import { Request, Response, NextFunction } from 'express';
import { otpService } from '../../services/auth/otp.service';
import { OtpVerifyBody, OtpResendBody } from '../../validators/otp.validator';

const SESSION_MAX_AGE_MS = 86400 * 1000;
const REFRESH_MAX_AGE_MS = 604800 * 1000;

export function verifyOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/otp/verify hit');
  const { email, otp } = req.body as OtpVerifyBody;
  otpService
    .verifyOtp(email, otp)
    .then((result) => {
      if (result.status === 'mfa_required') {
        res.status(200).json({
          success: true,
          statusCode: 200,
          data: { status: 'mfa_required' },
        });
        return;
      }

      res.cookie('hashira_session', result.sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: SESSION_MAX_AGE_MS,
      });
      res.cookie('hashira_refresh', result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: REFRESH_MAX_AGE_MS,
      });
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: {
          user_id: result.user.user_id,
          email: result.user.email,
          role: result.user.role,
        },
      });
    })
    .catch((err: unknown) => next(err));
}

export function resendOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/otp/resend hit');
  const { email } = req.body as OtpResendBody;
  otpService
    .resendOtp(email)
    .then(() => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { status: 'otp_sent' },
      });
    })
    .catch((err: unknown) => next(err));
}
