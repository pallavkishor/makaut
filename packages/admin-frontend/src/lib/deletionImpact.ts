import type {
  DeletedCounts,
  HierarchyLevel,
  HierarchyTree,
  TreeSemester,
  TreeSubject,
} from '@/types';

/**
 * Works out what a cascading hierarchy delete will destroy, BEFORE it runs.
 *
 * The API reports `deletedCounts` in the delete *response*, which is too late to
 * put in front of an administrator who is about to wipe a university. There is
 * no preview endpoint, so the impact is assembled client-side:
 *
 *  - programs / streams / semesters / subjects / chapters come from
 *    `GET /hierarchy/tree`, exactly, in a single request;
 *  - notes and resources are counted with `pagination.total` probes against the
 *    note and resource lists - one probe per subject, plus one per chapter for
 *    chapter-attached resources.
 *
 * Probes are bounded. Past the budget the count is reported as a lower bound and
 * labelled as such, rather than shown as if it were exact. The server's own
 * `deletedCounts` is reconciled into the success message afterwards, so the
 * authoritative number is always surfaced.
 */

export interface ImpactTarget {
  level: HierarchyLevel;
  id: string;
}

/** Everything a delete at some level reaches, identified rather than counted. */
export interface ImpactScope {
  /** Exact counts of the structural levels below the target. */
  structural: DeletedCounts;
  subjectIds: string[];
  chapterIds: string[];
}

export interface DeletionImpact extends DeletedCounts {
  /** False when the note count is a lower bound rather than the real total. */
  notesExact: boolean;
  /** False when the resource count is a lower bound. */
  resourcesExact: boolean;
}

/**
 * Probe budgets, applied per count. Chosen so the preview stays under a second
 * on a normal connection; above them the dialog degrades to "at least N".
 */
export const MAX_NOTE_PROBES = 120;
export const MAX_RESOURCE_PROBES = 240;

/** How many probes run at once. Enough to be quick, few enough to be polite. */
const CONCURRENCY = 6;

function subjectsOfSemester(semester: TreeSemester): TreeSubject[] {
  return semester.subjects ?? [];
}

/**
 * Collects the subtree under `target` out of a loaded university tree.
 *
 * Returns null when the target is not in this tree, which means the caller
 * loaded the wrong university.
 */
export function scopeFromTree(
  tree: HierarchyTree,
  target: ImpactTarget
): ImpactScope | null {
  const programs = tree.programs ?? [];

  if (target.level === 'university') {
    if (tree.id !== target.id) {
      return null;
    }

    const streams = programs.flatMap((program) => program.streams ?? []);
    const semesters = streams.flatMap((stream) => stream.semesters ?? []);
    const collected = collect(semesters);

    return {
      ...collected,
      structural: {
        programs: programs.length,
        streams: streams.length,
        semesters: semesters.length,
        ...collected.structural,
      },
    };
  }

  if (target.level === 'program') {
    const program = programs.find((candidate) => candidate.id === target.id);

    if (!program) {
      return null;
    }

    const streams = program.streams ?? [];
    const semesters = streams.flatMap((stream) => stream.semesters ?? []);
    const collected = collect(semesters);

    return {
      ...collected,
      structural: {
        streams: streams.length,
        semesters: semesters.length,
        ...collected.structural,
      },
    };
  }

  if (target.level === 'stream') {
    const stream = programs
      .flatMap((program) => program.streams ?? [])
      .find((candidate) => candidate.id === target.id);

    if (!stream) {
      return null;
    }

    const semesters = stream.semesters ?? [];
    const collected = collect(semesters);

    return {
      ...collected,
      structural: { semesters: semesters.length, ...collected.structural },
    };
  }

  const semester = programs
    .flatMap((program) => program.streams ?? [])
    .flatMap((stream) => stream.semesters ?? [])
    .find((candidate) => candidate.id === target.id);

  if (!semester) {
    return null;
  }

  return collect([semester]);
}

/** Subject and chapter totals for a set of semesters. */
function collect(semesters: TreeSemester[]): ImpactScope {
  const subjects = semesters.flatMap(subjectsOfSemester);
  const chapters = subjects.flatMap((subject) => subject.chapters ?? []);

  return {
    structural: { subjects: subjects.length, chapters: chapters.length },
    subjectIds: subjects.map((subject) => subject.id),
    chapterIds: chapters.map((chapter) => chapter.id),
  };
}

/** Runs `task` over `items` with a bounded number of requests in flight. */
async function mapLimited<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<number>
): Promise<number> {
  let index = 0;
  let sum = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      sum += await task(current);
    }
  });

  await Promise.all(workers);

  return sum;
}

export interface ImpactCounters {
  countNotesForSubject: (subjectId: string) => Promise<number>;
  countResourcesForSubject: (subjectId: string) => Promise<number>;
  countResourcesForChapter: (chapterId: string) => Promise<number>;
}

/**
 * Fills in the note and resource counts for a scope.
 *
 * Both counts degrade to a lower bound independently: a university with a
 * manageable number of subjects but thousands of chapters still gets an exact
 * note count.
 */
export async function countContent(
  scope: ImpactScope,
  counters: ImpactCounters
): Promise<DeletionImpact> {
  const { subjectIds, chapterIds } = scope;

  const notesExact = subjectIds.length <= MAX_NOTE_PROBES;
  const notes = notesExact
    ? await mapLimited(subjectIds, CONCURRENCY, counters.countNotesForSubject)
    : 0;

  // Resources attach to a subject and/or a chapter, and the list endpoint
  // matches the column exactly, so both sides have to be probed.
  const subjectResourcesExact = subjectIds.length <= MAX_RESOURCE_PROBES;
  const subjectResources = subjectResourcesExact
    ? await mapLimited(subjectIds, CONCURRENCY, counters.countResourcesForSubject)
    : 0;

  const remainingBudget = MAX_RESOURCE_PROBES - subjectIds.length;
  const chapterResourcesExact = chapterIds.length <= remainingBudget;
  const chapterResources = chapterResourcesExact
    ? await mapLimited(chapterIds, CONCURRENCY, counters.countResourcesForChapter)
    : 0;

  return {
    ...scope.structural,
    notes,
    resources: subjectResources + chapterResources,
    notesExact,
    resourcesExact: subjectResourcesExact && chapterResourcesExact,
  };
}

/** Human-readable lines for a confirmation dialog, largest blast radius first. */
export function impactLines(impact: DeletedCounts): string[] {
  const order: Array<[keyof DeletedCounts, string, string]> = [
    ['programs', 'program', 'programs'],
    ['streams', 'stream', 'streams'],
    ['semesters', 'semester', 'semesters'],
    ['subjects', 'subject', 'subjects'],
    ['chapters', 'chapter', 'chapters'],
    ['notes', 'note', 'notes'],
    ['resources', 'PDF resource', 'PDF resources'],
  ];

  return order
    .filter(([key]) => typeof impact[key] === 'number')
    .map(([key, singular, plural]) => {
      const count = impact[key] as number;

      return `${count.toLocaleString('en-IN')} ${count === 1 ? singular : plural}`;
    });
}

/** One-line summary of what the server reported after a delete. */
export function describeDeletedCounts(counts: DeletedCounts): string {
  const lines = impactLines(counts).filter((line) => !line.startsWith('0 '));

  return lines.length > 0 ? lines.join(', ') : 'nothing below it';
}
