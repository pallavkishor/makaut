'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { extendSubscription } from '@/lib/api/subscriptions';
import {
  endOfDayIso,
  formatDateTime,
  toDateInputValue,
  validateSubscriptionDates,
} from '@/lib/dates';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import type { Subscription } from '@/types';

/** Moves the end of a subscription's current period later. */
export function ExtendSubscriptionModal({
  subscription,
  onClose,
}: {
  subscription: Subscription | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setError(undefined);
    setEndDate(
      subscription ? toDateInputValue(subscription.currentPeriodEnd) : ''
    );
  }, [subscription]);

  const mutation = useMutation({
    mutationFn: (variables: { id: string; endDate: string }) =>
      extendSubscription(variables.id, variables.endDate),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.students.all }),
      ]);
      onClose();
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!subscription) {
      return;
    }

    const dateErrors = validateSubscriptionDates(
      toDateInputValue(subscription.currentPeriodStart),
      endDate
    );

    if (dateErrors.endDate || dateErrors.startDate) {
      setError(dateErrors.endDate ?? dateErrors.startDate);
      return;
    }

    const nextEnd = endOfDayIso(endDate);

    if (
      new Date(nextEnd).getTime() <=
      new Date(subscription.currentPeriodEnd).getTime()
    ) {
      setError('Pick a date later than the current period end');
      return;
    }

    setError(undefined);
    mutation.mutate({ id: subscription.id, endDate: nextEnd });
  };

  return (
    <Modal
      open={subscription !== null}
      title="Extend subscription"
      description={
        subscription
          ? `Current period ends ${formatDateTime(subscription.currentPeriodEnd)}.`
          : undefined
      }
      size="sm"
      dismissible={!mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="extend-subscription-form"
            loading={mutation.isPending}
          >
            Extend
          </Button>
        </>
      }
    >
      <form id="extend-subscription-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-foreground">
          {subscription?.studentEmail ?? 'Student'} —{' '}
          {subscription?.planName ?? 'plan'}
        </p>
        <TextField
          label="New period end"
          type="date"
          value={endDate}
          required
          error={error}
          min={toDateInputValue(subscription?.currentPeriodEnd)}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <FormError error={mutation.error} />
      </form>
    </Modal>
  );
}
