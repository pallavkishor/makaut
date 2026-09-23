'use client';

import { useId } from 'react';
import { Spinner } from '@/components/ui/Spinner';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  busy?: boolean;
  /** Announced result summary, wired to the input via aria-describedby. */
  resultSummary?: string;
}

/**
 * Search box for notes across the catalogue (Requirements 4.7, 4.8).
 *
 * Submitting is a no-op by design: results update as the query is debounced, so
 * pressing Enter should not reload the page.
 */
export function SearchField({
  value,
  onChange,
  label = 'Search notes',
  placeholder = 'Search by title, content, subject or chapter',
  busy = false,
  resultSummary,
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = `search-${generatedId}`;
  const summaryId = `${inputId}-summary`;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-300"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>

        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={200}
          aria-describedby={resultSummary ? summaryId : undefined}
          className="block w-full rounded-lg border border-border-strong bg-background-surface py-2.5 pl-11 pr-11 text-foreground shadow-sm transition-colors placeholder:text-muted-300 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
        />

        {busy ? (
          <span className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-primary-600">
            <Spinner size="sm" label="Searching" />
          </span>
        ) : value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-300 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            <span className="sr-only">Clear search</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {resultSummary ? (
        <p
          id={summaryId}
          role="status"
          aria-live="polite"
          className="text-sm text-muted"
        >
          {resultSummary}
        </p>
      ) : null}
    </div>
  );
}
