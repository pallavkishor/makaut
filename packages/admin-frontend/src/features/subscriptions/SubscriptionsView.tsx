'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CreateSubscriptionForm } from './CreateSubscriptionForm';
import { ExtendSubscriptionModal } from './ExtendSubscriptionModal';
import { StudentSelect } from './StudentSelect';
import { listPlans } from '@/lib/api/plans';
import { listStudents } from '@/lib/api/students';
import { cancelSubscription, listSubscriptions } from '@/lib/api/subscriptions';
import { formatDate, formatDateTime } from '@/lib/dates';
import { queryKeys } from '@/lib/queryKeys';
import { SubscriptionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectField } from '@/components/ui/Field';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHeader, Panel } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingState } from '@/components/ui/Spinner';
import {
  Table,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui/Table';
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
  type Subscription,
  type SubscriptionStatus,
} from '@/types';

/** Options list size for the student and plan selectors. */
const SELECTOR_PAGE_SIZE = 200;
const PAGE_SIZE = 50;

/** Statuses where cancelling would not change anything. */
const TERMINAL_STATUSES: SubscriptionStatus[] = ['CANCELLED', 'EXPIRED', 'FAILED'];

/**
 * Subscription administration.
 *
 * Subscriptions are account-level and point at a plan, so the filters are student,
 * plan and status. Status is the stored enum on the row - PENDING, ACTIVE,
 * EXPIRED, CANCELLED, FAILED - rather than something inferred from the dates, so
 * a row that failed payment reads as FAILED even though its window is still open.
 */
