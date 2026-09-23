import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticateAdmin, extractTokenFromHeader } from '../middleware/auth';
import { authRateLimiter } from '../middleware/authRateLimit';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { loginAdmin } from '../services/auth';
import { createSession, deleteSessionByToken } from '../services/session';
import { asyncHandler, handleValidation } from './helpers';
import { ADMIN_SESSION_TIMEOUT_MS, requireActiveAdminSession } from './adminHelpers';

/**
 * Task 9.1: Admin authentication endpoints
 *
 * POST /api/admin/auth/login  - Administrator login (rate limited)
 * POST /api/admin/auth/logout - Terminates the admin session server-side
 *
 * Admin authentication is fully separate from the student flow: it reads the
 * administrators table, issues an admin-typed token, and admin tokens are the
 * only tokens accepted on /api/admin/*.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
const router = Router();

/**
 * POST /api/admin/auth/login
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.8, 9.9
 */
router.post(
  '/login',
  authRateLimiter,
  [
    body('email')
      .exists({ checkFalsy: true })
      .withMessage('Email address is required')
      .bail()
      .isString()
      .withMessage('Email address is required')
      .bail()
      .trim()
      .isEmail()
      .withMessage('Email address is invalid')
      // Normalize case so login lookups stay consistent
      .customSanitizer((value: string) => value.toLowerCase()),
    body('password')
      .exists({ checkFalsy: true })
      .withMessage('Password is required')
      .bail()
      .isString()
      .withMessage('Password is required'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email: string; password: string };

    let result;
    try {
      result = await loginAdmin(email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      // Requirement 5.3: never reveal whether the account exists
      if (message === 'Invalid email or password') {
        throw new AppError(
          ErrorCode.AUTHENTICATION_FAILED,
          'Invalid email or password',
          401
        );
      }

      throw error;
    }

    // Requirement 5.5: persist the session so the 30-minute inactivity window
    // can be enforced and slid server-side. No device is bound - the device
    // limit is a student-only rule.
    await createSession({
      userId: result.user.id,
      userType: 'admin',
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      deviceId: null,
    });

    res.status(200).json({
      user: result.user,
      session: {
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        inactivityTimeoutMinutes: ADMIN_SESSION_TIMEOUT_MS / 60000,
      },
    });
  })
);

/**
 * POST /api/admin/auth/logout
 * Requirements: 5.6
 */
router.post(
  '/logout',
  authenticateAdmin,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (token) {
      await deleteSessionByToken(token);
    }

    res.status(200).json({ message: 'Logged out successfully' });
  })
);

/**
 * GET /api/admin/auth/session
 * Confirms the admin session is still live and reports when it goes idle.
 * Requirements: 5.5, 5.6
 */
router.get(
  '/session',
  authenticateAdmin,
  requireActiveAdminSession,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      user: {
        id: req.user?.userId,
        email: req.user?.email,
        userType: 'admin',
      },
      session: {
        expiresAt: req.user?.exp ? new Date(req.user.exp * 1000) : undefined,
        inactivityTimeoutMinutes: ADMIN_SESSION_TIMEOUT_MS / 60000,
      },
    });
  })
);

export default router;
