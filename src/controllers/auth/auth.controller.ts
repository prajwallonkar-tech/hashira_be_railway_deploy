import { Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth/auth.service';
import { LoginBody } from '../../validators/auth.validator';

export function createSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/session hit');
  const { email, password, invitation_token } = req.body as LoginBody;
  authService
    .createEmailPasswordSession(email, password, invitation_token)
    .then(() => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { status: 'otp_required' },
      });
    })
    .catch((err: unknown) => next(err));
}
