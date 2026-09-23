/** Date and text formatting helpers shared across pages. */

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...DATE_FORMAT,
  hour: 'numeric',
  minute: '2-digit',
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Mar 2025", or a dash when the value is missing or unparseable. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString(undefined, DATE_FORMAT) : '—';
}

/** "12 Mar 2025, 4:05 PM". */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleString(undefined, DATE_TIME_FORMAT) : '—';
}

/** ISO date portion, suitable for a `<time dateTime>` attribute. */
export function toDateTimeAttribute(
  value: string | Date | null | undefined
): string | undefined {
  return toDate(value)?.toISOString();
}

/**
 * Whole days from now until `value`. Negative once the date has passed.
 * Rounded up so "expires in a few hours" still reads as 1 day left.
 */
export function daysUntil(
  value: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  const date = toDate(value);
  if (!date) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date.getTime() - now.getTime()) / msPerDay);
}

/** Human summary of remaining subscription time. */
export function describeTimeRemaining(
  value: string | Date | null | undefined,
  now: Date = new Date()
): string {
  const days = daysUntil(value, now);
  if (days === null) return 'No expiry date on record';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days < 31) return `${days} days left`;
  const months = Math.round(days / 30);
  return months === 1 ? 'About 1 month left' : `About ${months} months left`;
}

/** True when the subscription is close enough to expiry to warrant a warning. */
export function isExpiringSoon(
  value: string | Date | null | undefined,
  thresholdDays = 7,
  now: Date = new Date()
): boolean {
  const days = daysUntil(value, now);
  return days !== null && days >= 0 && days <= thresholdDays;
}

/** Strips HTML tags and collapses whitespace, for list previews. */
export function toPlainTextPreview(html: string, maxLength = 160): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}
