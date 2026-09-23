import type {
  ApiErrorCode,
  ApiErrorEnvelope,
  ValidationErrorDetails,
} from '@/types/api';

/**
 * Thin fetch wrapper around the platform API.
 *
 * Responsibilities:
 * - resolve the base URL from NEXT_PUBLIC_API_URL
 * - attach the bearer token when one is supplied
 * - normalize the backend's `{ error: { code, message } }` envelope into a
 *   single `ApiError` type so UI code never has to parse response bodies
 *
 * Tokens are passed in per call and are never logged or persisted here.
 */

const DEFAULT_BASE_URL = 'http://localhost:3001';

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  const base = configured && configured.length > 0 ? configured : DEFAULT_BASE_URL;
  // Strip a trailing slash so path concatenation stays predictable
  return base.replace(/\/+$/, '');
}

/** A normalized API failure. Every rejected request throws this. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the failure is caused by the request itself, not the server. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'VALIDATION_ERROR',
  'AUTHENTICATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DEVICE_LIMIT_REACHED',
  'NO_ACTIVE_SUBSCRIPTION',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
]);

function toErrorCode(value: unknown, status: number): ApiErrorCode {
  if (typeof value === 'string' && KNOWN_ERROR_CODES.has(value)) {
    return value as ApiErrorCode;
  }
  // Fall back to something meaningful when a proxy or gateway responds instead
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT_EXCEEDED';
  return 'INTERNAL_ERROR';
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = (value as { error?: unknown }).error;
  return typeof envelope === 'object' && envelope !== null;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serializable request body. */
  body?: unknown;
  /** Session token; sent as `Authorization: Bearer <token>` when present. */
  token?: string | null;
  /** Query string values. `undefined` and `null` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(
  path: string,
  query?: ApiRequestOptions['query']
): string {
  const url = new URL(
    path.startsWith('/') ? path : `/${path}`,
    `${getApiBaseUrl()}/`
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/**
 * Performs an API request and resolves with the parsed JSON body.
 *
 * @throws ApiError for any non-2xx response, malformed body, or network failure.
 */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const { method = 'GET', body, token, query, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    // Re-throw aborts untouched so React Query can distinguish cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(
      'NETWORK_ERROR',
      'We could not reach the server. Check your connection and try again.',
      0
    );
  }

  const isJson = (response.headers.get('content-type') ?? '').includes(
    'application/json'
  );
  const payload: unknown = isJson
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    if (isErrorEnvelope(payload)) {
      const { code, message, details } = payload.error;
      throw new ApiError(
        toErrorCode(code, response.status),
        typeof message === 'string' && message.length > 0
          ? message
          : 'Something went wrong. Please try again.',
        response.status,
        details
      );
    }

    throw new ApiError(
      toErrorCode(undefined, response.status),
      'Something went wrong. Please try again.',
      response.status
    );
  }

  return (payload ?? ({} as TResponse)) as TResponse;
}

/** Narrowing helper for `catch` blocks. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Returns the error code when the value is an ApiError, otherwise null. */
export function errorCodeOf(error: unknown): ApiErrorCode | null {
  return isApiError(error) ? error.code : null;
}

/**
 * The field a VALIDATION_ERROR blames, when it names one.
 *
 * The backend attaches `details: { field }` to validation failures - including
 * the selection consistency check on `PUT /api/catalog/me/selection` - so the UI
 * can put the message on the input that caused it instead of in a banner.
 */
export function validationFieldOf(error: unknown): string | null {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return null;

  const details = error.details as ValidationErrorDetails | null | undefined;

  return typeof details?.field === 'string' && details.field.length > 0
    ? details.field
    : null;
}

/** A display-safe message for any thrown value. */
export function errorMessageOf(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
