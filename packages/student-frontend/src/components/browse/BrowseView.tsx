'use client';

import Link from 'next/link';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorCodeOf } from '@/lib/api';
import {
  browseHref,
  parseBrowseSegments,
  type BrowsePathIds,
} from '@/lib/browsePaths';
import {
  useChapterNotes,
  usePrograms,
  useSemesterSubjects,
  useSemesters,
  useStreams,
  useSubjectChapters,
  useUniversities,
} from '@/lib/queries';
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs';
import { ErrorState } from '@/components/ErrorState';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { NoteList } from '@/components/note/NoteList';
import type { NoteSummary } from '@/types/api';
import { BrowseList, type BrowseListItem } from './BrowseList';

/**
 * The whole browse hierarchy, driven by the ids in the URL.
 *
 * Depth in the path decides what is listed:
 *
 *   0 universities   3 semesters   6 note titles (subscription required)
 *   1 programs       4 subjects
 *   2 streams        5 chapters
 *
 * Everything to depth 5 is the shop window: it renders without a subscription so
 * a prospective student can see what is on offer. Depth 6 is the first paywalled
 * step, and a 403 NO_ACTIVE_SUBSCRIPTION there is rendered as an upgrade prompt
 * rather than an error.
 *
 * Names for the breadcrumb come from the list each level already needs - the
 * catalogue endpoints only report a node's direct parent, so the ancestry lives
 * in the URL instead of being resolved server-side.
 *
 * Requirements: 3.4, 3.5, 3.6, 4.1, 4.2
 */
export function BrowseView({ segments }: { segments?: string[] }) {
  const ids = parseBrowseSegments(segments);
  const depth = segments?.length ?? 0;

  const universities = useUniversities();
  const programs = usePrograms(ids.universityId ?? undefined, {
    enabled: depth >= 1,
  });
  const streams = useStreams(ids.programId ?? undefined, { enabled: depth >= 2 });
  const semesters = useSemesters(ids.streamId ?? undefined, {
    enabled: depth >= 3,
  });
  const subjects = useSemesterSubjects(depth >= 4 ? (ids.semesterId ?? '') : '');
  const chapters = useSubjectChapters(depth >= 5 ? (ids.subjectId ?? '') : '');
  const notes = useChapterNotes(depth >= 6 ? (ids.chapterId ?? '') : '');

  // Depth 7+ is not a level in the hierarchy
  if (depth > 6) {
    return <NotFoundLevel />;
  }

  const universityName = universities.data?.universities.find(
    (item) => item.id === ids.universityId
  )?.name;
  const programName = programs.data?.programs.find(
    (item) => item.id === ids.programId
  )?.name;
  const streamName = streams.data?.streams.find(
    (item) => item.id === ids.streamId
  )?.name;
  const semesterLabel = semesters.data?.semesters.find(
    (item) => item.id === ids.semesterId
  )?.label;
  const subjectName =
    subjects.data?.subjects.find((item) => item.id === ids.subjectId)?.name ??
    chapters.data?.subjectName;
  const chapterTitle =
    chapters.data?.chapters.find((item) => item.id === ids.chapterId)?.title ??
    notes.data?.chapterTitle;

  const crumbs = buildCrumbs(ids, depth, {
    universityName,
    programName,
    streamName,
    semesterLabel,
    subjectName,
    chapterTitle,
  });

  const level = LEVELS[depth];
  // Normalized so the render path does not branch per level
  const activeQuery = [
    universities,
    programs,
    streams,
    semesters,
    subjects,
    chapters,
    notes,
  ].map(toQueryStatus)[depth];

  // The paywall: only the note level can answer 403, and it is not an error
  if (errorCodeOf(notes.error) === 'NO_ACTIVE_SUBSCRIPTION') {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={crumbs} />
        <UpgradePrompt
          headingAs="h1"
          target={
            chapterTitle
              ? `the notes in ${chapterTitle}`
              : 'the notes in this chapter'
          }
          browseHref={browseHref({ ...ids, chapterId: null })}
        />
      </div>
    );
  }

  if (errorCodeOf(activeQuery.error) === 'NOT_FOUND') {
    return <NotFoundLevel />;
  }

  const items = buildItems(depth, ids, {
    universities: universities.data?.universities,
    programs: programs.data?.programs,
    streams: streams.data?.streams,
    semesters: semesters.data?.semesters,
    subjects: subjects.data?.subjects,
    chapters: chapters.data?.chapters,
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs items={crumbs} />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {level.heading(crumbs[crumbs.length - 1]?.label)}
        </h1>
        <p className="text-sm text-muted">{level.description}</p>
      </header>

      {activeQuery.isError ? (
        <ErrorState
          error={activeQuery.error}
          title={`We could not load ${level.plural}`}
          onRetry={activeQuery.refetch}
        />
      ) : null}

      {activeQuery.isPending ? (
        <SkeletonList rows={4} label={`Loading ${level.plural}`} />
      ) : null}

      {!activeQuery.isPending && !activeQuery.isError ? (
        depth === 6 ? (
          <NotesLevel notes={notes.data?.notes ?? []} />
        ) : items.length === 0 ? (
          <EmptyState
            title={`No ${level.plural} yet`}
            description={`Nothing has been published at this level yet. ${level.emptyHint}`}
          />
        ) : (
          <BrowseList items={items} label={level.label} />
        )
      ) : null}
    </div>
  );
}

