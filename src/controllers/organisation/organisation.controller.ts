import { Request, Response, NextFunction } from 'express';
import { organisationService } from '../../services/organisation/organisation.service';
import { CreateOrgBody } from '../../validators/organisation.validator';

const SESSION_MAX_AGE_MS = 86400 * 1000;
const REFRESH_MAX_AGE_MS = 604800 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createOrganisation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('POST /v1/organisations hit');
  const body = req.body as CreateOrgBody;
  organisationService
    .createOrg(body)
    .then(({ org, stripeCheckoutUrl, sessionToken, refreshToken }) => {
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
      res.status(201).json({
        success: true,
        statusCode: 201,
        data: {
          org_id: org.org_id,
          org_name: org.name,
          status: org.status,
          stripe_checkout_url: stripeCheckoutUrl,
          created_at: org.created_at,
        },
      });
    })
    .catch((err: unknown) => next(err));
}
