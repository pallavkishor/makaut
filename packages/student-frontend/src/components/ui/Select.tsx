import { forwardRef, useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  label: string;
  options: SelectOption[];
  /** Shown as the first, empty option. */
  placeholder?: string;
  /** Validation message. Its presence marks the field invalid. */
  error?: string;
  /** Persistent helper text shown below the control. */
  hint?: string;
}

/**
 * Labelled select.
 *
 * Native `<select>` on purpose: it is keyboard and screen-reader accessible
 * without any extra wiring, and it gets the platform picker on mobile. The label
 * is a real `<label for>`, and the error and hint are announced with the control
 * through `aria-describedby`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, hint, className = '', ...props },
  ref
) {
  const generatedId = useId();
  const selectId = `select-${generatedId}`;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'block w-full appearance-none rounded-lg border bg-background-surface px-3.5 py-2.5 text-foreground shadow-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
            : 'border-border-strong focus:border-primary-600 focus:ring-primary-600',
          'disabled:cursor-not-allowed disabled:bg-tertiary disabled:text-muted',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
