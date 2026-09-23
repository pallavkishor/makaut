import type { SelectionInput } from '@/types/api';

/**
 * Client-side rules for a hierarchy selection.
 *
 * The backend validates that a selection is internally coherent - a program from
 * another university, a stream from another program or a semester from another
 * stream is a 400 naming the offending field. These helpers keep the UI from
 * producing such a combination in the first place: picking a level clears
 * everything below it, so the chain the form submits is always one the backend
 * will accept.
 */

/** Selectable levels, shallowest first. `subject` is a search filter only. */
export const HIERARCHY_LEVELS = [
  'university',
  'program',
  'stream',
  'semester',
  'subject',
] as const;

export type HierarchyLevelName = (typeof HIERARCHY_LEVELS)[number];

/** Ids of every selectable level. An unset level is the empty string. */
export interface HierarchySelection {
  universityId: string;
  programId: string;
  streamId: string;
  semesterId: string;
  subjectId: string;
}

export type HierarchyField = keyof HierarchySelection;

/** Level -> the field holding its id. */
export const HIERARCHY_FIELD: Record<HierarchyLevelName, HierarchyField> = {
  university: 'universityId',
  program: 'programId',
  stream: 'streamId',
  semester: 'semesterId',
  subject: 'subjectId',
};

export const EMPTY_HIERARCHY: HierarchySelection = {
  universityId: '',
  programId: '',
  streamId: '',
  semesterId: '',
  subjectId: '',
};

/**
 * Sets one level and clears every level below it.
 *
 * @param current - The selection being edited
 * @param level - The level the student just changed
 * @param id - The chosen id, or '' to clear the level
 * @returns A new selection; `current` is not mutated
 */
export function setHierarchyLevel(
  current: HierarchySelection,
  level: HierarchyLevelName,
  id: string
): HierarchySelection {
  const index = HIERARCHY_LEVELS.indexOf(level);
  const next: HierarchySelection = { ...current, [HIERARCHY_FIELD[level]]: id };

  for (const deeper of HIERARCHY_LEVELS.slice(index + 1)) {
    next[HIERARCHY_FIELD[deeper]] = '';
  }

  return next;
}

/** The deepest level with an id, or null when nothing is selected. */
export function deepestSelectedLevel(
  selection: HierarchySelection
): HierarchyLevelName | null {
  let deepest: HierarchyLevelName | null = null;

  for (const level of HIERARCHY_LEVELS) {
    if (selection[HIERARCHY_FIELD[level]]) {
      deepest = level;
    }
  }

  return deepest;
}

/**
 * Converts the form state into a `PUT /api/catalog/me/selection` body.
 *
 * Empty strings become explicit nulls, which is how the API clears a level; the
 * subject is dropped because a selection only goes as deep as the semester.
 */
export function toSelectionInput(selection: HierarchySelection): SelectionInput {
  return {
    universityId: selection.universityId || null,
    programId: selection.programId || null,
    streamId: selection.streamId || null,
    semesterId: selection.semesterId || null,
  };
}

/** Drops unset levels, producing the query object the search endpoint takes. */
export function toSearchFilters(
  selection: HierarchySelection
): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const level of HIERARCHY_LEVELS) {
    const field = HIERARCHY_FIELD[level];
    const value = selection[field];
    if (value) {
      filters[field] = value;
    }
  }

  return filters;
}
