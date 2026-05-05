import { Request, Response, NextFunction } from 'express';
import { hashSHA256 } from '../../utils/crypto';
import { findInvitationByTokenHash } from '../../repositories/invitation.repository';
import { findOrgById } from '../../repositories/organisation.repository';
import { GoneError, ValidationError } from '../../types/errors';

const DEV_INVITE_TOKEN = '1234';

const DEV_INVITE_RESPONSE = {
  org_name: 'Dev Test Org',
  role: 'member',
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

export function validateInvitation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log('GET /v1/invitations/validate hit');

  const { token } = req.query as { token?: string };

  if (!token) {
    next(
      new ValidationError(
        'token query parameter is required',
        'VALIDATION_ERROR',
      ),
    );
    return;
  }

  if (process.env.SKIP_SES === 'true' && token === DEV_INVITE_TOKEN) {
    res.status(200).json({
      success: true,
      statusCode: 200,
      data: DEV_INVITE_RESPONSE,
    });
    return;
  }

  const tokenHash = hashSHA256(token);

  findInvitationByTokenHash(tokenHash)
    .then((invitation) => {
      if (!invitation) {
        throw new GoneError(
          'This invitation is invalid or has expired',
          'GONE',
        );
      }
      return findOrgById(invitation.org_id).then((org) => ({
        invitation,
        org,
      }));
    })
    .then(({ invitation, org }) => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: {
          org_name: org?.name ?? null,
          role: invitation.role,
          expires_at: invitation.expires_at,
        },
      });
    })
    .catch((err: unknown) => next(err));
}
