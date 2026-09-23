'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StudentSelect } from './StudentSelect';
import { createSubscription } from '@/lib/api/subscriptions';
import {
  dateInputInDays,
  endOfDayIso,
  hasDateErrors,
  startOfDayIso,
  todayInputValue,
  validateSubscriptionDates,
  type SubscriptionDateErrors,
} from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormError, SuccessNotice } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/PageHeader';
import type { Student, SubscriptionPlan } from '@/types';

/**
 * Grants a student a subscription against a plan.
 *
 * Subscriptions are account-level, so this is "student + plan + period", not
 * "student + subject". Choosing a plan defaults the period end to the plan's
 * `durationDays`, which is what the admin almost always wants; the date stays
 * editable for the cases where it is not.
 *
 * Dates are validated before the request, and nothing entered is cleared when
 * validation or the server says no.
 */

interface FieldErrors extends SubscriptionDateErrors {
  studentId?: string;
  planId?: string;
}

export function CreateSubscriptionForm({
  students,
  plans,
  defaultStudentId = '',
  defaultPlanId = '',
}: {
  students: Student[];
  plans: SubscriptionPlan[];
  defaultStudentId?: string;
  defaultPlanId?: string;
}) {
  const queryClient = useQueryClient();

  const [studentId, setStudentId] = useState(defaultStudentId);
  const [planId, setPlanId] = useState(defaultPlanId);
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState(false);

  const mutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: async () => {
      setCreated(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.students.all }),
      ]);
    },
  });

  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;

  const handlePlanChange = (nextPlanId: string) => {
    setPlanId(nextPlanId);

    const plan = plans.find((candidate) => candidate.id === nextPlanId);

    // Default the window to the plan's own duration.
    if (plan && startDate) {
      setEndDate(dateInputInDays(plan.durationDays, new Date(startOfDayIso(startDate))));
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreated(false);

    const nextErrors: FieldErrors = validateSubscriptionDates(startDate, endDate);

    if (!studentId) {
      nextErrors.studentId = 'Select a student';
    }

    if (!planId) {
      nextErrors.planId = 'Select a plan';
    }

    setErrors(nextErrors);

    if (nextErrors.studentId || nextErrors.planId || hasDateErrors(nextErrors)) {
      return;
    }

    mutation.mutate({
      studentId,
      planId,
      startDate: startOfDayIso(startDate),
      endDate: endOfDayIso(endDate),
    });
  };

  return (
    <Panel
      title="Create subscription"
      description="Account-level access for the chosen period, recorded against a plan."
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4" noValidate>
        {created ? <SuccessNotice>Subscription created.</SuccessNotice> : null}
        <FormError error={mutation.error} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StudentSelect
            label="Student"
            value={studentId}
            students={students}
            required
            error={errors.studentId}
            onChange={setStudentId}
          />

          <div className="space-y-2">
            <SelectField
              label="Plan"
              value={planId}
              required
              error={errors.planId}
              hint={
                selectedPlan
                  ? `${formatPaise(selectedPlan.priceAmount, selectedPlan.currency)} · ${selectedPlan.durationDays} days`
                  : plans.length === 0
                    ? 'No plans exist yet — create one first'
                    : undefined
              }
              onChange={(event) => handlePlanChange(event.target.value)}
            >
              <option value="">Select a plan…</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </SelectField>

            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Period start"
                type="date"
                value={startDate}
                required
                error={errors.startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
              <TextField
                label="Period end"
                type="date"
                value={endDate}
                required
                error={errors.endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={mutation.isPending}>
            Create subscription
          </Button>
          <p className="text-xs text-muted">
            Access runs from the start of the first day to the end of the last.
          </p>
        </div>
      </form>
    </Panel>
  );
}
