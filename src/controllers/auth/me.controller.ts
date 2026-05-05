import { Request, Response, NextFunction } from 'express';
import { findOrgById } from '../../repositories/organisation.repository';

export function getMe(req: Request, res: Response, next: NextFunction): void {
  console.log('GET /v1 hit');
  const { user_id, org_id, email, role } = req.user!;

  (org_id ? findOrgById(org_id) : Promise.resolve(null))
    .then((org) => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: {
          user_id,
          org_id,
          email,
          role,
          org_name: org?.name ?? null,
          org_status: org?.status ?? null,
        },
      });
    })
    .catch((err: unknown) => next(err));
}
