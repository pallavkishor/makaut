import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from './logger';

/**
 * Signed download URLs for protected resource files.
 *
 * Resource PDFs live outside any web-served directory, so the only way to reach
 * one is through `GET /api/resources/download/:token` with a token minted here.
 *
 * Token shape:
 *
 *   base64url("v1:<resourceId>:<studentId>:<expiresAtSeconds>") + "." + base64url(HMAC-SHA256)
 *
 * Properties this gives us:
 *
 * - **Tamper evident.** The signature covers the canonical message, so changing
 *   the resource, the student or the expiry invalidates the token.
 * - **Bound to the issuing student.** `studentId` is inside the signed message,
 *   so a token handed to a friend fails the student check on the download route.
 * - **Short lived.** Expiry is signed, not just advisory.
 * - **Not an authorization decision on its own.** A valid token proves who asked
 *   for the URL and when. The download route still re-checks, server-side, that
 *   the student has a live session and an active subscription - a token minted
 *   five minutes ago must not outlive a cancelled subscription.
 *
 * Signature comparison uses `crypto.timingSafeEqual`, never `===`.
 *
 * Neither the secret nor a full token is ever logged.
 */

/** Only one token version exists; kept explicit so a format change is detectable. */
const TOKEN_VERSION = 'v1';

/** Fallback TTL when `RESOURCE_URL_TTL_SECONDS` is unset: 5 minutes. */
export const DEFAULT_DOWNLOAD_TTL_SECONDS = 300;

/** Upper bound on a configured or requested TTL: 1 hour. */
export const MAX_DOWNLOAD_TTL_SECONDS = 3600;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a token was rejected. Mapped to API errors by the download route. */
export enum SignedUrlFailure {
  /** Not a token this module could have produced. */
  MALFORMED = 'MALFORMED',
  /** Signature did not match - tampered, or signed with a different secret. */
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  /** Signature was valid but the token is past its expiry. */
  EXPIRED = 'EXPIRED',
  /** Signature was valid but the token belongs to a different student. */
  STUDENT_MISMATCH = 'STUDENT_MISMATCH',
}

/** Thrown by {@link verifyResourceDownloadToken} for every rejection. */
export class SignedUrlError extends Error {
  constructor(
    public readonly reason: SignedUrlFailure,
    message: string
  ) {
    super(message);
    this.name = 'SignedUrlError';
  }
}

export interface SignResourceDownloadInput {
  resourceId: string;
  studentId: string;
  /** Lifetime in seconds. Defaults to the configured TTL, clamped to the max. */
  ttlSeconds?: number;
  /** Issue time, injectable for tests. */
  now?: Date;
}

export interface SignedResourceDownload {
  token: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

export interface VerifyResourceDownloadOptions {
  /**
   * When set, the token must have been issued to this student. Omitting it
   * yields the embedded student id without checking it, which callers must then
   * authorize themselves.
   */
  expectedStudentId?: string;
  /** Verification time, injectable for tests. */
  now?: Date;
}

export interface VerifiedResourceDownload {
  resourceId: string;
  studentId: string;
  expiresAt: Date;
}

let fallbackSecretWarningLogged = false;

/**
 * Resolves the HMAC key.
 *
 * A dedicated `RESOURCE_URL_SECRET` is preferred so that rotating the download
 * key does not invalidate every session JWT. When it is absent we fall back to
 * `JWT_SECRET` and warn once - the value itself is never logged.
 */
function resolveSecret(): string {
  const dedicated = process.env.RESOURCE_URL_SECRET;

  if (dedicated && dedicated.trim().length > 0) {
    return dedicated;
  }

  if (!fallbackSecretWarningLogged) {
    fallbackSecretWarningLogged = true;
    logger.warn(
      { component: 'signedUrl' },
      'RESOURCE_URL_SECRET is not set; falling back to JWT_SECRET for resource download signatures. Set a dedicated secret so download URLs can be rotated independently of session tokens.'
    );
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.trim().length === 0) {
    throw new Error(
      'Cannot sign resource download URLs: neither RESOURCE_URL_SECRET nor JWT_SECRET is set'
    );
  }

  return jwtSecret;
}

/**
 * Resets the one-shot fallback warning. Test-only seam.
 */
export function resetSignedUrlWarnings(): void {
  fallbackSecretWarningLogged = false;
}

/** Configured default TTL, read lazily so tests can change it per case. */
export function resolveDefaultTtlSeconds(): number {
  const configured = Number(process.env.RESOURCE_URL_TTL_SECONDS);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_DOWNLOAD_TTL_SECONDS;
  }

  return Math.min(Math.floor(configured), MAX_DOWNLOAD_TTL_SECONDS);
}

/**
 * The exact bytes the signature covers. Rebuilt from parsed fields on the
 * verify path, so a non-canonical encoding of the same values fails the
 * signature check instead of being silently accepted.
 */
function canonicalMessage(
  resourceId: string,
  studentId: string,
  expiresAtSeconds: number
): string {
  return `${TOKEN_VERSION}:${resourceId}:${studentId}:${expiresAtSeconds}`;
}

function sign(message: string): Buffer {
  return createHmac('sha256', resolveSecret()).update(message, 'utf8').digest();
}

