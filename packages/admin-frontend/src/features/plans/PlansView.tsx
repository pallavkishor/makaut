'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PlanFormModal } from './PlanFormModal';
import { RetirePlanDialog } from './RetirePlanDialog';
import { listPlans, updatePlan } from '@/lib/api/plans';
import { formatDateTime } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { ActiveBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/Field';
import {
  EmptyState,
  ErrorState,
  FormError,
  SuccessNotice,
} from '@/components/ui/Feedback';
import { PageHeader, Panel } from '@/components/ui/PageHeader';
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
import { BILLING_INTERVAL_LABELS, type SubscriptionPlan } from '@/types';

/**
 * Subscription plan management.
 *
 * Prices are stored and sent as integer paise; the table renders rupees. Retiring
 * a plan goes through the deactivate-first dialog, because a plan that has been
 * sold cannot be deleted.
 */
export function PlansView() {
  const queryClient = useQueryClient();

  const [activeOnly, setActiveOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [retiring, setRetiring] = useState<SubscriptionPlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: queryKeys.plans.list(activeOnly),
    queryFn: () => listPlans(activeOnly),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => updatePlan(id, { isActive: true }),
    onSuccess: async (plan) => {
      setNotice(`“${plan.name}” is on sale again.`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.plans.all });
    },
  });

  const plans = plansQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Subscription plans"
        description="What a student buys. A subscription grants access to the whole catalogue, not to individual subjects."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New plan
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CheckboxField
          label="Active plans only"
          checked={activeOnly}
          onChange={setActiveOnly}
        />
        <Link
          href="/subscriptions"
          className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
        >
          Subscriptions →
        </Link>
      </div>

      {notice ? (
        <div className="mb-3">
          <SuccessNotice>{notice}</SuccessNotice>
        </div>
      ) : null}

      {plansQuery.isError ? (
        <div className="mb-3">
          <ErrorState
            error={plansQuery.error}
            title="Could not load plans"
            onRetry={() => void plansQuery.refetch()}
          />
        </div>
      ) : null}

      <div className="mb-3">
        <FormError error={reactivateMutation.error} />
      </div>

      <Panel title="Plans" description={`${plans.length} shown`}>
        <TableScroll>
          <Table caption="Subscription plans">
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Interval</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Duration</Th>
                <Th>State</Th>
                <Th>Updated</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {plans.map((plan) => (
                <Tr key={plan.id}>
                  <Td className="font-medium text-foreground">{plan.name}</Td>
                  <Td className="font-mono text-xs text-muted">{plan.code}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {BILLING_INTERVAL_LABELS[plan.billingInterval] ??
                      plan.billingInterval}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-foreground">
                    {formatPaise(plan.priceAmount, plan.currency)}
                    <span className="block text-xs font-normal text-muted">
                      {plan.priceAmount.toLocaleString('en-IN')} paise
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted">
                    {plan.durationDays} days
                  </Td>
                  <Td>
                    <ActiveBadge active={plan.isActive} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDateTime(plan.updatedAt)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/subscriptions?planId=${plan.id}`}
                        className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                      >
                        Subscribers
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(plan);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      {plan.isActive ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setNotice(null);
                            setRetiring(plan);
                          }}
                        >
                          Retire
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={
                            reactivateMutation.isPending &&
                            reactivateMutation.variables === plan.id
                          }
                          onClick={() => reactivateMutation.mutate(plan.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableScroll>

        {plansQuery.isPending ? <LoadingState label="Loading plans…" /> : null}

        {!plansQuery.isPending && plans.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Create a plan before granting anyone a subscription — a subscription has to point at one."
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New plan
              </Button>
            }
          />
        ) : null}
      </Panel>

      <PlanFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        plan={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <RetirePlanDialog
        key={retiring?.id ?? 'none'}
        plan={retiring}
        onClose={() => setRetiring(null)}
        onDone={setNotice}
      />
    </>
  );
}
