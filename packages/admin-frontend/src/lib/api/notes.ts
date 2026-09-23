import { apiRequest, apiUploadRaw } from '../apiClient';
import { readTotal, unwrapList, unwrapObject } from './normalize';
import type { Note, NoteSummary, UploadedImage } from '@/types';

/**
 * Note management. Notes hang off a chapter, and their content is Markdown -
 * the backend strips raw HTML constructs that can execute script before storing
 * it (`packages/backend/src/routes/adminNoteRoutes.ts`).
 */

const MAX_PAGE_SIZE = 100;

export interface NoteFilters {
  /** Spans every chapter of the subject. */
  subjectId?: string;
  chapterId?: string;
}

export async function listNotes(
  filters: NoteFilters = {}
): Promise<NoteSummary[]> {
  const collected: NoteSummary[] = [];

  for (let page = 1; ; page += 1) {
    const body = await apiRequest<unknown>('/api/admin/notes', {
      query: { ...filters, page, pageSize: MAX_PAGE_SIZE },
    });

    const items = unwrapList<NoteSummary>(body, 'notes');
    collected.push(...items);

    if (items.length < MAX_PAGE_SIZE) {
      return collected;
    }
  }
}

/**
 * Number of notes matching the filters, without transferring the rows.
 * Used to price up a cascading delete before it is confirmed.
 */
export async function countNotes(filters: NoteFilters): Promise<number> {
  const body = await apiRequest<unknown>('/api/admin/notes', {
    query: { ...filters, page: 1, pageSize: 1 },
  });

  return readTotal(body) ?? unwrapList<NoteSummary>(body, 'notes').length;
}

export async function getNote(id: string): Promise<Note> {
  const body = await apiRequest<unknown>(`/api/admin/notes/${id}`);

  return unwrapObject<Note>(body, 'note');
}

export interface CreateNoteInput {
  chapterId: string;
  title: string;
  /** Markdown. */
  content: string;
  position?: number;
  isPublished?: boolean;
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const body = await apiRequest<unknown>('/api/admin/notes', {
    method: 'POST',
    body: input,
  });

  return unwrapObject<Note>(body, 'note');
}

export interface UpdateNoteInput {
  title: string;
  content: string;
  position?: number;
  isPublished?: boolean;
}

/**
 * Updates a note. The endpoint does not accept `chapterId`, so a note cannot be
 * moved between chapters through this route.
 */
export async function updateNote(
  id: string,
  input: UpdateNoteInput
): Promise<Note> {
  const body = await apiRequest<unknown>(`/api/admin/notes/${id}`, {
    method: 'PUT',
    body: input,
  });

  return unwrapObject<Note>(body, 'note');
}

export async function deleteNote(id: string): Promise<void> {
  await apiRequest<unknown>(`/api/admin/notes/${id}`, { method: 'DELETE' });
}

/**
 * Uploads an image for embedding in note Markdown.
 *
 * The endpoint takes the raw bytes with the real image Content-Type and reads
 * the filename from the query string. It is not a multipart endpoint.
 */
export async function uploadNoteImage(file: File): Promise<UploadedImage> {
  const body = await apiUploadRaw<unknown>('/api/admin/notes/images', {
    contentType: file.type,
    file,
    query: { filename: file.name },
  });

  return unwrapObject<UploadedImage>(body, 'image');
}
