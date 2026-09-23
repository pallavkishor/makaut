import Link from 'next/link';

export interface Crumb {
  label: string;
  /** Omit on the current page. */
  href?: string;
}

/**
 * Breadcrumb trail.
 *
 * Makes the Subject -> Note hierarchy explicit while browsing (Requirement 4.1)
 * and gives a one-click route back up the tree.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="h-4 w-4 text-muted-300"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              ) : null}

              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={`px-1 py-0.5 ${isLast ? 'font-medium text-foreground' : ''}`}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
