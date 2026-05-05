import { Request, Response } from 'express';
import { validateApiKeyPermission } from './validateApiKeyPermission';
import { ApiKeyPermission } from '../types/enums';
import { ForbiddenError } from '../types/errors';

function makeReq(permissions?: string[]): Partial<Request> {
  if (permissions === undefined) return {} as Partial<Request>;
  return {
    apiKey: { key_id: 'key-1', org_id: 'org-1', permissions },
  } as Partial<Request>;
}

const res = {} as Response;

describe('validateApiKeyPermission middleware', () => {
  it('calls next() when the required permission is present on req.apiKey', () => {
    const next = jest.fn();

    validateApiKeyPermission(ApiKeyPermission.EVENTS_WRITE)(
      makeReq(['events:write']) as Request,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ForbiddenError INSUFFICIENT_PERMISSIONS) when permission is absent', () => {
    const next = jest.fn();

    validateApiKeyPermission(ApiKeyPermission.EVENTS_WRITE)(
      makeReq(['events:read']) as Request,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      }),
    );
    const firstCall = next.mock.calls[0] as unknown[];
    expect(firstCall[0]).toBeInstanceOf(ForbiddenError);
  });

  it('allows a key with multiple permissions to pass any one of them', () => {
    const next = jest.fn();

    validateApiKeyPermission(ApiKeyPermission.EVENTS_READ)(
      makeReq(['events:write', 'events:read']) as Request,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ForbiddenError) when req.apiKey is not set (validateApiKey not in chain)', () => {
    const next = jest.fn();

    validateApiKeyPermission(ApiKeyPermission.EVENTS_WRITE)(
      makeReq(undefined) as Request,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
