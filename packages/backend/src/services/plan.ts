import { BillingInterval, PrismaClient } from '@prisma/client';
import { getDatabaseClient } from '../config/database';
import {
  getSubscriptionPlan,
  listSubscriptionPlans,
  type SubscriptionPlanData,
} from './subscription';

/**
 * Subscription Plan Service
 *
 * Write side of `subscription_plans`. The read helpers already live in the
 * subscription service (`getSubscriptionPlan`, `listSubscriptionPlans`) and are
 * reused here rather than duplicated - this module adds create / update /
 * deactivate / delete and the paginated admin listing.
 *
 * Two invariants this module owns:
 *
 *  1. `code` is unique. A duplicate is reported as PlanCodeConflictError so the
 *     API can answer 409 with a useful message instead of leaking a raw unique
 *     constraint violation as a 500.
 *  2. A plan that has ever been sold is never hard-deleted. The FK from
 *     `subscriptions.plan_id` is ON DELETE RESTRICT, so the database would
 *     refuse anyway; this module refuses first, with a PlanInUseError that says
 *     how many subscriptions are in the way and points at deactivation.
 *
 * Money is stored in minor units (paise for INR) as an integer - never a float.
 *
 * TODO(phase2): `razorpayPlanId` is writable but nothing syncs it with Razorpay
 * yet. Plan creation on the Razorpay side comes with the payment wiring.
 */

// Allow injecting a Prisma client for testing
let prismaClientOverride: PrismaClient | null = null;

export function setPrismaClient(client: PrismaClient): void {
  prismaClientOverride = client;
}

export function resetPrismaClient(): void {
  prismaClientOverride = null;
}

function getPrisma(): PrismaClient {
  return prismaClientOverride || getDatabaseClient();
}

/** A plan row as returned by the service. Same shape the read helpers return. */
export type PlanData = SubscriptionPlanData;

export interface CreatePlanInput {
  name: string;
  code: string;
  billingInterval: BillingInterval;
  /** Minor units, e.g. paise for INR */
  priceAmount: number;
  currency?: string;
  durationDays: number;
  isActive?: boolean;
  razorpayPlanId?: string | null;
}

/** Every field is optional - an update touches only what was supplied. */
export type UpdatePlanInput = Partial<CreatePlanInput>;

export interface PlanListResult {
  plans: PlanData[];
  total: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** An input value broke a plan invariant. Carries the offending field. */
export class PlanValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

/** No plan with the given id. */
export class PlanNotFoundError extends Error {
  constructor(message = 'Subscription plan not found') {
    super(message);
    this.name = 'PlanNotFoundError';
  }
}

/** A unique column (code, or razorpayPlanId) already holds this value. */
export class PlanCodeConflictError extends Error {
  constructor(
    public readonly field: 'code' | 'razorpayPlanId',
    public readonly value: string
  ) {
    super(
      field === 'code'
        ? `A subscription plan with code "${value}" already exists. Plan codes must be unique.`
        : `A subscription plan is already linked to Razorpay plan "${value}".`
    );
    this.name = 'PlanCodeConflictError';
  }
}

/**
 * The plan is referenced by subscriptions, so it cannot be removed.
 * Deactivation is the supported way to retire a plan.
 */
export class PlanInUseError extends Error {
  constructor(public readonly subscriptionCount: number | null = null) {
    super(
      subscriptionCount === null
        ? 'This plan is referenced by existing subscriptions and cannot be deleted. Deactivate it instead (isActive = false) so it stops being sold while existing subscriptions keep working.'
        : `This plan is referenced by ${subscriptionCount} existing subscription(s) and cannot be deleted. Deactivate it instead (isActive = false) so it stops being sold while those subscriptions keep working.`
    );
    this.name = 'PlanInUseError';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const BILLING_INTERVALS = Object.values(BillingInterval);
const MAX_CODE_LENGTH = 100;
const MAX_NAME_LENGTH = 255;

export interface PlanFieldIssue {
  field: string;
  message: string;
}

/**
 * Validates the writable plan fields that are present on the input.
 *
 * Pure: no database access, so it is the same check for create and update and
 * can be exercised directly. Returns the first issue found, or null when every
 * supplied field is acceptable. Absent fields are not checked - an update only
 * has to justify what it changes.
 *
 * @param input - Partial set of plan fields
 * @returns The first field issue, or null when the input is valid
 */
export function validatePlanInput(input: UpdatePlanInput): PlanFieldIssue | null {
  if (input.name !== undefined) {
    const name = input.name.trim();

    if (name.length === 0) {
      return { field: 'name', message: 'Plan name is required' };
    }

    if (name.length > MAX_NAME_LENGTH) {
      return {
        field: 'name',
        message: `Plan name must be at most ${MAX_NAME_LENGTH} characters`,
      };
    }
  }

  if (input.code !== undefined) {
    const code = input.code.trim();

    if (code.length === 0) {
      return { field: 'code', message: 'Plan code is required' };
    }

    if (code.length > MAX_CODE_LENGTH) {
      return {
        field: 'code',
        message: `Plan code must be at most ${MAX_CODE_LENGTH} characters`,
      };
    }
  }

  if (
    input.billingInterval !== undefined &&
    !BILLING_INTERVALS.includes(input.billingInterval)
  ) {
    return {
      field: 'billingInterval',
      message: `billingInterval must be one of: ${BILLING_INTERVALS.join(', ')}`,
    };
  }

  if (input.priceAmount !== undefined) {
    if (!Number.isInteger(input.priceAmount)) {
      return {
        field: 'priceAmount',
        message: 'priceAmount must be an integer number of minor units (paise)',
      };
    }

    // A free plan (0) is allowed; a negative price is not
    if (input.priceAmount < 0) {
      return { field: 'priceAmount', message: 'priceAmount must be 0 or greater' };
    }
  }

  if (input.currency !== undefined && !/^[A-Za-z]{3}$/.test(input.currency)) {
    return {
      field: 'currency',
      message: 'currency must be a 3-letter ISO 4217 code, e.g. INR',
    };
  }

  if (input.durationDays !== undefined) {
    if (!Number.isInteger(input.durationDays)) {
      return { field: 'durationDays', message: 'durationDays must be an integer' };
    }

    if (input.durationDays < 1) {
      return { field: 'durationDays', message: 'durationDays must be 1 or greater' };
    }
  }

  return null;
}

/**
 * Throws PlanValidationError when any supplied field is invalid.
 *
 * @param input - Partial set of plan fields
 * @throws PlanValidationError
 */
export function assertValidPlanInput(input: UpdatePlanInput): void {
  const issue = validatePlanInput(input);

  if (issue) {
    throw new PlanValidationError(issue.field, issue.message);
  }
}

// ---------------------------------------------------------------------------
// Prisma error translation
// ---------------------------------------------------------------------------

const PRISMA_UNIQUE_VIOLATION = 'P2002';
const PRISMA_RECORD_NOT_FOUND = 'P2025';
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003';
/** Raised when a required relation would be left dangling by a delete. */
const PRISMA_RELATION_VIOLATION = 'P2014';

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }

