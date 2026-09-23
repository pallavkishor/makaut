/**
 * URL helpers for the browse hierarchy.
 *
 * Browsing lives behind one catch-all route, `/browse/[[...path]]`, whose
 * segments are the ids of the hierarchy in order:
 *
 *   /browse                                     universities
 *   /browse/:u                                  programs
 *   /browse/:u/:p                               streams
 *   /browse/:u/:p/:s                            semesters
 *   /browse/:u/:p/:s/:sem                       subjects
 *   /browse/:u/:p/:s/:sem/:subject              chapters
 *   /browse/:u/:p/:s/:sem/:subject/:chapter     note titles (subscription)
 *
 * Carrying the whole ancestry in the URL is what lets every level render a
 * complete breadcrumb without asking the API to resolve parents: the catalogue
 * endpoints only ever report a node's direct parent.
 */

/** Browse levels, shallowest first. Index == path segment position. */
export const BROWSE_LEVELS = [
  'university',
  'program',
  'stream',
  'semester',
  'subject',
  'chapter',
] as const;

export type BrowseLevel = (typeof BROWSE_LEVELS)[number];

/** The ids a browse URL can carry, all optional. */
export interface BrowsePathIds {
  universityId?: string | null;
  programId?: string | null;
  streamId?: string | null;
  semesterId?: string | null;
  subjectId?: string | null;
  chapterId?: string | null;
}

const ORDERED_KEYS: readonly (keyof BrowsePathIds)[] = [
  'universityId',
  'programId',
  'streamId',
  'semesterId',
  'subjectId',
  'chapterId',
];

/**
 * Builds a browse URL, stopping at the first level with no id.
 *
 * Truncating rather than skipping keeps every generated link navigable: a path
 * with a hole in it could not resolve the breadcrumb for the levels below it.
 *
 * @param ids - Ids for as many levels as are known
 * @returns A `/browse/...` path
 */
export function browseHref(ids: BrowsePathIds): string {
  const segments: string[] = [];

  for (const key of ORDERED_KEYS) {
    const value = ids[key];
    if (!value) break;
    segments.push(encodeURIComponent(value));
  }

  return segments.length > 0 ? `/browse/${segments.join('/')}` : '/browse';
}

/**
 * Reads the catch-all segments into named ids.
 *
 * @param segments - `params.path` from the catch-all route, may be undefined
 * @returns Named ids for the levels present in the URL
 */
export function parseBrowseSegments(
  segments: readonly string[] | undefined
): BrowsePathIds {
  const ids: BrowsePathIds = {};

  ORDERED_KEYS.forEach((key, index) => {
    const value = segments?.[index];
    if (value) {
      ids[key] = decodeURIComponent(value);
    }
  });

  return ids;
}

/**
 * How deep a browse URL points.
 *
 * 0 is the university list; 6 is a chapter's note titles. Anything beyond 6 is
 * not a valid browse URL.
 */
export function browseDepth(segments: readonly string[] | undefined): number {
  return segments?.length ?? 0;
}

/** The level a URL of this depth lists children for, or null at the root. */
export function levelAtDepth(depth: number): BrowseLevel | null {
  return depth >= 1 && depth <= BROWSE_LEVELS.length
    ? BROWSE_LEVELS[depth - 1]
    : null;
}
