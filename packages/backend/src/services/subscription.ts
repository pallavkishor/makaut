import {
  PrismaClient,
  Prisma,
  Subscription,
  SubscriptionStatus,
  BillingInterval,
} from '@prisma/client';
import { getDatabaseClient } from '../config/database';

/**
 * Subscription Service
 *
 * Subscriptions are ACCOUNT level after the schema redesign: a student holds a
 * subscription to a SubscriptionPlan, which grants access to the whole
 * catalogue. They are no longer scoped to a single subject.
 *
 * Access is granted when status = ACTIVE and the current time falls inside
 * [current_period_start, current_period_end].
 *
 * TODO(phase2): Razorpay order/subscription lifecycle (razorpay_* columns, the
 * payments table and webhook reconciliation) is not wired up yet - the columns
 * exist, nothing writes them.
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

export interface SubscriptionData {
  id: string;
  studentId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  razorpaySubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionFilters {
  studentId?: string;
  planId?: string;
  status?: SubscriptionStatus;
  activeOnly?: boolean;
}

export interface SubscriptionPlanData {
  id: string;
  name: string;
  code: string;
  billingInterval: BillingInterval;
  priceAmount: number;
  currency: string;
  durationDays: number;
  isActive: boolean;
  razorpayPlanId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a Prisma row onto the service's DTO. */
function toSubscriptionData(subscription: Subscription): SubscriptionData {
  return {
    id: subscription.id,
    studentId: subscription.studentId,
    planId: subscription.planId,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelledAt: subscription.cancelledAt,
    razorpaySubscriptionId: subscription.razorpaySubscriptionId,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

/** `where` fragment matching subscriptions that grant access right now. */
function activeWhere(currentTime: Date): Prisma.SubscriptionWhereInput {
  return {
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: { lte: currentTime },
    currentPeriodEnd: { gte: currentTime },
  };
}

/**
 * Plan lookup
 *
 * TODO(phase2): plan CRUD belongs in an admin plan service. This read helper
 * exists so subscription writes can validate the plan and API responses can
 * name it.
 */
export async function getSubscriptionPlan(
  planId: string
): Promise<SubscriptionPlanData | null> {
  const prisma = getPrisma();

  return prisma.subscriptionPlan.findUnique({ where: { id: planId } });
}

/**
 * Lists subscription plans, newest-priced-first is not meaningful so plans are
 * ordered by name.
 *
 * @param activeOnly - When true, only plans that are currently sellable
 */
export async function listSubscriptionPlans(
  activeOnly = false
): Promise<SubscriptionPlanData[]> {
  const prisma = getPrisma();

  return prisma.subscriptionPlan.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { name: 'asc' },
  });
}

/**
 * Task 5.1: Create subscription with date validation and storage
 *
 * Creates an account-level subscription against a plan, validating that the
 * period end is after the period start.
 *
 * @param studentId - UUID of the student
 * @param planId - UUID of the subscription plan
 * @param currentPeriodStart - Start of the paid period
 * @param currentPeriodEnd - End of the paid period
 * @param status - Initial status, defaults to ACTIVE for admin-granted access
 * @returns Promise resolving to created subscription
 * @throws Error if end date is not after start date
 * @throws Error if student or plan does not exist (Prisma foreign key constraint)
 *
 * Requirements: 3.1, 3.2, 8.2, 8.3, 8.4, 8.5
 */
export async function createSubscription(
  studentId: string,
  planId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  status: SubscriptionStatus = SubscriptionStatus.ACTIVE
): Promise<SubscriptionData> {
  const prisma = getPrisma();

  // Validate that end date is after start date (also enforced by a CHECK
  // constraint on the table)
  if (currentPeriodEnd <= currentPeriodStart) {
    throw new Error('End date must be after start date');
  }

  const subscription = await prisma.subscription.create({
    data: {
      studentId,
      planId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
    },
  });

  return toSubscriptionData(subscription);
}

/**
 * Task 5.3: Active subscription determination logic
 *
 * A subscription grants access when it is ACTIVE and the current time falls
 * inside its paid period.
 *
 * @param subscription - The subscription to check
 * @param currentTime - Optional current time (defaults to now, useful for testing)
 * @returns true if subscription is active, false otherwise
 *
 * Requirements: 3.3
 */
export function isSubscriptionActive(
  subscription: Pick<
    Subscription,
    'status' | 'currentPeriodStart' | 'currentPeriodEnd'
  >,
  currentTime: Date = new Date()
): boolean {
  return (
    subscription.status === SubscriptionStatus.ACTIVE &&
    currentTime >= subscription.currentPeriodStart &&
    currentTime <= subscription.currentPeriodEnd
  );
}

/**
 * Task 5.3: Get active subscriptions for a student
 *
 * @param studentId - UUID of the student
 * @param currentTime - Optional current time (defaults to now)
 * @returns Promise resolving to array of active subscriptions
 *
 * Requirements: 3.3, 3.4
 */