/**
 * Mints a short-lived download token for one resource and one student.
 *
 * @param input - Resource, student, and optional TTL / issue time
 * @returns The token plus its absolute expiry
 * @throws Error when ids are missing or no signing secret is configured
 */
export function signResourceDownload(
  input: SignResourceDownloadInput
): SignedResourceDownload {
  const { resourceId, studentId } = input;

  if (!UUID_PATTERN.test(resourceId)) {
    throw new Error('Cannot sign a download URL: resourceId must be a UUID');
  }

  if (!UUID_PATTERN.test(studentId)) {
    throw new Error('Cannot sign a download URL: studentId must be a UUID');
  }

  const requested = input.ttlSeconds ?? resolveDefaultTtlSeconds();
  const ttlSeconds = Math.min(
    Math.max(Math.floor(requested), 1),
    MAX_DOWNLOAD_TTL_SECONDS
  );

  const issuedAt = input.now ?? new Date();
  // Second precision: the expiry travels inside the signed message
  const expiresAtSeconds = Math.floor(issuedAt.getTime() / 1000) + ttlSeconds;

  const message = canonicalMessage(resourceId, studentId, expiresAtSeconds);
  const signature = sign(message);

  const token = `${Buffer.from(message, 'utf8').toString('base64url')}.${signature.toString(
    'base64url'
  )}`;

  return {
    token,
    expiresAt: new Date(expiresAtSeconds * 1000),
    expiresInSeconds: ttlSeconds,
  };
}

function malformed(detail: string): SignedUrlError {
  return new SignedUrlError(
    SignedUrlFailure.MALFORMED,
    `Malformed download token: ${detail}`
  );
}

/**
 * Verifies a download token: signature first, then expiry, then the student
 * binding. Nothing inside the token is trusted before the signature passes.
 *
 * @param token - Token taken from the download URL
 * @param options - Expected student and optional verification time
 * @returns The verified resource id, student id and expiry
 * @throws SignedUrlError with a `reason` describing the rejection
 */
export function verifyResourceDownloadToken(
  token: string,
  options: VerifyResourceDownloadOptions = {}
): VerifiedResourceDownload {
  if (typeof token !== 'string' || token.length === 0) {
    throw malformed('token is empty');
  }

  const parts = token.split('.');

  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    throw malformed('expected a payload and a signature');
  }

  const [encodedPayload, encodedSignature] = parts;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    throw malformed('payload is not base64url');
  }

  const fields = payload.split(':');

  if (fields.length !== 4) {
    throw malformed('unexpected payload shape');
  }

  const [version, resourceId, studentId, rawExpiry] = fields;

  if (version !== TOKEN_VERSION) {
    throw malformed(`unsupported token version`);
  }

  if (!UUID_PATTERN.test(resourceId) || !UUID_PATTERN.test(studentId)) {
    throw malformed('payload ids are not UUIDs');
  }

  if (!/^\d+$/.test(rawExpiry)) {
    throw malformed('expiry is not an integer');
  }

  const expiresAtSeconds = Number(rawExpiry);

  if (!Number.isSafeInteger(expiresAtSeconds)) {
    throw malformed('expiry is out of range');
  }

  const providedSignature = Buffer.from(encodedSignature, 'base64url');
  const expectedSignature = sign(
    canonicalMessage(resourceId, studentId, expiresAtSeconds)
  );

  // Length is checked separately: timingSafeEqual throws on a length mismatch.
  // Both operands are 32-byte SHA-256 digests in the legitimate case, so this
  // leaks nothing beyond "the signature was not even the right size".
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new SignedUrlError(
      SignedUrlFailure.INVALID_SIGNATURE,
      'Download token signature is not valid'
    );
  }

  const expiresAt = new Date(expiresAtSeconds * 1000);
  const now = options.now ?? new Date();

  if (expiresAt.getTime() <= now.getTime()) {
    throw new SignedUrlError(
      SignedUrlFailure.EXPIRED,
      'Download link has expired. Request a new one.'
    );
  }

  if (options.expectedStudentId && options.expectedStudentId !== studentId) {
    throw new SignedUrlError(
      SignedUrlFailure.STUDENT_MISMATCH,
      'Download link was issued to a different account'
    );
  }

  return { resourceId, studentId, expiresAt };
}

/** Relative API path a signed token is redeemed at. */
export function signedDownloadPath(token: string): string {
  return `/api/resources/download/${encodeURIComponent(token)}`;
}

/**
 * Builds the URL handed back to the client.
 *
 * `RESOURCE_DOWNLOAD_BASE_URL` (or `PUBLIC_API_BASE_URL`) wins when set, so a
 * deployment behind a proxy can publish its external origin. Otherwise the
 * relative path is returned and the client resolves it against the API origin
 * it already uses - never against a client-supplied Host header.
 */
export function buildSignedDownloadUrl(token: string): string {
  const base =
    process.env.RESOURCE_DOWNLOAD_BASE_URL || process.env.PUBLIC_API_BASE_URL;

  const path = signedDownloadPath(token);

  if (!base) {
    return path;
  }

  return `${base.replace(/\/+$/, '')}${path}`;
}