function NotesLevel({ notes }: { notes: NoteSummary[] }) {
  if (notes.length === 0) {
    return (
      <EmptyState
        title="No notes yet"
        description="This chapter has no published notes. Check back soon."
      />
    );
  }

  return <NoteList notes={notes} />;
}

interface QueryStatus {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** Erases the per-level result type so the render path can stay generic. */
function toQueryStatus(query: UseQueryResult<unknown>): QueryStatus {
  return {
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

function NotFoundLevel() {
  return (
    <EmptyState
      titleAs="h1"
      title="Not found"
      description="This part of the catalogue does not exist, or the link you followed is out of date."
      action={
        <Link
          href="/browse"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
        >
          Start browsing
        </Link>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Level metadata
// ---------------------------------------------------------------------------

interface LevelMeta {
  /** Accessible list name. */
  label: string;
  /** Lower-case plural used in messages. */
  plural: string;
  description: string;
  emptyHint: string;
  heading: (parentLabel?: string) => string;
}

const LEVELS: LevelMeta[] = [
  {
    label: 'Universities',
    plural: 'universities',
    description: 'Pick a university to see the programs it offers.',
    emptyHint: 'Check back soon.',
    heading: () => 'Browse the catalogue',
  },
  {
    label: 'Programs',
    plural: 'programs',
    description: 'Pick a program to see its streams.',
    emptyHint: 'Try another university.',
    heading: (parent) => parent ?? 'Programs',
  },
  {
    label: 'Streams',
    plural: 'streams',
    description: 'Pick a stream to see its semesters.',
    emptyHint: 'Try another program.',
    heading: (parent) => parent ?? 'Streams',
  },
  {
    label: 'Semesters',
    plural: 'semesters',
    description: 'Pick a semester to see its subjects.',
    emptyHint: 'Try another stream.',
    heading: (parent) => parent ?? 'Semesters',
  },
  {
    label: 'Subjects',
    plural: 'subjects',
    description: 'Pick a subject to see its chapters.',
    emptyHint: 'Try another semester.',
    heading: (parent) => parent ?? 'Subjects',
  },
  {
    label: 'Chapters',
    plural: 'chapters',
    description: 'Pick a chapter to see its notes.',
    emptyHint: 'Try another subject.',
    heading: (parent) => parent ?? 'Chapters',
  },
  {
    label: 'Notes',
    plural: 'notes',
    description: 'Open a note to read it.',
    emptyHint: 'Check back soon.',
    heading: (parent) => parent ?? 'Notes',
  },
];

// ---------------------------------------------------------------------------
// Breadcrumb and list construction
// ---------------------------------------------------------------------------

interface ResolvedNames {
  universityName?: string;
  programName?: string;
  streamName?: string;
  semesterLabel?: string;
  subjectName?: string;
  chapterTitle?: string;
}

/**
 * Builds the breadcrumb trail for the current URL.
 *
 * A level whose name has not loaded yet falls back to its generic label, so the
 * trail keeps its shape (and its links) while requests are in flight.
 */
function buildCrumbs(
  ids: BrowsePathIds,
  depth: number,
  names: ResolvedNames
): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Browse', href: '/browse' }];

  const levels: Array<{ present: boolean; label: string; ids: BrowsePathIds }> = [
    {
      present: Boolean(ids.universityId),
      label: names.universityName ?? 'University',
      ids: { universityId: ids.universityId },
    },
    {
      present: Boolean(ids.programId),
      label: names.programName ?? 'Program',
      ids: { universityId: ids.universityId, programId: ids.programId },
    },
    {
      present: Boolean(ids.streamId),
      label: names.streamName ?? 'Stream',
      ids: {
        universityId: ids.universityId,
        programId: ids.programId,
        streamId: ids.streamId,
      },
    },
    {
      present: Boolean(ids.semesterId),
      label: names.semesterLabel ?? 'Semester',
      ids: {
        universityId: ids.universityId,
        programId: ids.programId,
        streamId: ids.streamId,
        semesterId: ids.semesterId,
      },
    },
    {
      present: Boolean(ids.subjectId),
      label: names.subjectName ?? 'Subject',
      ids: {
        universityId: ids.universityId,
        programId: ids.programId,
        streamId: ids.streamId,
        semesterId: ids.semesterId,
        subjectId: ids.subjectId,
      },
    },
    {
      present: Boolean(ids.chapterId),
      label: names.chapterTitle ?? 'Chapter',
      ids,
    },
  ];

  for (const level of levels.slice(0, depth)) {
    if (!level.present) break;
    crumbs.push({ label: level.label, href: browseHref(level.ids) });
  }

  return crumbs;
}

interface LevelData {
  universities?: Array<{ id: string; name: string }>;
  programs?: Array<{ id: string; name: string }>;
  streams?: Array<{ id: string; name: string }>;
  semesters?: Array<{ id: string; label: string; number: number }>;
  subjects?: Array<{ id: string; name: string; code: string | null }>;
  chapters?: Array<{ id: string; title: string; noteCount: number }>;
}

/** Maps the current level's data onto link rows. */
function buildItems(
  depth: number,
  ids: BrowsePathIds,
  data: LevelData
): BrowseListItem[] {
  switch (depth) {
    case 0:
      return (data.universities ?? []).map((university) => ({
        id: university.id,
        title: university.name,
        href: browseHref({ universityId: university.id }),
      }));

    case 1:
      return (data.programs ?? []).map((program) => ({
        id: program.id,
        title: program.name,
        href: browseHref({ ...ids, programId: program.id }),
      }));

    case 2:
      return (data.streams ?? []).map((stream) => ({
        id: stream.id,
        title: stream.name,
        href: browseHref({ ...ids, streamId: stream.id }),
      }));

    case 3:
      return (data.semesters ?? []).map((semester) => ({
        id: semester.id,
        title: semester.label,
        href: browseHref({ ...ids, semesterId: semester.id }),
      }));

    case 4:
      return (data.subjects ?? []).map((subject) => ({
        id: subject.id,
        title: subject.name,
        ...(subject.code ? { description: subject.code } : {}),
        href: browseHref({ ...ids, subjectId: subject.id }),
      }));

    case 5:
      return (data.chapters ?? []).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        meta:
          chapter.noteCount === 1 ? '1 note' : `${chapter.noteCount} notes`,
        href: browseHref({ ...ids, chapterId: chapter.id }),
      }));

    default:
      return [];
  }
}
