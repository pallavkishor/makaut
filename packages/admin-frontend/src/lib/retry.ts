import { ApiError } from './apiError';

/**
 * Retry policy shared by every React Query hook in the admin panel
 * (design 8.1: "Network errors handled with retry logic — 3 attempts with
 * exponential backoff").
 *
 * `ApiError.isRetryable` already encodes the rule: network failures and 5xx are
 * transient, everything else (validation, auth, not found) is a definitive
 * answer the administrator needs to see immediately.
 */

/** Retries after the first attempt, giving 3 attempts in total. */
export const MAX_QUERY_RETRIES = 2;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

/** True when the failure could plausibly succeed on a second try. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isRetryable;
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
 * Exponential backoff: 500ms, 1s, 2s, 4s… capped at 8s.
 *
 * @param attemptIndex zero-based index of the retry about to be made.
 */
export function retryDelayMs(attemptIndex: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attemptIndex);
  return Math.min(exponential, MAX_DELAY_MS);
}

/**
 * Mutations are not retried by default: admin writes (create subscription,
 * extend subscription, delete note) are non-idempotent, so a silent replay
 * could duplicate a record. Opt in per mutation when the call is safe to repeat.
 */
export const mutationRetry = false;
