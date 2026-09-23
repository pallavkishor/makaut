import Link from 'next/link';

export interface BrowseListItem {
  id: string;
  title: string;
  /** Secondary line, e.g. a subject code. */
  description?: string;
  /** Right-aligned count or status, e.g. "4 notes". */
  meta?: string;
  href: string;
}

interface BrowseListProps {
  items: BrowseListItem[];
  /** Accessible name for the list, e.g. "Programs". */
  label: string;
}

/**
 * One level of the browse hierarchy, as a list of links.
 *
 * Each row is a single link so the whole card is one keyboard stop and one large
 * touch target, with the focus ring on the card rather than the text.
 */
export function BrowseList({ items, label }: BrowseListProps) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="group flex h-full items-center gap-4 rounded-xl border border-border bg-background-surface p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground group-hover:text-primary-700">
                {item.title}
              </span>
              {item.description ? (
                <span className="mt-0.5 block text-xs text-muted">
                  {item.description}
                </span>
              ) : null}
            </span>

            {item.meta ? (
              <span className="flex-shrink-0 rounded-full bg-tertiary-200 px-2.5 py-1 text-xs font-medium text-muted">
                {item.meta}
              </span>
            ) : null}

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
      ))}
    </ul>
  );
}
