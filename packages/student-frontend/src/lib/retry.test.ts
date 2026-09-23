import { ApiError } from './api';
import {
  MAX_QUERY_RETRIES,
  isRetryableError,
  mutationRetry,
  retryDelayMs,
  shouldRetryQuery,
} from './retry';

describe('retry policy', () => {
  describe('isRetryableError', () => {
    it('retries network failures', () => {
      expect(
        isRetryableError(
          new ApiError('NETWORK_ERROR', 'Could not reach the server', 0)
        )
      ).toBe(true);
    });

    it.each([500, 502, 503])('retries %s responses', (status) => {
      expect(
        isRetryableError(new ApiError('INTERNAL_ERROR', 'server', status))
      ).toBe(true);
    });

    it.each([
      ['VALIDATION_ERROR', 400],
      ['AUTHENTICATION_FAILED', 401],
      ['UNAUTHORIZED', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['DEVICE_LIMIT_REACHED', 403],
      ['NO_ACTIVE_SUBSCRIPTION', 403],
      ['RATE_LIMIT_EXCEEDED', 429],
    ] as const)('does not retry %s (%s)', (code, status) => {
      expect(isRetryableError(new ApiError(code, 'client', status))).toBe(false);
    });

    it('does not retry aborted requests', () => {
      expect(isRetryableError(new DOMException('aborted', 'AbortError'))).toBe(
        false
      );
    });

    it('treats unknown throwables as transient', () => {
      expect(isRetryableError(new Error('Failed to fetch'))).toBe(true);
    });
  });

  describe('shouldRetryQuery', () => {
    const transient = new ApiError('NETWORK_ERROR', 'offline', 0);

    it('allows exactly MAX_QUERY_RETRIES retries', () => {
      expect(shouldRetryQuery(0, transient)).toBe(true);
      expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, transient)).toBe(true);
      expect(shouldRetryQuery(MAX_QUERY_RETRIES, transient)).toBe(false);
    });

    it('gives 3 attempts in total (design 8.1)', () => {
      let attempts = 1;
      while (shouldRetryQuery(attempts - 1, transient)) {
        attempts += 1;
      }
      expect(attempts).toBe(3);
    });

    it('never retries a client error, even on the first failure', () => {
      const clientError = new ApiError('VALIDATION_ERROR', 'bad input', 400);
      expect(shouldRetryQuery(0, clientError)).toBe(false);
    });
  });

  describe('retryDelayMs', () => {
    it('grows exponentially from 500ms', () => {
      expect(retryDelayMs(0)).toBe(500);
      expect(retryDelayMs(1)).toBe(1000);
      expect(retryDelayMs(2)).toBe(2000);
      expect(retryDelayMs(3)).toBe(4000);
    });

    it('caps the delay at 8 seconds', () => {
      expect(retryDelayMs(10)).toBe(8000);
      expect(retryDelayMs(100)).toBe(8000);
    });

    it('is monotonically non-decreasing', () => {
      const delays = Array.from({ length: 20 }, (_, i) => retryDelayMs(i));
      for (let i = 1; i < delays.length; i += 1) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
      }
    });

    it('handles a negative index defensively', () => {
      expect(retryDelayMs(-1)).toBe(500);
    });
  });

  it('does not retry mutations by default', () => {
    expect(mutationRetry).toBe(false);
  });
});
