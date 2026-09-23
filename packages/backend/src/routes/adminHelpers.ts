import { NextFunction, Request, RequestHandler, Response } from 'express';
import { query } from 'express-validator';
import { extractTokenFromHeader, authenticateAdmin } from '../middleware/auth';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  deleteSessionByToken,
  getSessionByToken,
  refreshSessionExpiry,
} from '../services/session';

/**
 * Shared helpers for the admin API.
 *
 * Requirements: 5.4, 5.5, 5.6, 7.1, 8.6, 8.7
 */

/** Admin sessions expire after 30 minutes of inactivity (Requirement 5.5). */
export const ADMIN_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Default and maximum page sizes for admin list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Returns the authenticated administrator's ID.
 * Defensive guard - routes using this are always behind `authenticateAdmin`.
 */
export function getAdminId(req: Request): string {
  const userId = req.user?.userId;

  if (!userId || req.user?.userType !== 'admin') {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }

  return userId;
}

/**
 * Enforces the 30-minute admin inactivity timeout.
 *
 * Runs after `authenticateAdmin`, so a structurally valid admin JWT is not
 * enough: the session must still exist server-side and must not have gone idle.
 * Each authenticated request slides the window forward, capped by the token's
 * own expiry (admin tokens are issued with a 30-minute lifetime, so the cap is
 * the hard ceiling on a single session).
 *
 * Requirements: 5.5, 5.6
 */
export function requireActiveAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
      },
    });
    return;
  }

  getSessionByToken(token)
    .then(async (session) => {
      if (!session) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Session is no longer valid. Please log in again.',
          },
        });
        return;
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        await deleteSessionByToken(token);
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Admin session expired after 30 minutes of inactivity. Please log in again.',
          },
        });
        return;
      }

      // Slide the inactivity window, never past the token's own expiry
      const tokenExpiresAt = req.user?.exp ? req.user.exp * 1000 : undefined;
      const slidExpiry = Date.now() + ADMIN_SESSION_TIMEOUT_MS;
      const nextExpiry = tokenExpiresAt
        ? Math.min(slidExpiry, tokenExpiresAt)
        : slidExpiry;

      if (nextExpiry > session.expiresAt.getTime()) {
        await refreshSessionExpiry(token, new Date(nextExpiry));
      }

      next();
    })
    .catch(next);
}

/**
 * Guard applied to every admin router: admin JWT + live, non-idle session.
 * Admin authentication is entirely separate from the student flow - a student
 * token is rejected with 403 (Requirement 5.4).
 */
export const adminGuards: RequestHandler[] = [
  authenticateAdmin,
  requireActiveAdminSession,
];

/**
 * Validators for `?page=` / `?pageSize=` on admin list endpoints.
 */
export const paginationValidators = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be an integer of 1 or greater')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: MAX_PAGE_SIZE })
    .withMessage(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`)
    .toInt(),
];

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Reads the validated pagination window off the request.
 * Safe to call without the validators having run - values are clamped.
 */
export function parsePagination(req: Request): Pagination {
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);

  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Builds the pagination block returned alongside every admin list response.
 */
export function paginationMeta(
  pagination: Pagination,
  total: number
): { page: number; pageSize: number; total: number; totalPages: number } {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: pagination.pageSize > 0 ? Math.ceil(total / pagination.pageSize) : 0,
  };
}

/** Prisma error codes the admin routes translate into API errors. */
const PRISMA_RECORD_NOT_FOUND = 'P2025';
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003';

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }

  return undefined;
}

/**
 * Translates Prisma write failures into API errors.
 * Returns the original error untouched when it is not a recognized case, so
 * unexpected failures still surface as 500s.
 *
 * @param error - Error thrown by a Prisma write
 * @param messages.notFound - Message for a missing record (404)
 * @param messages.foreignKey - Message for a broken reference (400)
 */
export function toAdminApiError(
  error: unknown,
  messages: { notFound: string; foreignKey?: string }
): unknown {
  const code = prismaErrorCode(error);

  if (code === PRISMA_RECORD_NOT_FOUND) {
    return new AppError(ErrorCode.NOT_FOUND, messages.notFound, 404);
  }

  if (code === PRISMA_FOREIGN_KEY_VIOLATION && messages.foreignKey) {
    return new AppError(ErrorCode.VALIDATION_ERROR, messages.foreignKey, 400);
  }

  return error;
}

// Subscription status used to be derived from the date window here. It is a
// stored enum on the subscriptions table now (PENDING / ACTIVE / EXPIRED /
// CANCELLED / FAILED), so the admin routes read it straight off the record.
