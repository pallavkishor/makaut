import Link from 'next/link';
import { browseHref } from '@/lib/browsePaths';
import type { SearchResult } from '@/types/api';
import { HighlightedSnippet } from './HighlightedSnippet';

const MATCH_LABELS: Record<string, string> = {
  title: 'Title match',
  body: 'In the note body',
  subject: 'Subject match',
  chapter: 'Chapter match',
};

/**
 * One search hit: the note title, where it sits in the hierarchy, and the
 * highlighted snippet.
 *
 * Every hit carries its full breadcrumb, so each level is a link back into the
 * browse flow at exactly that point.
 */
export function SearchResultCard({ result }: { result: SearchResult }) {
  const { breadcrumb } = result;

  const trail = [
    {
      label: breadcrumb.university.name,
      href: browseHref({ universityId: breadcrumb.university.id }),
    },
    {
      label: breadcrumb.program.name,
      href: browseHref({
        universityId: breadcrumb.university.id,
        programId: breadcrumb.program.id,
      }),
    },
    {
      label: breadcrumb.stream.name,
      href: browseHref({
        universityId: breadcrumb.university.id,
        programId: breadcrumb.program.id,
        streamId: breadcrumb.stream.id,
      }),
    },
    {
      label: breadcrumb.semester.label,
      href: browseHref({
        universityId: breadcrumb.university.id,
        programId: breadcrumb.program.id,
        streamId: breadcrumb.stream.id,
        semesterId: breadcrumb.semester.id,
      }),
    },
    {
      label: breadcrumb.subject.name,
      href: browseHref({
        universityId: breadcrumb.university.id,
        programId: breadcrumb.program.id,
        streamId: breadcrumb.stream.id,
        semesterId: breadcrumb.semester.id,
        subjectId: breadcrumb.subject.id,
      }),
    },
    {
      label: breadcrumb.chapter.title,
      href: browseHref({
        universityId: breadcrumb.university.id,
        programId: breadcrumb.program.id,
        streamId: breadcrumb.stream.id,
        semesterId: breadcrumb.semester.id,
        subjectId: breadcrumb.subject.id,
        chapterId: breadcrumb.chapter.id,
      }),
    },
  ];

  return (
    <li className="rounded-xl border border-border bg-background-surface p-5 shadow-sm">
      <h3 className="text-base font-semibold">
        <Link
          href={`/note/${result.noteId}`}
          className="rounded text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
        >
          {result.title}
        </Link>
      </h3>

      <nav aria-label="Location in the catalogue" className="mt-2">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {trail.map((crumb, index) => (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <Link
                href={crumb.href}
                className="rounded underline decoration-border-strong underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              >
                {crumb.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <HighlightedSnippet headline={result.headline} className="mt-3" />

      {result.matchedIn.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {result.matchedIn.map((field) => (
            <li
              key={field}
              className="rounded-full bg-tertiary-200 px-2 py-0.5 text-xs font-medium text-muted"
            >
              {MATCH_LABELS[field] ?? field}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