  return undefined;
}

/** Reads the column list Prisma attaches to a P2002. */
function uniqueViolationTargets(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;

  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }

  return typeof target === 'string' ? [target] : [];
}

/**
 * Converts a Prisma write failure on subscription_plans into one of this
 * module's errors. Anything unrecognized is returned untouched so genuine
 * faults still surface as 500s.
 */
function toPlanError(error: unknown, input: UpdatePlanInput): unknown {
  const code = prismaErrorCode(error);

  if (code === PRISMA_UNIQUE_VIOLATION) {
    const targets = uniqueViolationTargets(error).join(',');

    if (targets.includes('razorpay') && input.razorpayPlanId) {
      return new PlanCodeConflictError('razorpayPlanId', input.razorpayPlanId);
    }

    return new PlanCodeConflictError('code', input.code ?? '');
  }

  if (code === PRISMA_RECORD_NOT_FOUND) {
    return new PlanNotFoundError();
  }

  if (code === PRISMA_FOREIGN_KEY_VIOLATION || code === PRISMA_RELATION_VIOLATION) {
    return new PlanInUseError();
  }

  return error;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Retrieves a plan by ID.
 *
 * Delegates to the subscription service's read helper - plan reads have one
 * implementation.
 *
 * @param planId - UUID of the plan
 * @returns The plan, or null when not found
 */
export async function getPlan(planId: string): Promise<PlanData | null> {
  return getSubscriptionPlan(planId);
}

/**
 * Lists plans, ordered by name.
 *
 * @param activeOnly - When true, only plans that are currently sellable
 * @returns All matching plans
 */
export async function listPlans(activeOnly = false): Promise<PlanData[]> {
  return listSubscriptionPlans(activeOnly);
}

/**
 * Looks a plan up by its unique code.
 *
 * @param code - Plan code, matched exactly after trimming
 * @returns The plan, or null when no plan holds that code
 */
export async function getPlanByCode(code: string): Promise<PlanData | null> {
  const prisma = getPrisma();

  return prisma.subscriptionPlan.findUnique({ where: { code: code.trim() } });
}

/**
 * Lists plans for a single page, ordered by name, with the unpaginated total.
 *
 * @param options - Optional activeOnly filter and pagination window
 * @returns Page of plans plus the total matching count
 */
export async function listPlansPaginated(
  options: { activeOnly?: boolean; skip?: number; take?: number } = {}
): Promise<PlanListResult> {
  const prisma = getPrisma();

  const where = options.activeOnly ? { isActive: true } : {};

  const [plans, total] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.subscriptionPlan.count({ where }),
  ]);

  return { plans, total };
}

