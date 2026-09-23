/**
 * Money handling for subscription plan prices.
 *
 * Prices cross the wire as integers in minor units (paise for INR) end to end.
 * Admins think in rupees, so the form converts - and the conversion is done on
 * the decimal *string* rather than with floating point arithmetic, because
 * `Math.round(19.99 * 100)` is the kind of thing that silently ships a plan
 * priced at 1998 paise.
 */

const MINOR_UNITS_PER_MAJOR = 100;

/** Highest price accepted: ₹10,00,000, comfortably inside a safe integer. */
export const MAX_PRICE_PAISE = 100_000_000;

/**
 * Renders minor units as a rupee amount with two decimals, e.g. `1999` ->
 * `₹19.99`. Used for display only; never round-trip this back to a number.
 */
export function formatPaise(paise: number, currency = 'INR'): string {
  if (!Number.isFinite(paise)) {
    return '—';
  }

  const formatted = (Math.trunc(paise) / MINOR_UNITS_PER_MAJOR).toFixed(2);
  const grouped = groupThousands(formatted);

  return currency.toUpperCase() === 'INR' ? `₹${grouped}` : `${grouped} ${currency}`;
}

/**
 * Indian digit grouping (1,00,000 rather than 100,000) on the integer part.
 */
function groupThousands(decimalString: string): string {
  const negative = decimalString.startsWith('-');
  const unsigned = negative ? decimalString.slice(1) : decimalString;
  const [whole, fraction] = unsigned.split('.');

  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const joined = rest ? `${groupedRest},${lastThree}` : lastThree;

  return `${negative ? '-' : ''}${joined}${fraction ? `.${fraction}` : ''}`;
}

/** Minor units -> the value a rupee text input should show (`1999` -> `19.99`). */
export function paiseToRupeeInput(paise: number): string {
  if (!Number.isFinite(paise)) {
    return '';
  }

  return (Math.trunc(paise) / MINOR_UNITS_PER_MAJOR).toFixed(2);
}

export type ParseResult =
  | { ok: true; paise: number }
  | { ok: false; error: string };

/**
 * Parses a rupee amount typed by an admin into integer paise.
 *
 * Accepts `1500`, `1500.5`, `1,500.50` and `₹1500`. Rejects anything with more
 * than two decimal places rather than rounding it, so the stored price is never
 * quietly different from what was typed.
 */
export function rupeesToPaise(input: string): ParseResult {
  const cleaned = input.trim().replace(/[₹,\s]/g, '');

  if (cleaned.length === 0) {
    return { ok: false, error: 'Price is required' };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    if (/^\d+\.\d{3,}$/.test(cleaned)) {
      return {
        ok: false,
        error: 'Price cannot be finer than paise (two decimal places)',
      };
    }

    return { ok: false, error: 'Enter a price in rupees, e.g. 499 or 499.50' };
  }

  const [whole, fraction = ''] = cleaned.split('.');
  const paise =
    Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(paise)) {
    return { ok: false, error: 'Price is too large' };
  }

  if (paise > MAX_PRICE_PAISE) {
    return {
      ok: false,
      error: `Price must be ${formatPaise(MAX_PRICE_PAISE)} or less`,
    };
  }

  return { ok: true, paise };
}
