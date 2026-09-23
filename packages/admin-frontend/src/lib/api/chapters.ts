import { apiRequest } from '../apiClient';
import { unwrapList, unwrapObject } from './normalize';
import type { Chapter, DeletedCounts } from '@/types';

/**
 * Chapter management: the level between a subject and its notes.
 * See `packages/backend/src/routes/adminChapterRoutes.ts`.
 */

const MAX_PAGE_SIZE = 100;

/** Chapters of one subject, in display order, across every page. */
export async function listChapters(subjectId?: string): Promise<Chapter[]> {
  const collected: Chapter[] = [];

  for (let page = 1; ; page += 1) {
    const body = await apiRequest<unknown>('/api/admin/chapters', {
      query: { subjectId, page, pageSize: MAX_PAGE_SIZE },
    });

    const items = unwrapList<Chapter>(body, 'chapters');
    collected.push(...items);

    if (items.length < MAX_PAGE_SIZE) {
      return collected;
    }
  }
}

export async function getChapter(id: string): Promise<Chapter> {
  const body = await apiRequest<unknown>(`/api/admin/chapters/${id}`);

  return unwrapObject<Chapter>(body, 'chapter');
}

export interface CreateChapterInput {
  subjectId: string;
  title: string;
  position?: number;
}

export async function createChapter(
  input: CreateChapterInput
): Promise<Chapter> {
  const body = await apiRequest<unknown>('/api/admin/chapters', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Chapter>(body, 'chapter');
}

export interface UpdateChapterInput {
  title: string;
  position?: number;
  /** Supplying this moves the chapter to another subject. */
  subjectId?: string;
}

export async function updateChapter(
  id: string,
  input: UpdateChapterInput
): Promise<Chapter> {
  const body = await apiRequest<unknown>(`/api/admin/chapters/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<Chapter>(body, 'chapter');
}

/**
 * Rewrites `position` for the listed chapters to match the given order, in one
 * transaction. Every id must belong to `subjectId`: a single foreign id rejects
 * the whole request and nothing is written, so the client never has to undo a
 * partial reorder.
 */
export async function reorderChapters(
  subjectId: string,
  orderedIds: string[]
): Promise<Chapter[]> {
  const body = await apiRequest<unknown>('/api/admin/chapters/reorder', {
    method: 'PATCH',
    body: { subjectId, orderedIds },
  });

  return unwrapList<Chapter>(body, 'chapters');
}

/** Deleting a chapter cascades to its notes and resources. */
export async function deleteChapter(id: string): Promise<DeletedCounts> {
  const body = await apiRequest<unknown>(`/api/admin/chapters/${id}`, {
    method: 'DELETE',
  });

  if (body && typeof body === 'object') {
    const counts = (body as { deletedCounts?: unknown }).deletedCounts;

    if (counts && typeof counts === 'object') {
      return counts as DeletedCounts;
    }
  }

  return {};
}
