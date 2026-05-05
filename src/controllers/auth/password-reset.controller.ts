import { Request, Response, NextFunction } from 'express';
import { passwordResetService } from '../../services/auth/password-reset.service';
import {
  PasswordResetRequestBody,
  PasswordResetConfirmBody,
} from '../../validators/password-reset.validator';

export function requestPasswordReset(
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  console.log('POST /v1/auth/password-reset/request hit');
  const { email } = req.body as PasswordResetRequestBody;
  // Respond immediately — fire-and-forget prevents timing-based enumeration
  res.status(204).send();
  void passwordResetService.requestReset(email);
}

export function confirmPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/auth/password-reset/confirm hit');
  const { email, otp, new_password } = req.body as PasswordResetConfirmBody;
  passwordResetService
    .confirmReset(email, otp, new_password)
    .then(() => {
      res.status(204).send();
    })
    .catch((err: unknown) => next(err));
}
