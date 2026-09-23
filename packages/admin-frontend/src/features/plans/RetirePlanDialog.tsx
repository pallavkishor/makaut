'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  deletePlan,
  getPlan,
  isPlanInUseError,
  planInUseSubscriptionCount,
} from '@/lib/api/plans';
import { toErrorMessage } from '@/lib/apiError';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import type { SubscriptionPlan } from '@/types';

/**
 * Retires a plan: deactivate, or delete outright.
 *
 * Deactivation is the default and the safe option - `subscriptions.plan_id` is
 * ON DELETE RESTRICT, so a plan students have bought has to keep resolving
 * forever. A hard delete of a plan in use comes back as 409; when it does, the
 * dialog surfaces the server's own message and steers the admin to deactivation.
 *
 * The subscription count is fetched up front, so in the common case the admin
 * never meets the 409 at all - the option simply is not offered.
 */
export function RetirePlanDialog({
  plan,
  onClose,
  onDone,
}: {
  /** Null closes the dialog. */
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [hard, setHard] = useState(false);

  const countQuery = useQuery({
    queryKey: [...queryKeys.plans.detail(plan?.id ?? ''), 'subscription-count'],
    queryFn: async () => {
      const detail = await getPlan((plan as SubscriptionPlan).id);

      return detail.subscriptionCount ?? 0;
    },
    enabled: plan !== null,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (variables: { id: string; hard: boolean }) =>
      deletePlan(variables.id, { hard: variables.hard }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all }),
      ]);
      onDone(result.message);
      onClose();
    },
  });

  if (!plan) {
    return null;
  }

  const refusedCount = planInUseSubscriptionCount(mutation.error);
  const knownCount = refusedCount ?? countQuery.data ?? null;
  const inUse = (knownCount ?? 0) > 0;
  const refused = isPlanInUseError(mutation.error);
  const canHardDelete = !inUse && !refused;

  return (
    <Modal
      open
      title={`Retire “${plan.name}”?`}
      size="md"
      dismissible={!mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Keep it as is
          </Button>
          {hard && canHardDelete ? (
            <Button
              variant="danger"
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ id: plan.id, hard: true })}
            >
              Delete permanently
            </Button>
          ) : (
            <Button
              loading={mutation.isPending}
              disabled={!plan.isActive}
              onClick={() => mutation.mutate({ id: plan.id, hard: false })}
            >
              {plan.isActive ? 'Deactivate plan' : 'Already inactive'}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-foreground">
        Deactivating takes the plan off sale. Students already subscribed keep their
        access, and their subscription history stays intact.
      </p>

      {countQuery.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-3.5 w-3.5" />
          Checking how many subscriptions use this plan…
        </p>
      ) : null}

      {knownCount !== null ? (
        <p className="mt-3 text-sm text-foreground">
          {inUse ? (
            <>
              <span className="font-semibold tabular-nums">
                {knownCount.toLocaleString('en-IN')}
              </span>{' '}
              subscription{knownCount === 1 ? '' : 's'} reference this plan, so it
              cannot be deleted — only deactivated.
            </>
          ) : (
            'No subscriptions reference this plan yet.'
          )}
        </p>
      ) : null}

      {refused ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold text-amber-900">
            The server refused to delete this plan.
          </p>
          <p className="mt-1 text-sm text-amber-900">
            {toErrorMessage(mutation.error)}
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Deactivate it instead — that is the supported way to retire a plan that
            has been sold.
          </p>
        </div>
      ) : null}

      {canHardDelete ? (
        <div className="mt-3 border-t border-border pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={hard}
              onChange={(event) => setHard(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border-strong text-red-600 focus:ring-2 focus:ring-red-600"
            />
            <span>
              <span className="font-medium text-foreground">
                Delete the plan permanently instead
              </span>
              <span className="block text-xs text-muted">
                Only possible while nothing references it. Deactivation is
                reversible; this is not.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {mutation.error && !refused ? (
        <div className="mt-3">
          <FormError error={mutation.error} />
        </div>
      ) : null}
    </Modal>
  );
}
