import { apiRequest } from '../apiClient';
import { unwrapList, unwrapObject } from './normalize';
import type { Subject } from '@/types';

/**
 * Subject management. Subjects hang off a semester now, so every create call
 * must name one (`packages/backend/src/routes/adminSubjectRoutes.ts`).
 */

const MAX_PAGE_SIZE = 100;

export async function listSubjects(semesterId?: string): Promise<Subject[]> {
  const collected: Subject[] = [];

  for (let page = 1; ; page += 1) {
    const body = await apiRequest<unknown>('/api/admin/subjects', {
      query: { semesterId, page, pageSize: MAX_PAGE_SIZE },
    });

    const items = unwrapList<Subject>(body, 'subjects');
    collected.push(...items);

    if (items.length < MAX_PAGE_SIZE) {
      return collected;
    }
  }
}

/** Includes `noteCount`, which the list endpoint does not return. */
export async function getSubject(id: string): Promise<Subject> {
  const body = await apiRequest<unknown>(`/api/admin/subjects/${id}`);

  return unwrapObject<Subject>(body, 'subject');
}

export interface CreateSubjectInput {
  semesterId: string;
  name: string;
  code?: string | null;
  position?: number;
}

export async function createSubject(
  input: CreateSubjectInput
): Promise<Subject> {
  const body = await apiRequest<unknown>('/api/admin/subjects', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Subject>(body, 'subject');
}

export interface UpdateSubjectInput {
  name: string;
  code?: string | null;
  position?: number;
}

/**
 * Updates a subject. The endpoint does not accept `semesterId`, so a subject
 * cannot be moved to another semester through this route.
 */
export async function updateSubject(
  id: string,
  input: UpdateSubjectInput
): Promise<Subject> {
  const body = await apiRequest<unknown>(`/api/admin/subjects/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<Subject>(body, 'subject');
}

/**
 * Deleting a subject cascades to its chapters, notes and resources.
 *
 * @returns The note count the server reported as deleted.
 */
export async function deleteSubject(id: string): Promise<number> {
  const body = await apiRequest<unknown>(`/api/admin/subjects/${id}`, {
    method: 'DELETE',
  });

  if (body && typeof body === 'object') {
    const count = (body as { deletedNoteCount?: unknown }).deletedNoteCount;

    if (typeof count === 'number') {
      return count;
    }
  }

  return 0;
}
