import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticateStudent, extractTokenFromHeader } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { authRateLimiter, registrationRateLimiter } from '../middleware/authRateLimit';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { loginStudent, registerStudent } from '../services/auth';
import {
  DEVICE_LIMIT_MESSAGE,
  canLoginFromDevice,
  identifyDevice,
  registerDevice,
} from '../services/device';
import { createSession, deleteSessionByToken } from '../services/session';
import { getStudentProfile } from '../services/student';
import { asyncHandler, getStudentId, handleValidation } from './helpers';

/**
 * Task 7.1: Student authentication endpoints
 *
 * POST   /api/auth/register  - Student registration
 * POST   /api/auth/login     - Student login with device tracking + device limit
 *
 * The device allowance is not hardcoded here: it comes from `DEVICE_LIMIT` /
 * `DEVICE_LIMIT_MESSAGE` in services/device.ts (currently one device per
 * account). Import the constants rather than restating the number, so the rule
 * lives in exactly one place.
 * POST   /api/auth/logout    - Session termination
 * GET    /api/auth/session   - Session validation
 *
 * Requirements: 1.1, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4
 */
const router = Router();

const credentialValidators = [
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
    // Normalize case so duplicate detection and login lookups stay consistent
    .customSanitizer((value: string) => value.toLowerCase()),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .bail()
    .isString()
    .withMessage('Password is required'),
];

/**
 * Maps registration service errors onto API errors.
 */
function mapRegistrationError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : 'Registration failed';

  if (message === 'Email address already registered') {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 409, { field: 'email' });
  }

  if (message === 'Invalid email format') {
    return new AppError(ErrorCode.VALIDATION_ERROR, 'Email address is invalid', 400, {
      field: 'email',
    });
  }

  if (message.startsWith('Password must be at least')) {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, { field: 'password' });
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, 'Registration failed', 500);
}

/**
 * POST /api/auth/register
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.8
 */
router.post(
  '/register',
  registrationRateLimiter,
  [
    ...credentialValidators,
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email: string; password: string };

    let result;
    try {
      result = await registerStudent(email, password);
    } catch (error) {
      throw mapRegistrationError(error);
    }

    // Register the device this account was created from (always under the limit)
    // and persist the session so it can be terminated server-side.
    const fingerprint = identifyDevice(req);
    const device = await registerDevice(result.student.id, fingerprint);

    await createSession({
      userId: result.student.id,
      userType: 'student',
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      deviceId: device.id,
    });

    res.status(201).json({
      student: result.student,
      session: result.session,
    });
  })
);

/**
 * POST /api/auth/login
 * Runs device fingerprinting and enforces the DEVICE_LIMIT allowance.
 * Requirements: 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4
 */
router.post(
  '/login',
  authRateLimiter,
  credentialValidators,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email: string; password: string };

    let result;
    try {
      result = await loginStudent(email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message === 'Invalid email or password') {
        throw new AppError(
          ErrorCode.AUTHENTICATION_FAILED,
          'Invalid email or password',
          401
        );
      }

      throw error;
    }

    // Requirement 2.1: identify the device via fingerprinting
    const fingerprint = identifyDevice(req);

    // Requirements 2.3, 2.4: block login once the device allowance is used up
    const deviceAllowed = await canLoginFromDevice(result.user.id, fingerprint);
    if (!deviceAllowed) {
      throw new AppError(ErrorCode.DEVICE_LIMIT_REACHED, DEVICE_LIMIT_MESSAGE, 403);
    }

    // Requirements 2.2, 2.4: auto-register new devices, refresh last accessed time
    const device = await registerDevice(result.user.id, fingerprint);

    await createSession({
      userId: result.user.id,
      userType: 'student',
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      deviceId: device.id,
    });

    res.status(200).json({
      user: result.user,
      session: result.session,
      device: {
        id: device.id,
        registeredAt: device.registeredAt,
        lastAccessedAt: device.lastAccessedAt,
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * Requirements: 1.6 (session lifecycle)
 */
router.post(
  '/logout',
  authenticateStudent,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (token) {
      await deleteSessionByToken(token);
    }

    res.status(200).json({ message: 'Logged out successfully' });
  })
);

/**
 * GET /api/auth/session
 * Validates the session token and returns the authenticated student.
 * Requirements: 1.6
 */
router.get(
  '/session',
  authenticateStudent,
  requireActiveSession,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const student = await getStudentProfile(studentId);

    if (!student) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Session is no longer valid', 401);
    }

    res.status(200).json({
      user: {
        id: student.id,
        email: student.email,
        userType: 'student',
        registeredAt: student.registeredAt,
      },
      session: {
        expiresAt: req.user?.exp ? new Date(req.user.exp * 1000) : undefined,
      },
    });
  })
);

export default router;
