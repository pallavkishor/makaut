import { Request, Response, NextFunction } from 'express';
import { validateToken, DecodedToken } from '../utils/jwt';

/**
 * Authentication middleware
 * Validates JWT tokens from Authorization header
 */

// Extend Express Request to include user information
declare global {
  namespace Express {
    interface Request {
      user?: DecodedToken;
    }
  }
}

/**
 * Extracts JWT token from Authorization header
 * Expected format: "Bearer <token>"
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware to authenticate any user (student or admin)
 * Validates JWT token and attaches user info to request
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  try {
    const decoded = validateToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token validation failed';
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message,
      },
    });
  }
}

/**
 * Middleware to authenticate and verify user is a student
 */
export function authenticateStudent(req: Request, res: Response, next: NextFunction): void {
  authenticate(req, res, () => {
    if (req.user?.userType !== 'student') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Student access required',
        },
      });
      return;
    }
    next();
  });
}

/**
 * Middleware to authenticate and verify user is an admin
 */
export function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
  authenticate(req, res, () => {
    if (req.user?.userType !== 'admin') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Administrator access required',
        },
      });
      return;
    }
    next();
  });
}
