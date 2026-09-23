import { ApiError, apiErrorFromBody } from './apiError';

/**
 * Minimal fetch wrapper for the admin API.
 *
 * Responsibilities:
 * - resolve the base URL from NEXT_PUBLIC_API_URL
 * - attach the admin bearer token
 * - normalise the `{ error: { code, message } }` envelope into `ApiError`
 * - notify the auth context when the session is rejected (Requirement 5.6)
 */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON request body. */
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Skip the global 401 handler (used by the login request itself). */
  skipSessionHandler?: boolean;
}

let authToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/** Registered by the auth provider so a rejected token forces a re-login. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(
    path.startsWith('/') ? `${API_BASE_URL}${path}` : `${API_BASE_URL}/${path}`
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, query, signal, skipSessionHandler } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: requestBody,
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
      0
    );
  }

  const parsed = await parseBody(response);

  if (!response.ok) {
    const apiError = apiErrorFromBody(response.status, parsed);

    if (apiError.isSessionError && !skipSessionHandler) {
      sessionExpiredHandler?.();
    }

    throw apiError;
  }

  return parsed as T;
}

export interface RawUploadOptions {
  /** Exact MIME type the endpoint expects, e.g. `application/pdf`. */
  contentType: string;
  /** The file itself; sent as the request body, unencoded. */
  file: Blob;
  /** Metadata goes in the query string for raw uploads. */
  query?: Record<string, QueryValue>;
  /** 0-1 fraction of bytes sent, or null when the browser cannot tell. */
  onProgress?: (fraction: number | null) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a file as a raw request body.
 *
 * The admin upload endpoints (`/notes/images`, `/resources`) take the bytes
 * directly with the real Content-Type and read their metadata from the query
 * string - there is no multipart handler on the server. Raw is also the only
 * way to send a large PDF: the base64 JSON alternative inflates the payload by
 * a third and is bounded by the global JSON body limit.
 *
 * XMLHttpRequest rather than fetch, because fetch cannot report upload
 * progress.
 */
export function apiUploadRaw<T>(
  path: string,
  options: RawUploadOptions
): Promise<T> {
  const { contentType, file, query, onProgress, signal } = options;

  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('POST', buildUrl(path, query), true);
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Content-Type', contentType);

    if (authToken) {
      request.setRequestHeader('Authorization', `Bearer ${authToken}`);
    }

    const abort = () => request.abort();

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'));
        return;
      }

      signal.addEventListener('abort', abort, { once: true });
    }

    const cleanup = () => signal?.removeEventListener('abort', abort);

    if (onProgress && request.upload) {
      request.upload.onprogress = (event) => {
        onProgress(event.lengthComputable ? event.loaded / event.total : null);
      };
    }

    request.onload = () => {
      cleanup();

      let parsed: unknown = null;

      if (request.responseText) {
        try {
          parsed = JSON.parse(request.responseText) as unknown;
        } catch {
          parsed = { raw: request.responseText };
        }
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(parsed as T);
        return;
      }

      const apiError = apiErrorFromBody(request.status, parsed);

      if (apiError.isSessionError) {
        sessionExpiredHandler?.();
      }

      reject(apiError);
    };

    request.onerror = () => {
      cleanup();
      reject(
        new ApiError(
          'NETWORK_ERROR',
          'Could not reach the server. Check your connection and try again.',
          0
        )
      );
    };

    request.onabort = () => {
      cleanup();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    request.send(file);
  });
}
