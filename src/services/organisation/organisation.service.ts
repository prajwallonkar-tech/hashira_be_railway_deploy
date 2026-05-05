import bcrypt from 'bcrypt';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  findOrgByName,
  createOrgWithAdmin,
} from '../../repositories/organisation.repository';
import { findUserByEmail } from '../../repositories/user.repository';
import { insertRefreshToken } from '../../repositories/refresh-token.repository';
import { stripe } from '../../utils/stripe.client';
import { signJwt, generateRefreshToken, JwtPayload } from '../../utils/jwt';
import { hashSHA256 } from '../../utils/crypto';
import { AuthError, ConflictError } from '../../types/errors';
import { env } from '../../config/env';
import { Organisation } from '../../entities/organisation.entity';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { cacheMaxAge: 60 * 60 * 1000 },
);

export interface CreateOrgResult {
  org: Organisation;
  stripeCheckoutUrl: string;
  sessionToken: string;
  refreshToken: string;
  user: JwtPayload;
}

export class OrganisationService {
  async createOrg(body: {
    org_name: string;
    admin_email?: string;
    password?: string;
    google_id_token?: string;
  }): Promise<CreateOrgResult> {
    const existingOrg = await findOrgByName(body.org_name);
    if (existingOrg) {
      throw new ConflictError('Organisation name already taken', 'CONFLICT');
    }

    let adminEmail: string;
    let passwordHash: string | null = null;
    let googleSub: string | null = null;

    if (body.google_id_token) {
      try {
        const { payload } = await jwtVerify(body.google_id_token, GOOGLE_JWKS, {
          audience: env.GOOGLE_CLIENT_ID,
          issuer: ['accounts.google.com', 'https://accounts.google.com'],
        });
        if (!payload['email_verified']) {
          throw new AuthError(
            'Google account email is not verified',
            'UNAUTHORIZED',
          );
        }
        adminEmail = payload['email'] as string;
        googleSub = payload.sub as string;
      } catch (err) {
        if (err instanceof AuthError) throw err;
        throw new AuthError(
          'Invalid or expired Google ID token',
          'UNAUTHORIZED',
        );
      }
    } else {
      adminEmail = body.admin_email!;
      passwordHash = await bcrypt.hash(body.password!, 12);
    }

    const existingUser = await findUserByEmail(adminEmail);
    if (existingUser) {
      throw new ConflictError('Email already registered', 'CONFLICT');
    }

    const { org, user } = await createOrgWithAdmin({
      orgName: body.org_name,
      adminEmail,
      passwordHash,
      googleSub,
    });

    const frontendUrl = env.FRONTEND_URL ?? 'http://localhost:5173';
    let stripeCheckoutUrl: string;

    if (process.env.SKIP_SES === 'true') {
      stripeCheckoutUrl = `${frontendUrl}/signup/success?session_id=dev_bypass`;
    } else {
      const checkoutSession = await stripe.checkout.sessions.create({
        customer_email: adminEmail,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: env.STRIPE_PRICE_ID ?? '', quantity: 1 }],
        success_url: `${frontendUrl}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/signup?cancelled=true`,
        metadata: { org_id: org.org_id },
      });
      stripeCheckoutUrl = checkoutSession.url ?? '';
    }

    const jwtPayload: JwtPayload = {
      user_id: user.user_id,
      org_id: org.org_id,
      role: user.role,
      email: adminEmail,
    };

    const sessionToken = signJwt(jwtPayload);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashSHA256(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await insertRefreshToken(user.user_id, tokenHash, expiresAt);

    return {
      org,
      stripeCheckoutUrl,
      sessionToken,
      refreshToken,
      user: jwtPayload,
    };
  }
}

export const organisationService = new OrganisationService();
