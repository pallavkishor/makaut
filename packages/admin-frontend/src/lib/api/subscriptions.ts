import { apiRequest } from '../apiClient';
import { unwrapObject, unwrapPaginated } from './normalize';
import type { Paginated, Subscription, SubscriptionStatus } from '@/types';

/**
 * Subscription management (`packages/backend/src/routes/adminSubscriptionRoutes.ts`).
 *
 * Subscriptions are account-level: one row grants access to everything, against
 * a `planId`. `status` is stored on the row, not derived from the dates, and the
 * period is `currentPeriodStart` / `currentPeriodEnd`.
 */

export interface SubscriptionFilters {
  studentId?: string;
  planId?: string;
  status?: SubscriptionStatus;
}

export interface ListSubscriptionsParams extends SubscriptionFilters {
  page?: number;
  pageSize?: number;
}

export async function listSubscriptions({
  page = 1,
  pageSize = 50,
  ...filters
}: ListSubscriptionsParams = {}): Promise<Paginated<Subscription>> {
  const body = await apiRequest<unknown>('/api/admin/subscriptions', {
    query: {
      studentId: filters.studentId,
      planId: filters.planId,
      status: filters.status,
      page,
      pageSize,
    },
  });

  return unwrapPaginated<Subscription>(body, 'subscriptions', { page, pageSize });
}

export async function getSubscription(id: string): Promise<Subscription> {
  const body = await apiRequest<unknown>(`/api/admin/subscriptions/${id}`);

  return unwrapObject<Subscription>(body, 'subscription');
}

export interface CreateSubscriptionInput {
  studentId: string;
  planId: string;
  /** ISO timestamps. The server names these `startDate` / `endDate` on create. */
  startDate: string;
  endDate: string;
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<Subscription> {
  const body = await apiRequest<unknown>('/api/admin/subscriptions', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Subscription>(body, 'subscription');
}

/** Moves the end of the current period later. */
export async function extendSubscription(
  id: string,
  endDate: string
): Promise<Subscription> {
  const body = await apiRequest<unknown>(`/api/admin/subscriptions/${id}`, {
    method: 'PUT',
    body: { endDate },
  });

  return unwrapObject<Subscription>(body, 'subscription');
}

/** Cancels immediately: the row moves to CANCELLED and access is revoked. */
export async function cancelSubscription(id: string): Promise<Subscription> {
  const body = await apiRequest<unknown>(`/api/admin/subscriptions/${id}`, {
    method: 'DELETE',
  });

  return unwrapObject<Subscription>(body, 'subscription');
}
