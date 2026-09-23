const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /** Screen-reader label. Set to null when a parent already announces loading. */
  label?: string | null;
}

/** Indeterminate loading indicator. */
export function Spinner({ size = 'md', className = '', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={`inline-flex items-center ${className}`}
      role={label ? 'status' : undefined}
    >
      <span
        aria-hidden="true"
        className={`${SIZES[size]} animate-spin rounded-full border-current border-t-transparent opacity-70`}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
