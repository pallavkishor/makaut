/**
 * Date/time helpers shared by the admin tables and forms.
 *
 * Subscription status used to be derived here from the date window. It is a
 * stored enum on the subscription row now, so the UI reads it rather than
 * computing it - see `SUBSCRIPTION_STATUS_LABELS` in `@/types`.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);

  return date ? DATE_FORMATTER.format(date) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);

  return date ? DATE_TIME_FORMATTER.format(date) : '—';
}

/** Converts an ISO timestamp into the `YYYY-MM-DD` value a date input needs. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value);

  if (!date) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

export function todayInputValue(): string {
  return toDateInputValue(new Date());
}

/** `YYYY-MM-DD` -> ISO timestamp at the start of that UTC day. */
export function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00.000Z`).toISOString();
}

/** `YYYY-MM-DD` -> ISO timestamp at the end of that UTC day. */
export function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999Z`).toISOString();
}

export interface SubscriptionDateErrors {
  startDate?: string;
  endDate?: string;
}

/**
 * Client-side subscription window validation (Requirements 8.3, 8.4).
 * Returns one entry per invalid field; an empty object means the dates are fine.
 */
export function validateSubscriptionDates(
  startDate: string,
  endDate: string
): SubscriptionDateErrors {
  const errors: SubscriptionDateErrors = {};

  if (!startDate) {
    errors.startDate = 'Start date is required';
  }

  if (!endDate) {
    errors.endDate = 'End date is required';
  }

  if (errors.startDate || errors.endDate) {
    return errors;
  }

  const start = toDate(startOfDayIso(startDate));
  const end = toDate(endOfDayIso(endDate));

  if (!start) {
    errors.startDate = 'Start date is not a valid date';
  }

  if (!end) {
    errors.endDate = 'End date is not a valid date';
  }

  if (errors.startDate || errors.endDate) {
    return errors;
  }

  if (start && end && end.getTime() <= start.getTime()) {
    errors.endDate = 'End date must be after the start date';
  }

  return errors;
}

export function hasDateErrors(errors: SubscriptionDateErrors): boolean {
  return Boolean(errors.startDate || errors.endDate);
}

/** True when the given end timestamp is already in the past. */
export function isPast(
  value: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const date = toDate(value);

  return date ? date.getTime() < now.getTime() : false;
}

/** `YYYY-MM-DD` value `days` from today, used to default a period end. */
export function dateInputInDays(days: number, from: Date = new Date()): string {
  const target = new Date(from.getTime());
  target.setUTCDate(target.getUTCDate() + days);

  return toDateInputValue(target);
}
