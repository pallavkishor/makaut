import Link from 'next/link';
import { formatDate, toDateTimeAttribute } from '@/lib/format';
import type { NoteSummary } from '@/types/api';

interface NoteListProps {
  notes: NoteSummary[];
  /** Shown as a numbered index when the list is the chapter's own ordering. */
  numbered?: boolean;
  /** Highlights the note currently being read. */
  activeNoteId?: string;
}

/**
 * Ordered list of note titles inside a chapter (Requirements 4.2, 4.3).
 *
 * Only published notes ever reach this list - the API filters them out - so no
 * draft state needs rendering here.
 */
export function NoteList({
  notes,
  numbered = true,
  activeNoteId,
}: NoteListProps) {
  return (
    <ol className="space-y-2">
      {notes.map((note, index) => {
        const isActive = note.id === activeNoteId;

        return (
          <li key={note.id}>
            <Link
              href={`/note/${note.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'group flex items-center gap-4 rounded-xl border bg-background-surface p-4 shadow-sm transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                isActive
                  ? 'border-primary-300 ring-1 ring-primary-200'
                  : 'border-border hover:border-primary-300 hover:shadow-md',
              ].join(' ')}
            >
              {numbered ? (
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-tertiary-200 text-sm font-semibold text-muted transition-colors group-hover:bg-primary-50 group-hover:text-primary-700"
                >
                  {index + 1}
                </span>
              ) : null}

              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground group-hover:text-primary-700">
                  {note.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Updated{' '}
                  <time dateTime={toDateTimeAttribute(note.updatedAt)}>
                    {formatDate(note.updatedAt)}
                  </time>
                </span>
              </span>

              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 flex-shrink-0 text-muted-300 transition-colors group-hover:text-primary-600"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
