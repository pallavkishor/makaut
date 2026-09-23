import { NextFunction, Request, RequestHandler, Response } from 'express';
import { validationResult } from 'express-validator';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { hasActiveSubscription } from '../services/subscription';

/**
 * Shared helpers for route handlers
 */

/**
 * Wraps an async route handler so rejected promises reach the error middleware.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Converts express-validator results into a VALIDATION_ERROR response.
 */
export function handleValidation(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    next();
    return;
  }

  const first = errors.array()[0] as { msg: string; path?: string };

  next(
    new AppError(
      ErrorCode.VALIDATION_ERROR,
      first.msg,
      400,
      first.path ? { field: first.path } : undefined
    )
  );
}

/**
 * Returns the authenticated student's ID.
 * Defensive guard - routes using this are always behind `authenticateStudent`.
 */
export function getStudentId(req: Request): string {
  const userId = req.user?.userId;

  if (!userId || req.user?.userType !== 'student') {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }

  return userId;
}

/**
 * Server-side authorization check: the student must hold an active subscription
 * before any paid content is returned.
 *
 * TODO(phase2): this used to be per-subject - `requireActiveSubscription(
 * studentId, subjectId)`. Subscriptions are account-level now, so one active
 * subscription unlocks the whole catalogue and the subject is no longer part of
 * the decision. If per-semester or per-plan entitlements come back, they belong
 * here.
 *
 * Requirements: 3.5, 3.6, 3.8, 4.4
 */
export async function requireActiveSubscription(studentId: string): Promise<void> {
  const hasAccess = await hasActiveSubscription(studentId);

  if (!hasAccess) {
    throw new AppError(
      ErrorCode.NO_ACTIVE_SUBSCRIPTION,
      'No active subscription',
      403
    );
  }
}
