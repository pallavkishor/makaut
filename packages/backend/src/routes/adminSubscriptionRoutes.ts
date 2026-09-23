import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { SubscriptionStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { getStudentProfile } from '../services/student';
import {
  cancelSubscription,
  createSubscription,
  extendSubscription,
  getSubscription,
  getSubscriptionPlan,
  listSubscriptionsPaginated,
} from '../services/subscription';
import type { SubscriptionData } from '../services/subscription';
import { asyncHandler, handleValidation } from './helpers';
import {
  adminGuards,
  paginationMeta,
  paginationValidators,
  parsePagination,
  toAdminApiError,
} from './adminHelpers';

/**
 * Task 9.5: Admin subscription management endpoints
 *
 * GET    /api/admin/subscriptions?studentId=&planId=&status=  - filtered list
 * POST   /api/admin/subscriptions                             - create
 * GET    /api/admin/subscriptions/:id                         - details
 * PUT    /api/admin/subscriptions/:id                         - extend the period
 * DELETE /api/admin/subscriptions/:id                         - cancel immediately
 *
 * TODO(phase2): subscriptions are account-level now, so these endpoints take a
 * `planId` where they used to take a `subjectId`, and `status` is a stored enum
 * rather than something derived from the date window. Admin CRUD for the plans
 * themselves does not exist yet.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const subscriptionIdValidator = [
  param('id').isUUID().withMessage('Subscription ID must be a valid UUID'),
];

const SUBSCRIPTION_STATUSES = Object.values(SubscriptionStatus);

/**
 * Adds the student email and plan name to a subscription.
 * Requirement 8.6: the list must show who, what, when and current status.
 */
async function decorate(
  subscription: SubscriptionData
): Promise<Record<string, unknown>> {
  const [student, plan] = await Promise.all([
    getStudentProfile(subscription.studentId),
    getSubscriptionPlan(subscription.planId),
  ]);

  return {
    id: subscription.id,
    studentId: subscription.studentId,
    studentEmail: student?.email ?? null,
    planId: subscription.planId,
    planName: plan?.name ?? null,
    planCode: plan?.code ?? null,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelledAt: subscription.cancelledAt,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

/**
 * GET /api/admin/subscriptions
 * Requirements: 8.6, 8.7
 */
router.get(
  '/',
  [
    query('studentId')
      .optional()
      .isUUID()
      .withMessage('studentId must be a valid UUID'),
    query('planId')
      .optional()
      .isUUID()
      .withMessage('planId must be a valid UUID'),
    query('status')
      .optional()
      .isIn(SUBSCRIPTION_STATUSES)
      .withMessage(`status must be one of: ${SUBSCRIPTION_STATUSES.join(', ')}`),
    query('activeOnly')
      .optional()
      .isBoolean()
      .withMessage('activeOnly must be true or false')
      .toBoolean(),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);

    const { subscriptions, total } = await listSubscriptionsPaginated({
      studentId: req.query.studentId ? String(req.query.studentId) : undefined,
      planId: req.query.planId ? String(req.query.planId) : undefined,
      status: req.query.status
        ? (String(req.query.status) as SubscriptionStatus)
        : undefined,
      // `.toBoolean()` has already coerced the value when it was supplied
      activeOnly: Boolean(req.query.activeOnly),
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      subscriptions: await Promise.all(subscriptions.map(decorate)),
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/subscriptions
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
router.post(
  '/',
  [
    body('studentId').isUUID().withMessage('Student ID must be a valid UUID'),
    body('planId').isUUID().withMessage('Plan ID must be a valid UUID'),
    body('startDate')
      .exists({ checkFalsy: true })
      .withMessage('Start date is required')
      .bail()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date')
      .toDate(),
    body('endDate')
      .exists({ checkFalsy: true })
      .withMessage('End date is required')
      .bail()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
      .toDate(),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { studentId, planId, startDate, endDate } = req.body as {
      studentId: string;
      planId: string;
      startDate: Date;
      endDate: Date;
    };

    // Requirement 8.4: reject an end date that is not after the start date
    if (endDate <= startDate) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'End date must be after start date',
        400,
        { field: 'endDate' }
      );
    }

    // Requirement 8.2: both sides of the subscription must exist
    const [student, plan] = await Promise.all([
      getStudentProfile(studentId),
      getSubscriptionPlan(planId),
    ]);

    if (!student) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Student account not found', 404);
    }

    if (!plan) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subscription plan not found', 404);
    }

    let subscription;
    try {
      subscription = await createSubscription(studentId, planId, startDate, endDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message === 'End date must be after start date') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, message, 400, {
          field: 'endDate',
        });
      }

      throw toAdminApiError(error, {
        notFound: 'Student or plan not found',
        foreignKey: 'Student or plan does not exist',
      });
    }

    res.status(201).json({ subscription: await decorate(subscription) });
  })
);

/**
 * GET /api/admin/subscriptions/:id
 * Requirements: 8.6
 */
router.get(
  '/:id',
  subscriptionIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const subscription = await getSubscription(req.params.id);

    if (!subscription) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subscription not found', 404);
    }

    res.status(200).json({ subscription: await decorate(subscription) });
  })
);

/**
 * PUT /api/admin/subscriptions/:id
 * Extends the subscription by moving the end of its current period.
 * Requirements: 8.8, 8.9
 */
router.put(
  '/:id',
  [
    ...subscriptionIdValidator,
    body('endDate')
      .exists({ checkFalsy: true })
      .withMessage('End date is required')
      .bail()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
      .toDate(),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { endDate } = req.body as { endDate: Date };

    let subscription;
    try {
      subscription = await extendSubscription(req.params.id, endDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message === 'Subscription not found') {
        throw new AppError(ErrorCode.NOT_FOUND, message, 404);
      }

      // Requirement 8.4 applied to extension: the window must stay valid
      if (message === 'New end date must be after start date') {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'End date must be after start date',
          400,
          { field: 'endDate' }
        );
      }

      throw toAdminApiError(error, { notFound: 'Subscription not found' });
    }

    res.status(200).json({ subscription: await decorate(subscription) });
  })
);

/**
 * DELETE /api/admin/subscriptions/:id
 * Cancels the subscription, which revokes access immediately.
 * Requirements: 8.10, 8.11
 */
router.delete(
  '/:id',
  subscriptionIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    let subscription;
    try {
      subscription = await cancelSubscription(req.params.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message === 'Subscription not found') {
        throw new AppError(ErrorCode.NOT_FOUND, message, 404);
      }

      throw toAdminApiError(error, { notFound: 'Subscription not found' });
    }

    res.status(200).json({
      message: 'Subscription cancelled successfully',
      subscription: await decorate(subscription),
    });
  })
);

export default router;
