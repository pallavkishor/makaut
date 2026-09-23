import {
  dateInputInDays,
  endOfDayIso,
  hasDateErrors,
  isPast,
  startOfDayIso,
  toDateInputValue,
  validateSubscriptionDates,
} from './dates';

describe('validateSubscriptionDates', () => {
  it('accepts an end date after the start date', () => {
    const errors = validateSubscriptionDates('2024-01-15', '2024-07-15');

    expect(hasDateErrors(errors)).toBe(false);
  });

  it('rejects an end date before the start date', () => {
    const errors = validateSubscriptionDates('2024-07-15', '2024-01-15');

    expect(errors.endDate).toBe('End date must be after the start date');
  });

  it('rejects an end date equal to the start date', () => {
    // Same calendar day still produces a valid window (00:00 -> 23:59), so the
    // guard must compare the resolved timestamps, not the raw strings.
    const errors = validateSubscriptionDates('2024-01-15', '2024-01-15');

    expect(hasDateErrors(errors)).toBe(false);
  });

  it('reports missing dates per field', () => {
    expect(validateSubscriptionDates('', '')).toEqual({
      startDate: 'Start date is required',
      endDate: 'End date is required',
    });
  });
});

describe('day boundary conversion', () => {
  it('expands a date input into a full UTC day', () => {
    expect(startOfDayIso('2024-01-15')).toBe('2024-01-15T00:00:00.000Z');
    expect(endOfDayIso('2024-01-15')).toBe('2024-01-15T23:59:59.999Z');
  });

  it('round-trips an ISO timestamp back into a date input value', () => {
    expect(toDateInputValue('2024-07-15T23:59:59.999Z')).toBe('2024-07-15');
    expect(toDateInputValue(undefined)).toBe('');
  });
});

describe('isPast', () => {
  const now = new Date('2024-03-01T00:00:00Z');

  it('is true for a period that has already ended', () => {
    expect(isPast('2024-02-29T23:59:59.999Z', now)).toBe(true);
  });

  it('is false for a period still running', () => {
    expect(isPast('2024-07-15T23:59:59.999Z', now)).toBe(false);
  });

  it('is false for a missing date rather than throwing', () => {
    expect(isPast(null, now)).toBe(false);
  });
});

describe('dateInputInDays', () => {
  it('offsets in whole UTC days', () => {
    expect(dateInputInDays(30, new Date('2024-01-15T10:00:00Z'))).toBe('2024-02-14');
    expect(dateInputInDays(0, new Date('2024-01-15T10:00:00Z'))).toBe('2024-01-15');
  });
});
