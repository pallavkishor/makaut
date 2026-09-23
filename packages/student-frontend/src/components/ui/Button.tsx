import { forwardRef } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * `primary` fills with the exact brand primary (#4F6F9F). White on it measures
 * 5.11:1, so it clears AA for normal text; hover/active step down the ramp and
 * only improve from there.
 *
 * `secondary` is sage-tinted and always carries `foreground` text — white on
 * #8FAF9D is 2.39:1 and must never be used. It is deliberately kept at the same
 * low visual weight as `danger` so a destructive action never looks quieter
 * than a safe one; the two are told apart by hue and text colour, not weight.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-500 text-white shadow-sm hover:bg-primary-600 active:bg-primary-700',
  secondary:
    'border border-secondary-300 bg-secondary-100 text-foreground shadow-sm hover:bg-secondary-200 active:bg-secondary-300',
  ghost: 'text-muted hover:bg-tertiary-200 hover:text-foreground',
  danger:
    'border border-red-200 bg-background-surface text-red-700 shadow-sm hover:bg-red-50 active:bg-red-100',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks interaction. */
  isLoading?: boolean;
  fullWidth?: boolean;
}

/**
 * Standard action button. Keeps a visible focus ring for keyboard users and
 * stays disabled (not just visually dimmed) while loading.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      className = '',
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={[
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          VARIANTS[variant],
          SIZES[size],
          fullWidth ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {isLoading ? <Spinner size="sm" label={null} /> : null}
        {children}
      </button>
    );
  }
);
