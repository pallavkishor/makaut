'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { errorCodeOf } from '@/lib/api';
import { browseHref } from '@/lib/browsePaths';
import {
  useChapterNotes,
  useNote,
  usePrograms,
  useSemesters,
  useStreams,
  useSubject,
  useSubjectChapters,
} from '@/lib/queries';
import { formatDate, toDateTimeAttribute } from '@/lib/format';
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs';
import { ErrorState } from '@/components/ErrorState';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoteContent } from './NoteContent';
import { NoteNavigation } from './NoteNavigation';

/**
 * Note reader.
 *
 * A note hangs off a CHAPTER now, so previous/next move through the chapter's
 * note list (Requirement 4.6) and the body is Markdown rendered by
 * `NoteContent` (Requirement 4.5).
 *
 * A note URL carries only the note id, so the breadcrumb ancestry is resolved by
 * walking up: note -> chapter -> subject -> semester -> stream -> program ->
 * university. Every step is a catalogue read the reader is already entitled to,
 * and a step that has not resolved yet simply leaves that crumb unlinked.
 */
export function NoteView({ noteId }: { noteId: string }) {
  const noteQuery = useNote(noteId);
  const note = noteQuery.data?.note;

  const chapterId = note?.chapterId ?? '';
  const chapterNotes = useChapterNotes(chapterId);

  const subjectId = chapterNotes.data?.subjectId ?? '';
  const chapters = useSubjectChapters(subjectId);
  const subjectQuery = useSubject(subjectId);

  const semesterId = subjectQuery.data?.subject.semesterId ?? '';
  const semesters = useSemesters(undefined, { enabled: Boolean(semesterId) });
  const semester = semesters.data?.semesters.find(
    (candidate) => candidate.id === semesterId
  );

  const streams = useStreams(undefined, { enabled: Boolean(semester) });
  const stream = streams.data?.streams.find(
    (candidate) => candidate.id === semester?.streamId
  );

  const programs = usePrograms(undefined, { enabled: Boolean(stream) });
  const program = programs.data?.programs.find(
    (candidate) => candidate.id === stream?.programId
  );

  const { previous, next, position, total } = useMemo(() => {
    const notes = chapterNotes.data?.notes ?? [];
    const index = notes.findIndex((candidate) => candidate.id === noteId);

    if (index === -1) {
      return {
        previous: null,
        next: null,
        position: null as number | null,
        total: notes.length,
      };
    }

    return {
      previous: index > 0 ? notes[index - 1] : null,
      next: index < notes.length - 1 ? notes[index + 1] : null,
      position: index + 1,
      total: notes.length,
    };
  }, [chapterNotes.data, noteId]);

  if (
    errorCodeOf(noteQuery.error) === 'NO_ACTIVE_SUBSCRIPTION' ||
    errorCodeOf(chapterNotes.error) === 'NO_ACTIVE_SUBSCRIPTION'
  ) {
    return <UpgradePrompt headingAs="h1" target="this note" />;
  }

  if (errorCodeOf(noteQuery.error) === 'NOT_FOUND') {
    return (
      <EmptyState
        titleAs="h1"
        title="Note not found"
        description="This note does not exist, or it has been removed since you last opened it."
        action={
          <Link
            href="/browse"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          >
            Browse the catalogue
          </Link>
        }
      />
    );
  }

  if (noteQuery.isError) {
    return (
      <ErrorState
        error={noteQuery.error}
        title="We could not load this note"
        onRetry={() => void noteQuery.refetch()}
      />
    );
  }

  if (noteQuery.isPending || !note) {
    return (
      <div role="status" aria-live="polite" className="space-y-6">
        <span className="sr-only">Loading note</span>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-3/4" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  const subjectName = chapters.data?.subjectName ?? subjectQuery.data?.subject.name;
  const chapterTitle = chapterNotes.data?.chapterTitle;

  const pathIds = {
    universityId: program?.universityId,
    programId: program?.id,
    streamId: stream?.id,
    semesterId: semester?.id,
    subjectId: subjectId || undefined,
    chapterId: chapterId || undefined,
  };

  // Only link a crumb once the whole path above it has resolved
  const chapterHref = program && stream && semester && subjectId && chapterId
    ? browseHref(pathIds)
    : undefined;
  const subjectHref = program && stream && semester && subjectId
    ? browseHref({ ...pathIds, chapterId: null })
    : undefined;

  const crumbs: Crumb[] = [
    { label: 'Browse', href: '/browse' },
    ...(subjectName
      ? [{ label: subjectName, ...(subjectHref ? { href: subjectHref } : {}) }]
      : []),
    ...(chapterTitle
      ? [{ label: chapterTitle, ...(chapterHref ? { href: chapterHref } : {}) }]
      : []),
    { label: note.title },
  ];

  return (
    <article className="space-y-8">
      <div className="space-y-4">
        <Breadcrumbs items={crumbs} />

        <header className="space-y-3 border-b border-border pb-6">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
            {note.title}
          </h1>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>
              Updated{' '}
              <time dateTime={toDateTimeAttribute(note.updatedAt)}>
                {formatDate(note.updatedAt)}
              </time>
            </span>
            {position && total > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Note {position} of {total} in this chapter
                </span>
              </>
            ) : null}
          </p>
        </header>
      </div>

      <NoteContent markdown={note.content} />

      <div className="space-y-4 border-t border-border pt-6">
        <NoteNavigation previous={previous} next={next} />

        {chapterNotes.isError ? (
          <p className="text-sm text-muted">
            We could not load the rest of this chapter, so previous and next
            links are unavailable.
          </p>
        ) : chapterHref ? (
          <Link
            href={chapterHref}
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          >
            All notes in {chapterTitle ?? 'this chapter'}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
