import { forwardRef, useId } from 'react';

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Validation message. Its presence marks the field invalid. */
  error?: string;
  /** Persistent helper text shown below the input. */
  hint?: string;
}

/**
 * Labelled text input.
 *
 * The label is always a real `<label for>` (never a placeholder), and the error
 * and hint are wired through `aria-describedby` so screen readers announce them
 * together with the field.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, error, hint, className = '', ...props }, ref) {
    const generatedId = useId();
    const inputId = `field-${generatedId}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    const describedBy =
      [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
      undefined;

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'block w-full rounded-lg border bg-background-surface px-3.5 py-2.5 text-foreground shadow-sm transition-colors',
            'placeholder:text-muted-300',
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
        />

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
  }
);
