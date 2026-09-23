import { Request, Response, NextFunction } from 'express';
import { extractTokenFromHeader } from './auth';
import { ErrorCode } from './errorHandler';
import { deleteSessionByToken, getSessionByToken } from '../services/session';

/**
 * Session validation middleware
 *
 * Runs after `authenticate` / `authenticateStudent`. A structurally valid JWT is
 * not sufficient: the matching session must still exist server-side. This is what
 * makes logout and device revocation take effect immediately.
 *
 * Requirements: 2.8 (revoking a device terminates its sessions)
 */
export function requireActiveSession(
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
            message: 'Session has expired. Please log in again.',
          },
        });
        return;
      }

      next();
    })
    .catch(next);
}