export async function getActiveSubscriptions(
  studentId: string,
  currentTime: Date = new Date()
): Promise<SubscriptionData[]> {
  const prisma = getPrisma();

  const subscriptions = await prisma.subscription.findMany({
    where: {
      studentId,
      ...activeWhere(currentTime),
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  return subscriptions.map(toSubscriptionData);
}

/**
 * Task 5.5: Check whether a student currently has platform access
 *
 * Account-level: one active subscription unlocks the catalogue.
 *
 * @param studentId - UUID of the student
 * @param currentTime - Optional current time (defaults to now)
 * @returns Promise resolving to true if an active subscription exists
 *
 * Requirements: 3.5, 3.6, 3.8
 */
export async function hasActiveSubscription(
  studentId: string,
  currentTime: Date = new Date()
): Promise<boolean> {
  const prisma = getPrisma();

  const count = await prisma.subscription.count({
    where: {
      studentId,
      ...activeWhere(currentTime),
    },
  });

  return count > 0;
}

/**
 * Task 5.7: Extend subscription by moving the period end
 *
 * A subscription that had lapsed becomes ACTIVE again when the new period
 * covers the current time.
 *
 * @param subscriptionId - UUID of the subscription to extend
 * @param newEndDate - New end of the paid period
 * @param currentTime - Optional current time (defaults to now)
 * @returns Promise resolving to updated subscription
 * @throws Error if subscription not found
 * @throws Error if new end date is not after the period start
 *
 * Requirements: 8.8, 8.9
 */
export async function extendSubscription(
  subscriptionId: string,
  newEndDate: Date,
  currentTime: Date = new Date()
): Promise<SubscriptionData> {
  const prisma = getPrisma();

  const existingSubscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!existingSubscription) {
    throw new Error('Subscription not found');
  }

  if (newEndDate <= existingSubscription.currentPeriodStart) {
    throw new Error('New end date must be after start date');
  }

  // Reinstate a subscription that had expired, but never resurrect one that was
  // explicitly cancelled or failed - those need a new subscription.
  const reinstate =
    existingSubscription.status === SubscriptionStatus.EXPIRED &&
    newEndDate >= currentTime;

  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      currentPeriodEnd: newEndDate,
      ...(reinstate ? { status: SubscriptionStatus.ACTIVE } : {}),
    },
  });

  return toSubscriptionData(subscription);
}

/**
 * Task 5.8: Cancel subscription immediately
 *
 * Sets status to CANCELLED, which revokes access at once, and records when.
 * The paid period is also truncated to now when the period had already started,
 * so the stored window matches reality.
 *
 * @param subscriptionId - UUID of the subscription to cancel
 * @param currentTime - Optional current time (defaults to now)
 * @returns Promise resolving to updated subscription
 * @throws Error if subscription not found
 *
 * Requirements: 8.10, 8.11
 */
export async function cancelSubscription(
  subscriptionId: string,
  currentTime: Date = new Date()
): Promise<SubscriptionData> {
  const prisma = getPrisma();

  const existingSubscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!existingSubscription) {
    // Surfaced as a 404 by the admin routes, same as Prisma's P2025 would be
    throw new Error('Subscription not found');
  }

  // current_period_end > current_period_start is a CHECK constraint, so only
  // truncate the period when the window has actually opened.
  const truncatePeriod = currentTime > existingSubscription.currentPeriodStart;

  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: currentTime,
      ...(truncatePeriod ? { currentPeriodEnd: currentTime } : {}),
    },
  });

  return toSubscriptionData(subscription);
}

/**
 * Builds the Prisma `where` clause shared by the listing helpers.
 */
function buildSubscriptionWhere(
  filters: SubscriptionFilters | undefined,
  currentTime: Date
): Prisma.SubscriptionWhereInput {
  return {
    ...(filters?.studentId ? { studentId: filters.studentId } : {}),
    ...(filters?.planId ? { planId: filters.planId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.activeOnly ? activeWhere(currentTime) : {}),
  };
}

/**
 * Task 5.9: List subscriptions with filtering
 *
 * @param filters - Optional studentId / planId / status / activeOnly filters
 * @returns Promise resolving to array of subscriptions matching the filters
 *
 * Requirements: 8.6, 8.7
 */
export async function listSubscriptions(
  filters?: SubscriptionFilters
): Promise<SubscriptionData[]> {
  const prisma = getPrisma();

  const subscriptions = await prisma.subscription.findMany({
    where: buildSubscriptionWhere(filters, new Date()),
    orderBy: { createdAt: 'desc' },
  });

  return subscriptions.map(toSubscriptionData);
}

/**
 * Task 5.5: Middleware helper - Verify platform access with appropriate error
 *
 * @param studentId - UUID of the student
 * @param currentTime - Optional current time (defaults to now)
 * @throws Error with message 'No active subscription' if access should be denied
 *
 * Requirements: 3.5, 3.6, 3.8
 */
export async function verifySubscriptionAccess(
  studentId: string,
  currentTime: Date = new Date()
): Promise<void> {
  const hasAccess = await hasActiveSubscription(studentId, currentTime);

  if (!hasAccess) {
    throw new Error('No active subscription');
  }
}

/**
 * Task 9.5: Single subscription retrieval and paginated admin listing
 *
 * Requirements: 8.6, 8.7
 */

export interface SubscriptionPage {
  subscriptions: SubscriptionData[];
  total: number;
}

/**
 * Retrieves a subscription by ID.
 *
 * @param subscriptionId - UUID of the subscription
 * @returns Promise resolving to the subscription, or null when not found
 */
export async function getSubscription(
  subscriptionId: string
): Promise<SubscriptionData | null> {
  const prisma = getPrisma();

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    return null;
  }

  return toSubscriptionData(subscription);
}

/**
 * Lists subscriptions for a single page using the same filters as
 * listSubscriptions(), and returns the unpaginated total.
 *
 * @param filters - Optional filters plus a pagination window
 * @returns Page of subscriptions plus the total matching count
 */
export async function listSubscriptionsPaginated(
  filters?: SubscriptionFilters & { skip?: number; take?: number }
): Promise<SubscriptionPage> {
  const prisma = getPrisma();

  const where = buildSubscriptionWhere(filters, new Date());

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: filters?.skip,
      take: filters?.take,
    }),
    prisma.subscription.count({ where }),
  ]);

  return {
    subscriptions: subscriptions.map(toSubscriptionData),
    total,
  };
}