export function SubscriptionsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const studentFilter = searchParams.get('studentId') ?? '';
  const planFilter = searchParams.get('planId') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const statusFilter = (SUBSCRIPTION_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as SubscriptionStatus)
    : '';

  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toExtend, setToExtend] = useState<Subscription | null>(null);
  const [toCancel, setToCancel] = useState<Subscription | null>(null);

  const studentsQuery = useQuery({
    queryKey: queryKeys.students.list(1, SELECTOR_PAGE_SIZE),
    queryFn: () => listStudents({ page: 1, pageSize: SELECTOR_PAGE_SIZE }),
  });

  const plansQuery = useQuery({
    queryKey: queryKeys.plans.list(false),
    queryFn: () => listPlans(false),
  });

  const filters = {
    studentId: studentFilter || undefined,
    planId: planFilter || undefined,
    status: statusFilter || undefined,
  };

  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions.list(filters, page),
    queryFn: () => listSubscriptions({ ...filters, page, pageSize: PAGE_SIZE }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelSubscription(id),
    onSuccess: async () => {
      setToCancel(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.students.all }),
      ]);
    },
  });

  const students = studentsQuery.data?.items ?? [];
  const plans = plansQuery.data ?? [];
  const subscriptions = subscriptionsQuery.data?.items ?? [];
  const pagination = subscriptionsQuery.data?.pagination;

  const applyFilters = (next: {
    studentId?: string;
    planId?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    const resolved = {
      studentId: next.studentId ?? studentFilter,
      planId: next.planId ?? planFilter,
      status: next.status ?? statusFilter,
    };

    for (const [key, value] of Object.entries(resolved)) {
      if (value) {
        params.set(key, value);
      }
    }

    setPage(1);
    const query = params.toString();
    router.replace(query ? `/subscriptions?${query}` : '/subscriptions');
  };

  const filtersActive = Boolean(studentFilter || planFilter || statusFilter);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Account-level access, recorded against a plan. One subscription covers the whole catalogue."
        actions={
          <>
            <Link
              href="/plans"
              className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
            >
              Plans →
            </Link>
            <Button
              variant={showCreateForm ? 'secondary' : 'primary'}
              onClick={() => setShowCreateForm((open) => !open)}
              aria-expanded={showCreateForm}
            >
              {showCreateForm ? 'Hide create form' : 'New subscription'}
            </Button>
          </>
        }
      />

      {showCreateForm ? (
        <div className="mb-4">
          <CreateSubscriptionForm
            students={students}
            plans={plans}
            defaultStudentId={studentFilter}
            defaultPlanId={planFilter}
          />
        </div>
      ) : null}

      <div className="mb-4">
        <Panel
          title="Filters"
          description="Narrow the list by student, plan or status"
          actions={
            filtersActive ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPage(1);
                  router.replace('/subscriptions');
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        >
          <div className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-3">
            <StudentSelect
              label="Student"
              value={studentFilter}
              students={students}
              anyOptionLabel="All students"
              onChange={(studentId) => applyFilters({ studentId })}
            />
            <div>
              <SelectField
                label="Plan"
                value={planFilter}
                onChange={(event) => applyFilters({ planId: event.target.value })}
              >
                <option value="">All plans</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <SelectField
                label="Status"
                value={statusFilter}
                onChange={(event) => applyFilters({ status: event.target.value })}
              >
                <option value="">All statuses</option>
                {SUBSCRIPTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {SUBSCRIPTION_STATUS_LABELS[status]}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </Panel>
      </div>

      {subscriptionsQuery.isError ? (
        <div className="mb-3">
          <ErrorState
            error={subscriptionsQuery.error}
            title="Could not load subscriptions"
            onRetry={() => void subscriptionsQuery.refetch()}
          />
        </div>
      ) : null}

      <Panel
        title="All subscriptions"
        description={pagination ? `${pagination.total} matching` : undefined}
      >
        <TableScroll>
          <Table caption="Subscriptions">
            <Thead>
              <tr>
                <Th>Student</Th>
                <Th>Plan</Th>
                <Th>Period start</Th>
                <Th>Period end</Th>
                <Th>Status</Th>
                <Th>Cancelled</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {subscriptions.map((subscription) => {
                const terminal = TERMINAL_STATUSES.includes(subscription.status);

                return (
                  <Tr key={subscription.id}>
                    <Td className="font-medium text-foreground">
                      {subscription.studentEmail ?? subscription.studentId}
                    </Td>
                    <Td className="text-foreground">
                      {subscription.planName ?? subscription.planId}
                      {subscription.planCode ? (
                        <span className="block font-mono text-xs text-muted">
                          {subscription.planCode}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDate(subscription.currentPeriodStart)}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDateTime(subscription.currentPeriodEnd)}
                    </Td>
                    <Td>
                      <SubscriptionStatusBadge status={subscription.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {subscription.cancelledAt
                        ? formatDateTime(subscription.cancelledAt)
                        : '—'}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setToExtend(subscription)}
                        >
                          Extend
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={terminal}
                          title={
                            terminal
                              ? `Already ${SUBSCRIPTION_STATUS_LABELS[
                                  subscription.status
                                ].toLowerCase()}`
                              : undefined
                          }
                          onClick={() => {
                            cancelMutation.reset();
                            setToCancel(subscription);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableScroll>

        {subscriptionsQuery.isPending ? (
          <LoadingState label="Loading subscriptions…" />
        ) : null}

        {!subscriptionsQuery.isPending && subscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions found"
            description={
              filtersActive
                ? 'No subscriptions match the current filters.'
                : 'Create one to grant a student access to the catalogue.'
            }
          />
        ) : null}

        {pagination && pagination.total > PAGE_SIZE ? (
          <Pagination
            pagination={pagination}
            disabled={subscriptionsQuery.isFetching}
            onPageChange={setPage}
          />
        ) : null}
      </Panel>

      <ExtendSubscriptionModal
        subscription={toExtend}
        onClose={() => setToExtend(null)}
      />

      <ConfirmDialog
        open={toCancel !== null}
        title="Cancel this subscription now?"
        confirmLabel="Cancel subscription"
        pending={cancelMutation.isPending}
        error={cancelMutation.error}
        onCancel={() => setToCancel(null)}
        onConfirm={() => {
          if (toCancel) {
            cancelMutation.mutate(toCancel.id);
          }
        }}
      >
        <p className="text-sm text-foreground">
          {toCancel?.studentEmail ?? 'This student'} will lose access granted by{' '}
          <span className="font-semibold">{toCancel?.planName ?? 'this plan'}</span>.
        </p>
        <p className="mt-2 text-sm font-medium text-red-700">
          The status moves to Cancelled and access is revoked immediately.
        </p>
      </ConfirmDialog>
    </>
  );
}
