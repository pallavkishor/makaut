import { isApiError } from './api';

/**
 * Retry policy shared by every React Query hook in the app (design 8.1:
 * "Network errors handled with retry logic — 3 attempts with exponential
 * backoff").
 *
 * Only transient failures are retried. A 4xx is the server's definitive answer
 * about the request itself, so retrying it just delays the message the student
 * needs to see.
 */

/** Retries after the first attempt, giving 3 attempts in total. */
export const MAX_QUERY_RETRIES = 2;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

/** True when the failure could plausibly succeed on a second try. */
export function isRetryableError(error: unknown): boolean {
  if (isApiError(error)) {
    // status 0 is our NETWORK_ERROR sentinel (fetch never reached the server)
    return error.code === 'NETWORK_ERROR' || error.status >= 500;
  }

  // Aborted requests are cancellations, not failures
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }

  // Unknown throwables (DNS failures, parse errors) are treated as transient
  return true;
}

/**
 * React Query `retry` predicate: retry transient failures up to
 * `MAX_QUERY_RETRIES` times.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (!isRetryableError(error)) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * Exponential backoff: 500ms, 1s, 2s, 4s… capped at 8s so a flaky connection
 * never leaves the UI spinning for minutes.
 *
 * @param attemptIndex zero-based index of the retry about to be made.
 */
export function retryDelayMs(attemptIndex: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attemptIndex);
  return Math.min(exponential, MAX_DELAY_MS);
}

/**
 * Mutations are not retried by default: most of them are non-idempotent
 * (register, login, save note progress), so a silent replay could duplicate
 * work. Opt in per mutation when the endpoint is safe to repeat.
 */
export const mutationRetry = false;