/**
 * Counts the subscriptions referencing a plan.
 *
 * This is what makes a plan undeletable, so it is also useful to surface on the
 * plan detail response.
 *
 * @param planId - UUID of the plan
 * @returns Number of subscriptions pointing at the plan
 */
export async function countPlanSubscriptions(planId: string): Promise<number> {
  const prisma = getPrisma();

  return prisma.subscription.count({ where: { planId } });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Normalizes the string fields that have a canonical stored form. */
function normalize<T extends UpdatePlanInput>(input: T): T {
  return {
    ...input,
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.code === undefined ? {} : { code: input.code.trim() }),
    ...(input.currency === undefined
      ? {}
      : { currency: input.currency.toUpperCase() }),
    ...(input.razorpayPlanId === undefined || input.razorpayPlanId === null
      ? {}
      : { razorpayPlanId: input.razorpayPlanId.trim() }),
  };
}

/**
 * Creates a subscription plan.
 *
 * @param input - Plan fields; currency defaults to INR, isActive to true
 * @returns The created plan
 * @throws PlanValidationError when a field breaks an invariant
 * @throws PlanCodeConflictError when the code (or razorpayPlanId) is taken
 */
export async function createPlan(input: CreatePlanInput): Promise<PlanData> {
  const prisma = getPrisma();
  const data = normalize(input);

  assertValidPlanInput(data);

  // Checked up front so the common case gets the explanatory message rather
  // than a translated constraint violation. The catch below still covers the
  // race between this read and the insert.
  const existing = await getPlanByCode(data.code as string);

  if (existing) {
    throw new PlanCodeConflictError('code', data.code as string);
  }

  try {
    return await prisma.subscriptionPlan.create({
      data: {
        name: data.name as string,
        code: data.code as string,
        billingInterval: data.billingInterval as BillingInterval,
        priceAmount: data.priceAmount as number,
        durationDays: data.durationDays as number,
        ...(data.currency === undefined ? {} : { currency: data.currency }),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        ...(data.razorpayPlanId === undefined
          ? {}
          : { razorpayPlanId: data.razorpayPlanId }),
      },
    });
  } catch (error) {
    throw toPlanError(error, data);
  }
}

/**
 * Updates a plan, touching only the supplied fields.
 *
 * @param planId - UUID of the plan
 * @param input - Fields to change
 * @returns The updated plan
 * @throws PlanValidationError when a field breaks an invariant
 * @throws PlanNotFoundError when no plan has that id
 * @throws PlanCodeConflictError when the new code (or razorpayPlanId) is taken
 */
export async function updatePlan(
  planId: string,
  input: UpdatePlanInput
): Promise<PlanData> {
  const prisma = getPrisma();
  const data = normalize(input);

  assertValidPlanInput(data);

  if (data.code !== undefined) {
    const existing = await getPlanByCode(data.code);

    if (existing && existing.id !== planId) {
      throw new PlanCodeConflictError('code', data.code);
    }
  }

  try {
    return await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.code === undefined ? {} : { code: data.code }),
        ...(data.billingInterval === undefined
          ? {}
          : { billingInterval: data.billingInterval }),
        ...(data.priceAmount === undefined ? {} : { priceAmount: data.priceAmount }),
        ...(data.currency === undefined ? {} : { currency: data.currency }),
        ...(data.durationDays === undefined
          ? {}
          : { durationDays: data.durationDays }),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        // Explicit null is meaningful here: it unlinks the Razorpay plan
        ...(data.razorpayPlanId === undefined
          ? {}
          : { razorpayPlanId: data.razorpayPlanId }),
      },
    });
  } catch (error) {
    throw toPlanError(error, data);
  }
}

/**
 * Retires a plan by clearing `isActive`.
 *
 * This is the supported alternative to deletion: the plan stops being sellable
 * while every subscription already bought against it keeps resolving.
 *
 * @param planId - UUID of the plan
 * @returns The deactivated plan
 * @throws PlanNotFoundError when no plan has that id
 */
export async function deactivatePlan(planId: string): Promise<PlanData> {
  const prisma = getPrisma();

  try {
    return await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive: false },
    });
  } catch (error) {
    throw toPlanError(error, {});
  }
}

/**
 * Hard-deletes a plan, but only while nothing references it.
 *
 * The reference count is checked first so the caller gets an explanation rather
 * than a constraint violation; the database's ON DELETE RESTRICT is the backstop
 * for a subscription created between the check and the delete.
 *
 * @param planId - UUID of the plan
 * @throws PlanInUseError when subscriptions reference the plan
 * @throws PlanNotFoundError when no plan has that id
 */
export async function deletePlan(planId: string): Promise<void> {
  const prisma = getPrisma();

  const subscriptionCount = await countPlanSubscriptions(planId);

  if (subscriptionCount > 0) {
    throw new PlanInUseError(subscriptionCount);
  }

  try {
    await prisma.subscriptionPlan.delete({ where: { id: planId } });
  } catch (error) {
    throw toPlanError(error, {});
  }
}
