import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { BillingInterval } from '@prisma/client';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  countPlanSubscriptions,
  createPlan,
  deactivatePlan,
  deletePlan,
  getPlan,
  listPlansPaginated,
  updatePlan,
  PlanCodeConflictError,
  PlanInUseError,
  PlanNotFoundError,
  PlanValidationError,
  type CreatePlanInput,
  type PlanData,
  type UpdatePlanInput,
} from '../services/plan';
import { asyncHandler, handleValidation } from './helpers';
import {
  adminGuards,
  paginationMeta,
  paginationValidators,
  parsePagination,
} from './adminHelpers';

/**
 * Admin subscription plan management, mounted at /api/admin/plans.
 *
 * GET    /api/admin/plans?activeOnly=      - paginated list
 * POST   /api/admin/plans                  - create
 * GET    /api/admin/plans/:id              - details, with its subscription count
 * PUT    /api/admin/plans/:id              - partial update (also reactivates)
 * DELETE /api/admin/plans/:id              - deactivate; ?hard=true to remove
 *
 * Plans are what a student buys, so a plan that has been sold must keep
 * resolving forever: `subscriptions.plan_id` is ON DELETE RESTRICT. DELETE
 * therefore deactivates by default, and a `?hard=true` delete of a plan that is
 * in use is refused with 409 rather than being allowed to break history.
 *
 * Prices are integers in minor units (paise for INR) end to end - no floats.
 *
 * Requirements: 5.4, 5.5, 8.1, 8.2, 8.6, 8.7
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const BILLING_INTERVALS = Object.values(BillingInterval);

const planIdValidator = [
  param('id').isUUID().withMessage('Plan ID must be a valid UUID'),
];

/** Shared shape for every plan in an API response. */
function serialize(plan: PlanData): Record<string, unknown> {
  return {
    id: plan.id,
    name: plan.name,
    code: plan.code,
    billingInterval: plan.billingInterval,
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    durationDays: plan.durationDays,
    isActive: plan.isActive,
    razorpayPlanId: plan.razorpayPlanId,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/**
 * Translates the plan service's errors into API errors.
 *
 * A duplicate code is a 409 carrying the explanation, never a raw unique
 * constraint 500. An unrecognized error is returned untouched so real faults
 * still surface as 500s.
 */
function toApiError(error: unknown): unknown {
  if (error instanceof PlanValidationError) {
    return new AppError(ErrorCode.VALIDATION_ERROR, error.message, 400, {
      field: error.field,
    });
  }

  if (error instanceof PlanNotFoundError) {
    return new AppError(ErrorCode.NOT_FOUND, error.message, 404);
  }

  if (error instanceof PlanCodeConflictError) {
    return new AppError(ErrorCode.VALIDATION_ERROR, error.message, 409, {
      field: error.field,
    });
  }

  if (error instanceof PlanInUseError) {
    return new AppError(ErrorCode.VALIDATION_ERROR, error.message, 409, {
      ...(error.subscriptionCount === null
        ? {}
        : { subscriptionCount: error.subscriptionCount }),
      resolution: 'deactivate',
    });
  }

  return error;
}

/**
 * Validators for the writable plan fields.
 *
 * @param required - True for create, where the core fields must all be present.
 *   `currency`, `isActive` and `razorpayPlanId` are always optional: the first
 *   two have column defaults (INR, true) and the third is filled in when
 *   Razorpay is wired up.
 */
function planBodyValidators(required: boolean) {
  const onCreate = (chain: ReturnType<typeof body>) =>
    required ? chain : chain.optional();

  return [
    onCreate(
      body('name')
        .exists({ checkFalsy: true })
        .withMessage('Plan name is required')
        .bail()
        .isString()
        .withMessage('Plan name must be a string')
        .bail()
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Plan name must be between 1 and 255 characters')
    ),
    onCreate(
      body('code')
        .exists({ checkFalsy: true })
        .withMessage('Plan code is required')
        .bail()
        .isString()
        .withMessage('Plan code must be a string')
        .bail()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Plan code must be between 1 and 100 characters')
    ),
    onCreate(
      body('billingInterval')
        .isIn(BILLING_INTERVALS)
        .withMessage(
          `billingInterval must be one of: ${BILLING_INTERVALS.join(', ')}`
        )
    ),
    onCreate(
      body('priceAmount')
        .isInt({ min: 0 })
        .withMessage(
          'priceAmount must be an integer of 0 or greater, in minor units (paise)'
        )
        .toInt()
    ),
    onCreate(
      body('durationDays')
        .isInt({ min: 1 })
        .withMessage('durationDays must be an integer of 1 or greater')
        .toInt()
    ),
    body('currency')
      .optional()
      .isString()
      .withMessage('currency must be a 3-letter ISO 4217 code, e.g. INR')
      .bail()
      .trim()
      .matches(/^[A-Za-z]{3}$/)
      .withMessage('currency must be a 3-letter ISO 4217 code, e.g. INR'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be true or false')
      .toBoolean(),
    // Razorpay wiring comes later: the column is writable, never required, and
    // may be cleared with an explicit null.
    body('razorpayPlanId')
      .optional({ nullable: true })
      .custom((value) => value === null || typeof value === 'string')
      .withMessage('razorpayPlanId must be a string or null')
      .bail()
      .custom((value) => value === null || String(value).trim().length > 0)
      .withMessage('razorpayPlanId must not be blank - use null to unlink'),
  ];
}

const createValidators = planBodyValidators(true);

/**
 * GET /api/admin/plans
 * Requirements: 8.6, 8.7
 */
router.get(
  '/',
  [
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

    const { plans, total } = await listPlansPaginated({
      // `.toBoolean()` has already coerced the value when it was supplied
      activeOnly: Boolean(req.query.activeOnly),
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      plans: plans.map(serialize),
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/plans
 * Requirements: 8.1, 8.2
 */
router.post(
  '/',
  createValidators,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CreatePlanInput;

    let plan: PlanData;
    try {
      plan = await createPlan({
        name: input.name,
        code: input.code,
        billingInterval: input.billingInterval,
        priceAmount: input.priceAmount,
        durationDays: input.durationDays,
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.razorpayPlanId === undefined
          ? {}
          : { razorpayPlanId: input.razorpayPlanId }),
      });
    } catch (error) {
      throw toApiError(error);
    }

    res.status(201).json({ plan: serialize(plan) });
  })
);

/**
 * GET /api/admin/plans/:id
 *
 * Includes `subscriptionCount` because that is what decides whether the plan
 * can be removed at all - the admin UI needs it to choose between deleting and
 * deactivating.
 */
router.get(
  '/:id',
  planIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const plan = await getPlan(req.params.id);

    if (!plan) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subscription plan not found', 404);
    }

    const subscriptionCount = await countPlanSubscriptions(plan.id);

    res.status(200).json({
      plan: { ...serialize(plan), subscriptionCount },
    });
  })
);

/**
 * PUT /api/admin/plans/:id
 *
 * Partial update - only the supplied fields change. Sending `isActive: true` is
 * how a deactivated plan is put back on sale.
 */
router.put(
  '/:id',
  [...planIdValidator, ...planBodyValidators(false)],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const input = req.body as UpdatePlanInput;

    const update: UpdatePlanInput = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.billingInterval === undefined
        ? {}
        : { billingInterval: input.billingInterval }),
      ...(input.priceAmount === undefined ? {} : { priceAmount: input.priceAmount }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.durationDays === undefined
        ? {}
        : { durationDays: input.durationDays }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.razorpayPlanId === undefined
        ? {}
        : { razorpayPlanId: input.razorpayPlanId }),
    };

    if (Object.keys(update).length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'At least one field must be supplied',
        400
      );
    }

    let plan: PlanData;
    try {
      plan = await updatePlan(req.params.id, update);
    } catch (error) {
      throw toApiError(error);
    }

    res.status(200).json({ plan: serialize(plan) });
  })
);

/**
 * DELETE /api/admin/plans/:id
 *
 * Deactivates the plan, which is the only safe way to retire something students
 * have bought. `?hard=true` asks for actual removal and is refused with 409
 * when any subscription references the plan.
 */
router.delete(
  '/:id',
  [
    ...planIdValidator,
    query('hard')
      .optional()
      .isBoolean()
      .withMessage('hard must be true or false')
      .toBoolean(),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const planId = req.params.id;
    const hardDelete = Boolean(req.query.hard);

    if (hardDelete) {
      try {
        await deletePlan(planId);
      } catch (error) {
        throw toApiError(error);
      }

      res.status(200).json({
        message: 'Subscription plan deleted successfully',
        planId,
      });
      return;
    }

    let plan: PlanData;
    try {
      plan = await deactivatePlan(planId);
    } catch (error) {
      throw toApiError(error);
    }

    res.status(200).json({
      message:
        'Subscription plan deactivated. It is no longer offered to students, and existing subscriptions against it are unaffected.',
      plan: serialize(plan),
    });
  })
);

export default router;
