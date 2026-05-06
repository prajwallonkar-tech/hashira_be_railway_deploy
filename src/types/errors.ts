export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown[];

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown[],
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends AppError {
  constructor(message: string, code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR', details?: unknown[]) {
    super(message, 400, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class GoneError extends AppError {
  constructor(message: string, code = 'GONE') {
    super(message, 410, code);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, code = 'UNPROCESSABLE', details?: unknown[]) {
    super(message, 422, code, details);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code = 'RATE_LIMIT_EXCEEDED',
    retryAfter?: number,
  ) {
    super(message, 429, code);
    this.retryAfter = retryAfter;
  }
}
