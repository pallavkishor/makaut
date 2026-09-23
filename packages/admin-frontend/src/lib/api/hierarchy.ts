import { apiRequest } from '../apiClient';
import { unwrapList, unwrapObject } from './normalize';
import type {
  DeletedCounts,
  HierarchyTree,
  Program,
  Semester,
  Stream,
  University,
} from '@/types';

/**
 * Academic hierarchy calls: universities, programs, streams, semesters and the
 * full navigation tree.
 *
 * Contract notes (see `packages/backend/src/routes/adminHierarchyRoutes.ts`):
 *  - Lists are paginated with `?page=&pageSize=` and capped at 100 per page.
 *    The pickers here want every row, so they page through to the end.
 *  - Updates re-parent the record when the optional parent id is supplied.
 *  - Deletes answer with `deletedCounts`, the cascade that was just performed.
 */

const MAX_PAGE_SIZE = 100;

/** Reads every page of a paginated admin list. */
async function listAll<T>(
  path: string,
  key: string,
  query: Record<string, string | undefined> = {}
): Promise<T[]> {
  const collected: T[] = [];

  for (let page = 1; ; page += 1) {
    const body = await apiRequest<unknown>(path, {
      query: { ...query, page, pageSize: MAX_PAGE_SIZE },
    });

    const items = unwrapList<T>(body, key);
    collected.push(...items);

    const total = readTotal(body);

    if (items.length < MAX_PAGE_SIZE || (total !== null && collected.length >= total)) {
      return collected;
    }
  }
}

function readTotal(body: unknown): number | null {
  if (body && typeof body === 'object') {
    const pagination = (body as { pagination?: unknown }).pagination;

    if (pagination && typeof pagination === 'object') {
      const total = (pagination as { total?: unknown }).total;

      if (typeof total === 'number') {
        return total;
      }
    }
  }

  return null;
}

/** Reads the `deletedCounts` block off a hierarchy delete response. */
function readDeletedCounts(body: unknown): DeletedCounts {
  if (body && typeof body === 'object') {
    const counts = (body as { deletedCounts?: unknown }).deletedCounts;

    if (counts && typeof counts === 'object') {
      return counts as DeletedCounts;
    }
  }

  return {};
}

// ---------------------------------------------------------------------------
// Universities
// ---------------------------------------------------------------------------

export function listUniversities(): Promise<University[]> {
  return listAll<University>('/api/admin/universities', 'universities');
}

export async function createUniversity(name: string): Promise<University> {
  const body = await apiRequest<unknown>('/api/admin/universities', {
    method: 'POST',
    body: { name },
  });

  return unwrapObject<University>(body, 'university');
}

export async function updateUniversity(
  id: string,
  name: string
): Promise<University> {
  const body = await apiRequest<unknown>(`/api/admin/universities/${id}`, {
    method: 'PUT',
    body: { name },
  });

  return unwrapObject<University>(body, 'university');
}

export async function deleteUniversity(id: string): Promise<DeletedCounts> {
  const body = await apiRequest<unknown>(`/api/admin/universities/${id}`, {
    method: 'DELETE',
  });

  return readDeletedCounts(body);
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export function listPrograms(universityId?: string): Promise<Program[]> {
  return listAll<Program>('/api/admin/programs', 'programs', { universityId });
}

export async function createProgram(input: {
  universityId: string;
  name: string;
}): Promise<Program> {
  const body = await apiRequest<unknown>('/api/admin/programs', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Program>(body, 'program');
}

export async function updateProgram(
  id: string,
  input: { name: string; universityId?: string }
): Promise<Program> {
  const body = await apiRequest<unknown>(`/api/admin/programs/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<Program>(body, 'program');
}

export async function deleteProgram(id: string): Promise<DeletedCounts> {
  const body = await apiRequest<unknown>(`/api/admin/programs/${id}`, {
    method: 'DELETE',
  });

  return readDeletedCounts(body);
}

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

export function listStreams(programId?: string): Promise<Stream[]> {
  return listAll<Stream>('/api/admin/streams', 'streams', { programId });
}

export async function createStream(input: {
  programId: string;
  name: string;
}): Promise<Stream> {
  const body = await apiRequest<unknown>('/api/admin/streams', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Stream>(body, 'stream');
}

export async function updateStream(
  id: string,
  input: { name: string; programId?: string }
): Promise<Stream> {
  const body = await apiRequest<unknown>(`/api/admin/streams/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<Stream>(body, 'stream');
}

export async function deleteStream(id: string): Promise<DeletedCounts> {
  const body = await apiRequest<unknown>(`/api/admin/streams/${id}`, {
    method: 'DELETE',
  });

  return readDeletedCounts(body);
}

// ---------------------------------------------------------------------------
// Semesters
// ---------------------------------------------------------------------------

export function listSemesters(streamId?: string): Promise<Semester[]> {
  return listAll<Semester>('/api/admin/semesters', 'semesters', { streamId });
}

export interface SemesterInput {
  streamId?: string;
  number: number;
  /** `null` clears the name; semesters are allowed to be unnamed. */
  name?: string | null;
}

export async function createSemester(
  input: SemesterInput & { streamId: string }
): Promise<Semester> {
  const body = await apiRequest<unknown>('/api/admin/semesters', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Semester>(body, 'semester');
}

export async function updateSemester(
  id: string,
  input: SemesterInput
): Promise<Semester> {
  const body = await apiRequest<unknown>(`/api/admin/semesters/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<Semester>(body, 'semester');
}

export async function deleteSemester(id: string): Promise<DeletedCounts> {
  const body = await apiRequest<unknown>(`/api/admin/semesters/${id}`, {
    method: 'DELETE',
  });

  return readDeletedCounts(body);
}

// ---------------------------------------------------------------------------
// Single-record reads, used to rebuild a path from a deep link
// ---------------------------------------------------------------------------

export async function getProgram(id: string): Promise<Program> {
  const body = await apiRequest<unknown>(`/api/admin/programs/${id}`);

  return unwrapObject<Program>(body, 'program');
}

export async function getStream(id: string): Promise<Stream> {
  const body = await apiRequest<unknown>(`/api/admin/streams/${id}`);

  return unwrapObject<Stream>(body, 'stream');
}

export async function getSemester(id: string): Promise<Semester> {
  const body = await apiRequest<unknown>(`/api/admin/semesters/${id}`);

  return unwrapObject<Semester>(body, 'semester');
}

export interface ResolvedPath {
  universityId: string;
  programId: string;
  streamId: string;
  semesterId: string;
}

/**
 * Walks a semester back up to its university.
 *
 * Deep links (`/chapters?subjectId=...`) name a leaf, but the cascading pickers
 * need every level above it selected. There is no single endpoint for the
 * ancestry, so this climbs one level at a time - three requests, run once and
 * then cached.
 */
export async function resolvePathFromSemester(
  semesterId: string
): Promise<ResolvedPath> {
  const semester = await getSemester(semesterId);
  const stream = await getStream(semester.streamId);
  const program = await getProgram(stream.programId);

  return {
    universityId: program.universityId,
    programId: program.id,
    streamId: stream.id,
    semesterId: semester.id,
  };
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

/** One university's whole hierarchy, down to chapter level, in one request. */
export async function getHierarchyTree(
  universityId: string
): Promise<HierarchyTree> {
  const body = await apiRequest<unknown>('/api/admin/hierarchy/tree', {
    query: { universityId },
  });

  return unwrapObject<HierarchyTree>(body, 'tree');
}
