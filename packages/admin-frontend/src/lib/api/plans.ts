import { ApiError } from '../apiError';
import { apiRequest } from '../apiClient';
import { unwrapList, unwrapObject } from './normalize';
import type { BillingInterval, SubscriptionPlan } from '@/types';

/**
 * Subscription plan management (`packages/backend/src/routes/adminPlanRoutes.ts`).
 *
 * `priceAmount` is an integer in minor units (paise) in both directions. Never
 * send a float.
 *
 * Plans that students have bought must keep resolving forever, so DELETE
 * deactivates by default and `?hard=true` on a plan that is in use is refused
 * with 409.
 */

const MAX_PAGE_SIZE = 100;

export async function listPlans(
  activeOnly = false
): Promise<SubscriptionPlan[]> {
  const collected: SubscriptionPlan[] = [];

  for (let page = 1; ; page += 1) {
    const body = await apiRequest<unknown>('/api/admin/plans', {
      query: {
        // `activeOnly=false` reads as "no filter" server-side; omit it instead.
        activeOnly: activeOnly ? true : undefined,
        page,
        pageSize: MAX_PAGE_SIZE,
      },
    });

    const items = unwrapList<SubscriptionPlan>(body, 'plans');
    collected.push(...items);

    if (items.length < MAX_PAGE_SIZE) {
      return collected;
    }
  }
}

/** Includes `subscriptionCount`, which decides whether a hard delete is possible. */
export async function getPlan(id: string): Promise<SubscriptionPlan> {
  const body = await apiRequest<unknown>(`/api/admin/plans/${id}`);

  return unwrapObject<SubscriptionPlan>(body, 'plan');
}

export interface CreatePlanInput {
  name: string;
  code: string;
  billingInterval: BillingInterval;
  /** Integer minor units (paise). */
  priceAmount: number;
  durationDays: number;
  currency?: string;
  isActive?: boolean;
}

export async function createPlan(
  input: CreatePlanInput
): Promise<SubscriptionPlan> {
  const body = await apiRequest<unknown>('/api/admin/plans', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<SubscriptionPlan>(body, 'plan');
}

/** Partial update. `isActive: true` is how a deactivated plan goes back on sale. */
export type UpdatePlanInput = Partial<CreatePlanInput>;

export async function updatePlan(
  id: string,
  input: UpdatePlanInput
): Promise<SubscriptionPlan> {
  const body = await apiRequest<unknown>(`/api/admin/plans/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<SubscriptionPlan>(body, 'plan');
}

export interface PlanDeletionResult {
  /** False when the plan was deactivated rather than removed. */
  removed: boolean;
  message: string;
  plan?: SubscriptionPlan;
}

/**
 * Retires a plan.
 *
 * The default is deactivation, which is the only safe option once a plan has
 * been sold: existing subscriptions keep resolving and the plan simply stops
 * being offered. `hard: true` asks for real removal and answers 409 when any
 * subscription references it.
 */
export async function deletePlan(
  id: string,
  { hard = false }: { hard?: boolean } = {}
): Promise<PlanDeletionResult> {
  const body = await apiRequest<unknown>(`/api/admin/plans/${id}`, {
    method: 'DELETE',
    query: { hard: hard ? true : undefined },
  });

  const message =
    body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : hard
        ? 'Subscription plan deleted.'
        : 'Subscription plan deactivated.';

  const plan =
    body && typeof body === 'object' && 'plan' in body
      ? unwrapObject<SubscriptionPlan>(body, 'plan')
      : undefined;

  return { removed: hard, message, plan };
}

/**
 * True when a failed hard delete was refused because the plan is in use, which
 * is the case where the admin should be steered to deactivation instead.
 */
export function isPlanInUseError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

/** Number of subscriptions the 409 reported, when it included one. */
export function planInUseSubscriptionCount(error: unknown): number | null {
  if (!isPlanInUseError(error)) {
    return null;
  }

  const count = error.details?.subscriptionCount;

  return typeof count === 'number' ? count : null;
}
