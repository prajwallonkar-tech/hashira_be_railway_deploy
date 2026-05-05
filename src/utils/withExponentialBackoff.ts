export interface BackoffOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_MAX_ATTEMPTS = parseInt(
  process.env.ANCHOR_MAX_RETRIES ?? '3',
  10,
);
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

const RETRYABLE_PATTERNS = [
  'timeout',
  'network',
  'fetch failed',
  'rate limit',
  'rate_limit',
  '429',
  'socket',
];

const NON_RETRYABLE_PATTERNS = [
  'alreadyanchored',
  'execution reverted',
  'accesscontrolunauthorizedaccount',
  'zerovalues',
  'zeroaddress',
  'invalid argument',
  'invalidinput',
];

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const code = ((error as NodeJS.ErrnoException).code ?? '').toUpperCase();

  if (NON_RETRYABLE_PATTERNS.some((p) => message.includes(p))) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  return RETRYABLE_PATTERNS.some((p) => message.includes(p));
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const checkRetryable = options.isRetryable ?? isRetryableError;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === maxAttempts - 1;
      if (isLast || !checkRetryable(error)) throw error;
      options.onRetry?.(attempt + 1, error);
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await sleep(delay);
    }
  }

  throw new Error('unreachable');
}
