import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  DEVICE_LIMIT,
  getRegisteredDevices,
  revokeDevice,
  terminateDeviceSessions,
} from '../services/device';
import {
  getActiveSubscriptions,
  getSubscriptionPlan,
} from '../services/subscription';
import {
  getStudentProfile,
  listStudents,
  searchStudentsByEmail,
} from '../services/student';
import { asyncHandler, handleValidation } from './helpers';
import {
  adminGuards,
  paginationMeta,
  paginationValidators,
  parsePagination,
} from './adminHelpers';

/**
 * Task 9.2: Admin student management endpoints
 *
 * GET    /api/admin/students                          - paginated student list
 * GET    /api/admin/students/search?email=...         - search by email
 * GET    /api/admin/students/:id                      - student details
 * GET    /api/admin/students/:id/devices              - registered devices
 * DELETE /api/admin/students/:id/devices/:deviceId    - revoke a device
 *
 * Responses never include password hashes (the student service selects an
 * explicit field list) or raw device fingerprints.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const studentIdValidator = [
  param('id').isUUID().withMessage('Student ID must be a valid UUID'),
];

/**
 * GET /api/admin/students
 * Requirements: 7.1, 7.2
 */
router.get(
  '/',
  paginationValidators,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const { students, total } = await listStudents({
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      students,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * GET /api/admin/students/search?email=...
 * Declared before /:id so "search" is not parsed as an ID.
 * Requirements: 7.3, 7.4
 */
router.get(
  '/search',
  [
    query('email')
      .exists({ checkFalsy: true })
      .withMessage('Email search term is required')
      .bail()
      .isString()
      .withMessage('Email search term is required')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('Email search term is required')
      .bail()
      .isLength({ max: 255 })
      .withMessage('Email search term must be 255 characters or fewer'),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const email = String(req.query.email).trim();

    const { students, total } = await searchStudentsByEmail(email, {
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      query: email,
      students,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * GET /api/admin/students/:id
 * Requirements: 7.2, 7.6
 */
router.get(
  '/:id',
  studentIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = req.params.id;
    const student = await getStudentProfile(studentId);

    if (!student) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Student account not found', 404);
    }

    const [devices, subscriptions] = await Promise.all([
      getRegisteredDevices(studentId),
      getActiveSubscriptions(studentId),
    ]);

    // TODO(phase2): subscriptions are account-level, so each one names its plan
    // rather than a subject.
    const activeSubscriptions = await Promise.all(
      subscriptions.map(async (subscription) => {
        const plan = await getSubscriptionPlan(subscription.planId);

        return {
          id: subscription.id,
          planId: subscription.planId,
          planName: plan?.name ?? null,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        };
      })
    );

    res.status(200).json({
      student: {
        ...student,
        deviceCount: devices.length,
        activeSubscriptions,
      },
    });
  })
);

/**
 * GET /api/admin/students/:id/devices
 * Fingerprints are deliberately omitted - they are internal identifiers.
 * Requirements: 7.6
 */
router.get(
  '/:id/devices',
  studentIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = req.params.id;
    const student = await getStudentProfile(studentId);

    if (!student) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Student account not found', 404);
    }

    const devices = await getRegisteredDevices(studentId);

    res.status(200).json({
      studentId,
      devices: devices.map((device) => ({
        id: device.id,
        registeredAt: device.registeredAt,
        lastAccessedAt: device.lastAccessedAt,
      })),
      deviceLimit: DEVICE_LIMIT,
    });
  })
);

/**
 * DELETE /api/admin/students/:id/devices/:deviceId
 * Removes the device and terminates the sessions bound to it.
 * Requirements: 7.7, 7.8, 2.8
 */
router.delete(
  '/:id/devices/:deviceId',
  [
    ...studentIdValidator,
    param('deviceId').isUUID().withMessage('Device ID must be a valid UUID'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: studentId, deviceId } = req.params;

    // Ownership check first - never revoke a device from another account
    const devices = await getRegisteredDevices(studentId);
    const owned = devices.some((device) => device.id === deviceId);

    if (!owned) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Registered device not found for this student',
        404
      );
    }

    await terminateDeviceSessions(deviceId);
    await revokeDevice(studentId, deviceId);

    res.status(200).json({
      message: 'Device revoked successfully',
      studentId,
      deviceId,
    });
  })
);

export default router;
