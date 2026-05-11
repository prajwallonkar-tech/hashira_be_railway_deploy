import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../../services/api-key/api-key.service';
import { CreateApiKeyBody } from '../../validators/api-key.validator';
import { ForbiddenError } from '../../types/errors';

function resolveOrgId(req: Request): string {
  const orgId = req.user?.org_id;
  if (!orgId) {
    throw new ForbiddenError(
      'User is not assigned to an organisation',
      'NO_ORG',
    );
  }
  return orgId;
}

export function createKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let orgId: string;
  try {
    orgId = resolveOrgId(req);
  } catch (err) {
    next(err);
    return;
  }

  const body = req.body as CreateApiKeyBody;

  apiKeyService
    .createApiKey({
      org_id: orgId,
      email: body.email,
      permissions: body.permissions,
      name: body.name,
    })
    .then((key) => {
      res.status(201).json({
        success: true,
        statusCode: 201,
        data: {
          key_id: key.key_id,
          api_key: key.api_key,
          key_prefix: key.key_prefix,
          name: key.name,
          permissions: key.permissions,
          created_at: key.created_at,
        },
      });
    })
    .catch((err: unknown) => next(err));
}

export function listKeys(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let orgId: string;
  try {
    orgId = resolveOrgId(req);
  } catch (err) {
    next(err);
    return;
  }

  apiKeyService
    .listKeys(orgId)
    .then((keys) => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: keys,
      });
    })
    .catch((err: unknown) => next(err));
}

export function revokeKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let orgId: string;
  try {
    orgId = resolveOrgId(req);
  } catch (err) {
    next(err);
    return;
  }

  const keyId = req.params['key_id'];

  apiKeyService
    .revokeKey(keyId, orgId)
    .then(() => {
      res.status(200).json({
        success: true,
        statusCode: 200,
        data: { key_id: keyId, status: 'revoked' },
      });
    })
    .catch((err: unknown) => next(err));
}
