'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createPlan,
  updatePlan,
  type CreatePlanInput,
} from '@/lib/api/plans';
import { formatPaise, paiseToRupeeInput, rupeesToPaise } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import {
  BILLING_INTERVALS,
  BILLING_INTERVAL_LABELS,
  type BillingInterval,
  type SubscriptionPlan,
} from '@/types';

/**
 * Create / edit form for a subscription plan.
 *
 * The price is typed in rupees and sent in paise as an integer. The conversion
 * happens on the decimal string, so `499.99` becomes exactly 49999 rather than
 * whatever `499.99 * 100` evaluates to in binary floating point.
 *
 * `code` is the stable identifier a payment provider and the student app key
 * off, so it is only editable deliberately.
 */
export function PlanFormModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  /** Null creates a new plan. */
  plan: SubscriptionPlan | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = plan !== null;

  const [name, setName] = useState(plan?.name ?? '');
  const [code, setCode] = useState(plan?.code ?? '');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    plan?.billingInterval ?? 'MONTHLY'
  );
  const [priceInput, setPriceInput] = useState(
    plan ? paiseToRupeeInput(plan.priceAmount) : ''
  );
  const [durationDays, setDurationDays] = useState(
    plan ? String(plan.durationDays) : '30'
  );
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [errors, setErrors] = useState<{
    name?: string;
    code?: string;
    price?: string;
    durationDays?: string;
  }>({});

  const mutation = useMutation({
    mutationFn: (input: CreatePlanInput) =>
      isEditing ? updatePlan(plan.id, input) : createPlan(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.plans.all });
      onClose();
    },
  });

  const parsedPrice = rupeesToPaise(priceInput);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: typeof errors = {};
    const trimmedName = name.trim();
    const trimmedCode = code.trim();

    if (!trimmedName) {
      nextErrors.name = 'Plan name is required';
    }

    if (!trimmedCode) {
      nextErrors.code = 'Plan code is required';
    }

    if (!parsedPrice.ok) {
      nextErrors.price = parsedPrice.error;
    }

    const days = Number(durationDays);

    if (!Number.isInteger(days) || days < 1) {
      nextErrors.durationDays = 'Duration must be a whole number of days, 1 or more';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !parsedPrice.ok) {
      return;
    }

    mutation.mutate({
      name: trimmedName,
      code: trimmedCode,
      billingInterval,
      // Integer minor units, never a float.
      priceAmount: parsedPrice.paise,
      durationDays: days,
      isActive,
    });
  };

  return (
    <Modal
      open={open}
      title={isEditing ? 'Edit plan' : 'New subscription plan'}
      size="md"
      dismissible={!mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" loading={mutation.isPending}>
            {isEditing ? 'Save changes' : 'Create plan'}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit} className="space-y-3" noValidate>
        <TextField
          label="Plan name"
          value={name}
          required
          maxLength={255}
          placeholder="e.g. Full access — yearly"
          error={errors.name}
          onChange={(event) => setName(event.target.value)}
        />

        <TextField
          label="Plan code"
          value={code}
          required
          maxLength={100}
          placeholder="e.g. FULL_YEARLY"
          hint="Stable identifier used by billing. Changing it on a live plan affects integrations."
          error={errors.code}
          onChange={(event) => setCode(event.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Billing interval"
            value={billingInterval}
            required
            onChange={(event) =>
              setBillingInterval(event.target.value as BillingInterval)
            }
          >
            {BILLING_INTERVALS.map((interval) => (
              <option key={interval} value={interval}>
                {BILLING_INTERVAL_LABELS[interval]}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Duration (days)"
            value={durationDays}
            required
            inputMode="numeric"
            hint="How long one purchase grants access for."
            error={errors.durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
        </div>

        <TextField
          label="Price (₹)"
          value={priceInput}
          required
          inputMode="decimal"
          placeholder="499 or 499.50"
          hint={
            parsedPrice.ok
              ? `Sent as ${parsedPrice.paise.toLocaleString('en-IN')} paise — ${formatPaise(parsedPrice.paise)}`
              : 'Rupees, up to two decimal places.'
          }
          error={errors.price}
          onChange={(event) => setPriceInput(event.target.value)}
        />

        <CheckboxField
          label="Active"
          hint="Inactive plans are not offered to students. Existing subscriptions are unaffected."
          checked={isActive}
          onChange={setIsActive}
        />

        <FormError error={mutation.error} />
      </form>
    </Modal>
  );
}
