import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { authenticateStudent } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  DEVICE_LIMIT,
  getRegisteredDevices,
  identifyDevice,
  revokeDevice,
  terminateDeviceSessions,
} from '../services/device';
import {
  getActiveSubscriptions,
  getSubscriptionPlan,
} from '../services/subscription';
import { getStudentProfile } from '../services/student';
import { asyncHandler, getStudentId, handleValidation } from './helpers';

/**
 * Task 7.2: Student device management endpoints
 * Task 7.3: Student profile endpoints
 *
 * GET    /api/students/me
 * GET    /api/students/me/subscriptions
 * GET    /api/students/me/devices
 * DELETE /api/students/me/devices/:deviceId
 *
 * Requirements: 2.5, 2.6, 2.7, 2.8, 3.4, 3.7
 */
const router = Router();

// Every route in this router requires a valid student session
router.use(authenticateStudent, requireActiveSession);

/**
 * GET /api/students/me
 * Requirements: 3.4
 */
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const student = await getStudentProfile(studentId);

    if (!student) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Student account not found', 404);
    }

    res.status(200).json({ student });
  })
);

/**
 * GET /api/students/me/subscriptions
 * Lists active subscriptions with their expiration dates.
 *
 * TODO(phase2): subscriptions are account-level now, so each entry names the
 * plan instead of a subject. `subjectId` / `subject` are gone from the response.
 *
 * Requirements: 3.4, 3.7
 */
router.get(
  '/me/subscriptions',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const subscriptions = await getActiveSubscriptions(studentId);

    const withPlans = await Promise.all(
      subscriptions.map(async (subscription) => {
        const plan = await getSubscriptionPlan(subscription.planId);

        return {
          id: subscription.id,
          planId: subscription.planId,
          plan: plan
            ? {
                id: plan.id,
                name: plan.name,
                code: plan.code,
                billingInterval: plan.billingInterval,
              }
            : null,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          // Explicit alias so clients can surface the expiration date directly
          expiresAt: subscription.currentPeriodEnd,
        };
      })
    );

    res.status(200).json({ subscriptions: withPlans });
  })
);

/**
 * GET /api/students/me/devices
 * Requirements: 2.5
 */
router.get(
  '/me/devices',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const devices = await getRegisteredDevices(studentId);
    const currentFingerprint = identifyDevice(req);

    res.status(200).json({
      devices: devices.map((device) => ({
        id: device.id,
        registeredAt: device.registeredAt,
        lastAccessedAt: device.lastAccessedAt,
        isCurrentDevice: device.fingerprint === currentFingerprint,
      })),
      deviceLimit: DEVICE_LIMIT,
    });
  })
);

/**
 * DELETE /api/students/me/devices/:deviceId
 * Revokes a device and terminates its active sessions.
 * Requirements: 2.6, 2.7, 2.8
 */
router.delete(
  '/me/devices/:deviceId',
  [param('deviceId').isUUID().withMessage('Device ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const { deviceId } = req.params;

    // Ownership check first - never act on another student's device
    const devices = await getRegisteredDevices(studentId);
    const owned = devices.some((device) => device.id === deviceId);

    if (!owned) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Registered device not found', 404);
    }

    // Requirement 2.8: terminate sessions bound to the device, then remove it
    await terminateDeviceSessions(deviceId);
    await revokeDevice(studentId, deviceId);

    res.status(200).json({
      message: 'Device revoked successfully',
      deviceId,
    });
  })
);

export default router;
