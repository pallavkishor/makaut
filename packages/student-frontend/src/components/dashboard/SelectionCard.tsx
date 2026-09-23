import Link from 'next/link';
import { browseHref } from '@/lib/browsePaths';
import type { Selection } from '@/types/api';

interface SelectionCardProps {
  selection: Selection;
}

/**
 * The student's chosen place in the hierarchy, with a way to change it.
 *
 * Rendered only when a selection exists; the dashboard shows a prompt instead
 * when every level is unset.
 */
export function SelectionCard({ selection }: SelectionCardProps) {
  const rows = [
    { label: 'University', value: selection.university?.name },
    { label: 'Program', value: selection.program?.name },
    { label: 'Stream', value: selection.stream?.name },
    { label: 'Semester', value: selection.semester?.label },
  ].filter((row) => Boolean(row.value));

  return (
    <section
      aria-labelledby="selection-heading"
      className="rounded-xl border border-border bg-background-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2
          id="selection-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted"
        >
          Your program
        </h2>

        <Link
          href="/selection"
          className="rounded text-sm font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
        >
          Change
        </Link>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-muted">{row.label}</dt>
            <dd className="font-medium text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      <Link
        href={browseHref({
          universityId: selection.university?.id,
          programId: selection.program?.id,
          streamId: selection.stream?.id,
          semesterId: selection.semester?.id,
        })}
        className="mt-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        Open this level in the catalogue
      </Link>
    </section>
  );
}
