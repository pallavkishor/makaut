import Link from 'next/link';

interface SubjectCardProps {
  name: string;
  /** Subject code, when the subject has one. */
  code?: string | null;
  /** Browse URL for the subject's chapters. */
  href: string;
}

/** Card linking to a subject in the student's selected semester. */
export function SubjectCard({ name, code, href }: SubjectCardProps) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col justify-between gap-4 rounded-xl border border-border bg-background-surface p-5 shadow-sm transition-all hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary-700 sm:text-lg">
              {name}
            </h3>
            {code ? (
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">
                {code}
              </p>
            ) : null}
          </div>

          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>

        <p className="text-sm text-muted">Chapters and notes</p>
      </Link>
    </li>
  );
}
