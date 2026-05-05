/**
 * @openapi
 * /auth/session:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Step 1 of login (email + password)
 *     description: >
 *       Validates credentials. Always runs bcrypt.compare to prevent timing attacks.
 *       On success, generates a 6-digit OTP, stores SHA-256 hash in otp_tokens, and
 *       dispatches via AWS SES. Returns { status: "otp_required" }. No cookie is issued.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: OTP dispatched. Proceed to POST /v1/auth/otp/verify
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: otp_required
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id:
 *                       type: string
 *       400:
 *         description: Validation error (missing/invalid email or password)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials (intentionally ambiguous — no user existence leak)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds until the client may retry
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Step 2 of login — validate OTP
 *     description: >
 *       Validates the 6-digit OTP sent in step 1. SHA-256 hashes the incoming OTP and
 *       compares via crypto.timingSafeEqual against the stored hash. Checks expiry,
 *       single-use, and attempt limit (< 5). On success: if mfa_enabled returns
 *       { status: "mfa_required" } — no cookies issued. Otherwise issues hashira_session
 *       (24h JWT) and hashira_refresh (7d rotating) httpOnly cookies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 example: '482931'
 *     responses:
 *       200:
 *         description: >
 *           Authenticated — hashira_session and hashira_refresh cookies set.
 *           Or MFA required — no cookies, proceed to POST /v1/auth/mfa/verify.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         user_id: { type: string }
 *                         email: { type: string }
 *                         role: { type: string }
 *                     - type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: mfa_required
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id: { type: string }
 *       400:
 *         description: Validation error (invalid email or OTP format)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Organisation is suspended
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: OTP attempt limit exceeded (5 failed attempts) or IP rate limit
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds until the client may retry
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /auth/otp/resend:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Resend OTP code
 *     description: >
 *       Generates and sends a fresh 6-digit OTP to the given email address.
 *       Silently succeeds even when no valid pending OTP exists (prevents email enumeration).
 *       Only sends an email if a non-expired, unused OTP token exists for this address —
 *       ensuring the endpoint cannot be used to spam arbitrary emails.
 *       The previous OTP token is invalidated before the new one is sent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP sent (or silently no-op if no pending session exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: otp_sent
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id: { type: string }
 *       400:
 *         description: Validation error (invalid email format)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: IP rate limit exceeded
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /auth/google:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Google OAuth SSO login (single-step)
 *     description: >
 *       Verifies a Google ID token (RS256 via JWKS). Requires email_verified=true.
 *       Looks up user by google_sub; falls back to email lookup for invited users on
 *       first Google login and links google_sub. Issues hashira_session (24h JWT) and
 *       hashira_refresh (7d rotating) httpOnly cookies. No OTP step.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - google_id_token
 *             properties:
 *               google_id_token:
 *                 type: string
 *                 description: Google ID token from client-side OAuth flow
 *     responses:
 *       200:
 *         description: Authenticated — hashira_session and hashira_refresh cookies set
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id:
 *                       type: string
 *       400:
 *         description: Validation error (missing google_id_token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid/expired token or email_verified=false
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: NO_INVITATION (user not found) or ORG_SUSPENDED
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Logout — invalidate session
 *     description: >
 *       Clears both hashira_session and hashira_refresh httpOnly cookies (Max-Age=0).
 *       Also marks the inbound refresh token as used in refresh_tokens so it cannot
 *       be replayed. Returns 204 No Content. Exempt from ORG_SUSPENDED guard —
 *       suspended-org users can always log out.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       204:
 *         description: Session cleared — both cookies invalidated
 *       401:
 *         description: No valid session cookie
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /auth/password-reset/request:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Request a password reset OTP
 *     description: >
 *       Always returns 204 immediately after Zod validation — prevents timing-based
 *       email enumeration. Asynchronously (fire-and-forget): looks up user by email,
 *       skips silently if not found or if Google-only account. For valid email+password
 *       accounts: generates 6-digit OTP, stores SHA-256(email+otp) hash in
 *       password_reset_tokens (10-min expiry), sends OTP via AWS SES.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       204:
 *         description: Request accepted (email existence not revealed)
 *       400:
 *         description: Validation error (invalid email format)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: IP rate limit exceeded
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /auth/password-reset/confirm:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Confirm password reset with OTP
 *     description: >
 *       Validates the 6-digit OTP sent to the email address. Computes
 *       SHA-256(email+otp) and looks up in password_reset_tokens (used=false,
 *       expires_at > NOW()). On match: bcrypt.hash (rounds=12) the new password
 *       and atomically updates users.password_hash + marks token used=true.
 *       Rate limited to 5 failed attempts per email per 5 minutes.
 *       Only works for email+password accounts — Google-only accounts return 403.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - new_password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 example: '482931'
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       204:
 *         description: Password updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account does not support password reset (Google-only account)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: OTP not found, already used, or expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many failed attempts (5/5min per email) or IP rate limit
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
