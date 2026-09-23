/**
 * Error envelope handling for the admin API.
 *
 * The backend returns every failure as `{ error: { code, message, details? } }`
 * (see packages/backend/src/middleware/errorHandler.ts). `ApiError` carries that
 * envelope plus the HTTP status so the UI can show the server's user-friendly
 * message instead of a raw stack trace (Requirement 10.6).
 */

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'AUTHENTICATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DEVICE_LIMIT_REACHED',
  'NO_ACTIVE_SUBSCRIPTION',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | 'NETWORK_ERROR';

export interface ApiErrorDetails {
  field?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: ApiErrorDetails;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: ApiErrorDetails
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the admin session is missing, expired, or rejected. */
  get isSessionError(): boolean {
    return this.status === 401 || this.code === 'UNAUTHORIZED';
  }

  /** True when retrying could plausibly succeed. */
  get isRetryable(): boolean {
    return this.code === 'NETWORK_ERROR' || this.status >= 500;
  }
}

const FALLBACK_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  INTERNAL_ERROR: 'Something went wrong on the server. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested item could not be found.',
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Please wait a few minutes and try again.',
};

function isErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Builds an `ApiError` from a parsed response body, tolerating bodies that do
 * not follow the envelope (proxies and load balancers sometimes return HTML).
 */
export function apiErrorFromBody(status: number, body: unknown): ApiError {
  if (body && typeof body === 'object' && 'error' in body) {
    const envelope = (body as { error: unknown }).error;

    if (envelope && typeof envelope === 'object') {
      const { code, message, details } = envelope as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
      };

      const resolvedCode: ApiErrorCode = isErrorCode(code)
        ? code
        : 'INTERNAL_ERROR';
      const resolvedMessage =
        typeof message === 'string' && message.trim().length > 0
          ? message
          : (FALLBACK_MESSAGES[resolvedCode] ?? 'The request failed.');

      return new ApiError(
        resolvedCode,
        resolvedMessage,
        status,
        details && typeof details === 'object'
          ? (details as ApiErrorDetails)
          : undefined
      );
    }
  }

  const code: ApiErrorCode = status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';

  return new ApiError(
    code,
    FALLBACK_MESSAGES[code] ?? `The request failed with status ${status}.`,
    status
  );
}

/** Extracts a message safe to render for any thrown value. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
