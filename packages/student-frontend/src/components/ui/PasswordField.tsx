'use client';

import { useId, useState } from 'react';

export interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Labelled password input with a show/hide toggle.
 *
 * The value lives only in the caller's component state for the lifetime of the
 * form; it is never persisted anywhere.
 */
export function PasswordField({
  label,
  error,
  hint,
  className = '',
  ...props
}: PasswordFieldProps) {
  const generatedId = useId();
  const [visible, setVisible] = useState(false);

  const inputId = `password-${generatedId}`;
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

      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'block w-full rounded-lg border bg-background-surface py-2.5 pl-3.5 pr-12 text-foreground shadow-sm transition-colors',
            'placeholder:text-muted-300',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
              : 'border-border-strong focus:border-primary-600 focus:ring-primary-600',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />

        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          <span className="sr-only">
            {visible ? 'Hide password' : 'Show password'}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            {visible ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.3 6.7C3.9 8.2 3 10.3 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </>
            ) : (
              <>
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>

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
