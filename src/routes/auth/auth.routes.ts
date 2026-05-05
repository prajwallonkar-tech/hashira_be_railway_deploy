import { Router } from 'express';
import { ipRateLimiter } from '../../middleware/rateLimiter';
import { validateBody } from '../../middleware/validateBody';
import { LoginSchema } from '../../validators/auth.validator';
import { GoogleAuthSchema } from '../../validators/google-auth.validator';
import {
  OtpVerifySchema,
  OtpResendSchema,
} from '../../validators/otp.validator';
import { createSession } from '../../controllers/auth/auth.controller';
import { createGoogleSession } from '../../controllers/auth/google-auth.controller';
import { verifyOtp, resendOtp } from '../../controllers/auth/otp.controller';
import {
  requestPasswordReset,
  confirmPasswordReset,
} from '../../controllers/auth/password-reset.controller';
import {
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
} from '../../validators/password-reset.validator';
import { authenticate } from '../../middleware/authenticate';
import { logout } from '../../controllers/auth/logout.controller';
import { refresh } from '../../controllers/auth/refresh.controller';
// MFA imports disabled — kept for future re-enablement
// import { mfaSetup, mfaConfirm, mfaVerify, mfaDisable } from '../../controllers/auth/mfa.controller';
// import { MfaCodeSchema, MfaVerifySchema } from '../../validators/mfa.validator';

export const authRouter = Router();

// POST /v1/auth/session
authRouter.post(
  '/session',
  ipRateLimiter,
  validateBody(LoginSchema),
  createSession,
);

// POST /v1/auth/google
authRouter.post(
  '/google',
  ipRateLimiter,
  validateBody(GoogleAuthSchema),
  createGoogleSession,
);

// POST /v1/auth/otp/verify
authRouter.post(
  '/otp/verify',
  ipRateLimiter,
  validateBody(OtpVerifySchema),
  verifyOtp,
);

// POST /v1/auth/otp/resend
authRouter.post(
  '/otp/resend',
  ipRateLimiter,
  validateBody(OtpResendSchema),
  resendOtp,
);

// POST /v1/auth/password-reset/request
authRouter.post(
  '/password-reset/request',
  ipRateLimiter,
  validateBody(PasswordResetRequestSchema),
  requestPasswordReset,
);

// POST /v1/auth/password-reset/confirm
authRouter.post(
  '/password-reset/confirm',
  ipRateLimiter,
  validateBody(PasswordResetConfirmSchema),
  confirmPasswordReset,
);

// POST /v1/auth/logout
authRouter.post('/logout', authenticate, logout);

// POST /v1/auth/refresh
authRouter.post('/refresh', ipRateLimiter, refresh);

// MFA endpoints disabled — kept for future re-enablement
// authRouter.post('/mfa/setup', authenticate, mfaSetup);
// authRouter.post('/mfa/confirm', authenticate, validateBody(MfaCodeSchema), mfaConfirm);
// authRouter.post('/mfa/verify', ipRateLimiter, validateBody(MfaVerifySchema), mfaVerify);
// authRouter.post('/mfa/disable', authenticate, validateBody(MfaCodeSchema), mfaDisable);
