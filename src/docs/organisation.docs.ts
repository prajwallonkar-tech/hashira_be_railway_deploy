/**
 * @openapi
 * /organisations:
 *   post:
 *     tags:
 *       - Organisations
 *     summary: Create a new organisation
 *     description: >
 *       Public endpoint. Creates an organisation (status: payment_pending) and its
 *       admin user in a single atomic transaction, then creates a Stripe Checkout session.
 *       Issues httpOnly JWT session and refresh cookies on success so the client can
 *       poll GET /v1/me while the user completes payment.
 *       Supports two mutually exclusive auth paths: email+password or Google SSO (google_id_token).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - org_name
 *                   - admin_email
 *                   - password
 *                 properties:
 *                   org_name:
 *                     type: string
 *                     minLength: 2
 *                     maxLength: 100
 *                     example: Acme Corp
 *                   admin_email:
 *                     type: string
 *                     format: email
 *                     example: alice@acme.com
 *                   password:
 *                     type: string
 *                     minLength: 8
 *               - type: object
 *                 required:
 *                   - org_name
 *                   - google_id_token
 *                 properties:
 *                   org_name:
 *                     type: string
 *                     minLength: 2
 *                     maxLength: 100
 *                     example: Acme Corp
 *                   google_id_token:
 *                     type: string
 *                     description: Google ID token from client-side OAuth flow
 *     responses:
 *       201:
 *         description: Organisation created — cookies set, proceed to stripe_checkout_url
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     org_id:
 *                       type: string
 *                       format: uuid
 *                     org_name:
 *                       type: string
 *                       example: Acme Corp
 *                     status:
 *                       type: string
 *                       example: payment_pending
 *                     stripe_checkout_url:
 *                       type: string
 *                       example: https://checkout.stripe.com/pay/cs_live_a1b2c3
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id:
 *                       type: string
 *       400:
 *         description: Validation error (missing fields, invalid email, name too short)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired Google ID token (Google path only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: org_name or admin_email already taken
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
 * /me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get current session user
 *     description: >
 *       Returns the authenticated user's identity, role, and organisation status.
 *       Called on app mount to initialise role-based routing. Also polled every 3s
 *       during the Stripe payment flow until org_status transitions from
 *       payment_pending to active.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user resolved
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
 *                       format: uuid
 *                     org_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     email:
 *                       type: string
 *                       format: email
 *                     role:
 *                       type: string
 *                       enum: [member, admin, super_admin]
 *                     org_name:
 *                       type: string
 *                       nullable: true
 *                     org_status:
 *                       type: string
 *                       enum: [payment_pending, active, suspended]
 *                       nullable: true
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id:
 *                       type: string
 *       401:
 *         description: No valid session cookie or JWT expired
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
 */
