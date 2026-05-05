import {
  withExponentialBackoff,
  isRetryableError,
} from './withExponentialBackoff';

// ─── isRetryableError ─────────────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('returns true for ECONNRESET', () => {
    const err = Object.assign(new Error('connect ECONNRESET'), {
      code: 'ECONNRESET',
    });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for ECONNREFUSED', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for ETIMEDOUT', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for timeout in message', () => {
    expect(isRetryableError(new Error('Request timeout after 30s'))).toBe(true);
  });

  it('returns true for rate limit (429)', () => {
    expect(isRetryableError(new Error('HTTP 429: rate limit exceeded'))).toBe(
      true,
    );
  });

  it('returns true for fetch failed', () => {
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
  });

  it('returns false for AlreadyAnchored contract error', () => {
    expect(isRetryableError(new Error('AlreadyAnchored'))).toBe(false);
  });

  it('returns false for AlreadyAnchoredEventId contract error', () => {
    expect(isRetryableError(new Error('AlreadyAnchoredEventId'))).toBe(false);
  });

  it('returns false for execution reverted', () => {
    expect(
      isRetryableError(new Error('execution reverted: insufficient balance')),
    ).toBe(false);
  });

  it('returns false for AccessControlUnauthorizedAccount', () => {
    expect(
      isRetryableError(new Error('AccessControlUnauthorizedAccount')),
    ).toBe(false);
  });

  it('returns false for unknown errors (fail fast on unrecognised)', () => {
    expect(isRetryableError(new Error('Something completely unexpected'))).toBe(
      false,
    );
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });
});

// ─── withExponentialBackoff ───────────────────────────────────────────────────

describe('withExponentialBackoff', () => {
  let mockSleep: jest.Mock;

  beforeEach(() => {
    mockSleep = jest.fn().mockResolvedValue(undefined);
  });

  it('returns result immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await withExponentialBackoff(fn, { sleep: mockSleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('retries on retryable error and succeeds on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce('ok');

    const result = await withExponentialBackoff(fn, { sleep: mockSleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalledTimes(1);
  });

  it('applies backoff formula Math.min(1000 * 2^n, 30000) between retries', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('ok');

    await withExponentialBackoff(fn, { sleep: mockSleep });

    expect(mockSleep).toHaveBeenNthCalledWith(1, 1000); // 1000 * 2^0
    expect(mockSleep).toHaveBeenNthCalledWith(2, 2000); // 1000 * 2^1
  });

  it('caps delay at maxDelayMs', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('ok');

    // baseDelayMs(40000) > maxDelayMs(30000) → capped on first retry
    await withExponentialBackoff(fn, {
      baseDelayMs: 40000,
      maxDelayMs: 30000,
      sleep: mockSleep,
    });

    expect(mockSleep).toHaveBeenCalledWith(30000);
  });

  it('throws immediately on non-retryable error without sleeping', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('AlreadyAnchored'));

    await expect(
      withExponentialBackoff(fn, { sleep: mockSleep }),
    ).rejects.toThrow('AlreadyAnchored');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('exhausts maxAttempts and throws last error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('network timeout'));

    await expect(
      withExponentialBackoff(fn, { maxAttempts: 3, sleep: mockSleep }),
    ).rejects.toThrow('network timeout');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2); // sleep between attempts 1-2 and 2-3
  });

  it('accepts a custom isRetryable override', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('custom error'));
    const isRetryable = jest.fn().mockReturnValue(false);

    await expect(
      withExponentialBackoff(fn, { isRetryable, sleep: mockSleep }),
    ).rejects.toThrow('custom error');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable).toHaveBeenCalled();
  });

  it('calls onRetry with 1-based attempt number and error on each retry', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce('ok');
    const onRetry = jest.fn();

    await withExponentialBackoff(fn, { sleep: mockSleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
  });

  it('does not call onRetry when the function succeeds on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const onRetry = jest.fn();

    await withExponentialBackoff(fn, { sleep: mockSleep, onRetry });

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not call onRetry on the final failing attempt (no more retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('network timeout'));
    const onRetry = jest.fn();

    await expect(
      withExponentialBackoff(fn, { maxAttempts: 3, sleep: mockSleep, onRetry }),
    ).rejects.toThrow();

    // 3 attempts → sleep (and onRetry) called between attempt 1→2 and 2→3 only
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
