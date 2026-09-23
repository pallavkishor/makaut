import Link from 'next/link';
import type { NoteSummary } from '@/types/api';

interface NoteNavigationProps {
  previous: NoteSummary | null;
  next: NoteSummary | null;
}

const LINK_CLASSES =
  'group flex flex-1 flex-col gap-1 rounded-xl border border-border bg-background-surface p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

/**
 * Previous / next navigation within the subject (Requirement 4.6).
 *
 * Ordering matches the subject's note list, so "next" always means the note that
 * follows on the subject page.
 */
export function NoteNavigation({ previous, next }: NoteNavigationProps) {
  if (!previous && !next) return null;

  return (
    <nav
      aria-label="Note navigation"
      className="flex flex-col gap-3 sm:flex-row"
    >
      {previous ? (
        <Link
          href={`/note/${previous.id}`}
          rel="prev"
          className={`${LINK_CLASSES} sm:text-left`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M19 12H5m6-6-6 6 6 6" />
            </svg>
            Previous
          </span>
          <span className="font-medium text-foreground group-hover:text-primary-700">
            {previous.title}
          </span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" aria-hidden="true" />
      )}

      {next ? (
        <Link
          href={`/note/${next.id}`}
          rel="next"
          className={`${LINK_CLASSES} sm:items-end sm:text-right`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Next
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </span>
          <span className="font-medium text-foreground group-hover:text-primary-700">
            {next.title}
          </span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" aria-hidden="true" />
      )}
    </nav>
  );
}
