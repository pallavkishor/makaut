import { PrismaClient } from '@prisma/client';
import { getDatabaseClient } from '../config/database';

/**
 * Student Engagement Service
 *
 * Bookmarks and reading progress - the per-student state the dashboard needs
 * for "my bookmarks", "recently viewed" and "continue reading".
 *
 * Every function is scoped by studentId. A student's engagement rows are
 * private: callers must pass the studentId derived from the session, never one
 * taken from a request body or query string.
 */

// Allow injecting a Prisma client for testing
let prismaClientOverride: PrismaClient | null = null;

export function setPrismaClient(client: PrismaClient): void {
  prismaClientOverride = client;
}

export function resetPrismaClient(): void {
  prismaClientOverride = null;
}

function getPrisma(): PrismaClient {
  return prismaClientOverride || getDatabaseClient();
}

/** Prisma error code for a unique constraint violation. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

/** Reading progress bounds. Mirrors the CHECK constraint on the table. */
export const PROGRESS_MIN = 0;
export const PROGRESS_MAX = 100;

/** Defaults for the "recently viewed" window. */
export const DEFAULT_RECENT_LIMIT = 10;
export const MAX_RECENT_LIMIT = 50;

/**
 * Coerces a client-supplied progress value into the 0-100 integer range.
 *
 * The database has a CHECK constraint, but a constraint violation surfaces as
 * an opaque 500, so the value is clamped here instead: out-of-range input is
 * saturated, fractional input is floored, and anything non-finite falls back to
 * the minimum.
 *
 * @param value - Raw progress percentage from the client
 * @returns Integer in [PROGRESS_MIN, PROGRESS_MAX]
 */
export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return PROGRESS_MIN;
  }

  const floored = Math.floor(value);

  if (floored < PROGRESS_MIN) {
    return PROGRESS_MIN;
  }

  if (floored > PROGRESS_MAX) {
    return PROGRESS_MAX;
  }

  return floored;
}

/**
 * Clamps a client-supplied "recently viewed" limit.
 *
 * @param value - Raw limit, may be undefined
 * @returns Integer in [1, MAX_RECENT_LIMIT]
 */
export function clampRecentLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_RECENT_LIMIT;
  }

  const floored = Math.floor(value);

  if (floored < 1) {
    return 1;
  }

  return Math.min(floored, MAX_RECENT_LIMIT);
}

/**
 * Where a note sits in the hierarchy, denormalized for list rendering.
 * Fetched in the same query as the owning bookmark / progress row so a list of
 * N rows never costs N extra lookups.
 */
export interface NoteContext {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectName: string;
}

export interface BookmarkRecord {
  id: string;
  studentId: string;
  noteId: string;
  createdAt: Date;
}

export interface BookmarkWithNote extends BookmarkRecord {
  note: NoteContext;
}

export interface BookmarkListResult {
  bookmarks: BookmarkWithNote[];
  total: number;
}

export interface ReadingProgressRecord {
  id: string;
  studentId: string;
  noteId: string;
  progressPercent: number;
  lastViewedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadingProgressWithNote extends ReadingProgressRecord {
  note: NoteContext;
}

export interface PaginationOptions {
  skip?: number;
  take?: number;
}

/**
 * Prisma `include` that pulls the note plus its chapter and subject names in
 * one round trip.
 */
const NOTE_CONTEXT_INCLUDE = {
  note: {
    select: {
      id: true,
      title: true,
      chapterId: true,
      chapter: {
        select: {
          id: true,
          title: true,
          subjectId: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

interface NoteContextRow {
  id: string;
  title: string;
  chapterId: string;
  chapter: {
    id: string;
    title: string;
    subjectId: string;
    subject: { id: string; name: string };
  };
}

function toNoteContext(note: NoteContextRow): NoteContext {
  return {
    id: note.id,
    title: note.title,
    chapterId: note.chapterId,
    chapterTitle: note.chapter.title,
    subjectId: note.chapter.subjectId,
    subjectName: note.chapter.subject.name,
  };
}

/**
 * Looks up a note's hierarchy context without loading its body.
 *
 * Used to turn a bad noteId into a 404 instead of a foreign key violation.
 * Publication state is intentionally not filtered here - student note access
 * does not enforce `is_published` yet (see noteRoutes), so engagement writes
 * follow the same rule.
 *
 * @param noteId - Note UUID
 * @returns The note's context, or null when no such note exists
 */
export async function getNoteContext(noteId: string): Promise<NoteContext | null> {
  const prisma = getPrisma();

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      title: true,
      chapterId: true,
      chapter: {
        select: {
          id: true,
          title: true,
          subjectId: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  return note ? toNoteContext(note) : null;
}

/**
 * Lists one page of a student's bookmarks, newest first, each enriched with the
 * note title and its chapter / subject names.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param options - Pagination window
 * @returns Page of bookmarks plus the student's total bookmark count
 */
export async function listBookmarks(
  studentId: string,
  options: PaginationOptions = {}
): Promise<BookmarkListResult> {
  const prisma = getPrisma();

  const [bookmarks, total] = await Promise.all([
    prisma.bookmark.findMany({
      where: { studentId },
      include: NOTE_CONTEXT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.bookmark.count({ where: { studentId } }),
  ]);

  return {
    bookmarks: bookmarks.map((bookmark) => ({
      id: bookmark.id,
      studentId: bookmark.studentId,
      noteId: bookmark.noteId,
      createdAt: bookmark.createdAt,
      note: toNoteContext(bookmark.note),
    })),
    total,
  };
}

/**
 * Returns a single bookmark, or null when the student has not bookmarked the
 * note.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param noteId - Note UUID
 */
export async function getBookmark(
  studentId: string,
  noteId: string
): Promise<BookmarkRecord | null> {
  const prisma = getPrisma();

  return prisma.bookmark.findUnique({
    where: { studentId_noteId: { studentId, noteId } },
  });
}

export interface AddBookmarkResult {
  bookmark: BookmarkRecord;
  /** False when the bookmark already existed. */
  created: boolean;
}

/**
 * Bookmarks a note for a student. Idempotent: re-bookmarking the same note
 * returns the existing row rather than failing on the
 * (student_id, note_id) unique constraint.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param noteId - Note UUID
 * @returns The bookmark and whether this call created it
 */
export async function addBookmark(
  studentId: string,
  noteId: string
): Promise<AddBookmarkResult> {
  const prisma = getPrisma();

  const existing = await prisma.bookmark.findUnique({
    where: { studentId_noteId: { studentId, noteId } },
  });

  if (existing) {
    return { bookmark: existing, created: false };
  }

  try {
    const bookmark = await prisma.bookmark.create({
      data: { studentId, noteId },
    });

    return { bookmark, created: true };
  } catch (error) {
    // Concurrent double-tap: the row appeared between the read and the write
    if (isUniqueViolation(error)) {
      const raced = await prisma.bookmark.findUnique({
        where: { studentId_noteId: { studentId, noteId } },
      });

      if (raced) {
        return { bookmark: raced, created: false };
      }
    }

    throw error;
  }
}

/**
 * Removes a student's bookmark for a note.
 *
 * Scoped by studentId, so one student can never delete another's bookmark.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param noteId - Note UUID
 * @returns True when a bookmark was removed, false when there was none
 */
export async function removeBookmark(
  studentId: string,
  noteId: string
): Promise<boolean> {
  const prisma = getPrisma();

  const result = await prisma.bookmark.deleteMany({
    where: { studentId, noteId },
  });

  return result.count > 0;
}

/**
 * Returns a student's progress for one note, or null when the note has never
 * been viewed.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param noteId - Note UUID
 */
export async function getReadingProgress(
  studentId: string,
  noteId: string
): Promise<ReadingProgressRecord | null> {
  const prisma = getPrisma();

  return prisma.readingProgress.findUnique({
    where: { studentId_noteId: { studentId, noteId } },
  });
}

/**
 * Lists the notes a student viewed most recently, newest first.
 *
 * Powers both "recently viewed" and "continue reading" - the caller decides
 * whether to filter on progressPercent. Served by the
 * (student_id, last_viewed_at) index.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param limit - Maximum rows to return, clamped to [1, MAX_RECENT_LIMIT]
 * @returns Progress rows enriched with note / chapter / subject names
 */
export async function listRecentReadingProgress(
  studentId: string,
  limit?: number
): Promise<ReadingProgressWithNote[]> {
  const prisma = getPrisma();

  const rows = await prisma.readingProgress.findMany({
    where: { studentId },
    include: NOTE_CONTEXT_INCLUDE,
    orderBy: { lastViewedAt: 'desc' },
    take: clampRecentLimit(limit),
  });

  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    noteId: row.noteId,
    progressPercent: row.progressPercent,
    lastViewedAt: row.lastViewedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    note: toNoteContext(row.note),
  }));
}

/**
 * Records a student's progress through a note.
 *
 * - Upserts on (student_id, note_id): first call creates, later calls update.
 * - The percentage is clamped to 0-100 before it reaches the database.
 * - `lastViewedAt` moves forward on every call.
 * - `completedAt` is stamped the first time progress reaches 100 and is never
 *   overwritten afterwards, so it keeps recording when the note was finished
 *   even if the student re-reads it.
 *
 * @param studentId - Owning student's UUID (from the session)
 * @param noteId - Note UUID
 * @param progressPercent - Raw percentage from the client
 * @returns The stored progress row
 */
export async function upsertReadingProgress(
  studentId: string,
  noteId: string,
  progressPercent: number
): Promise<ReadingProgressRecord> {
  const prisma = getPrisma();

  const clamped = clampProgressPercent(progressPercent);
  const now = new Date();
  const isComplete = clamped >= PROGRESS_MAX;

  const existing = await prisma.readingProgress.findUnique({
    where: { studentId_noteId: { studentId, noteId } },
  });

  // Stamp completion once: only when it is not already stamped
  const stampCompletion = isComplete && !existing?.completedAt;

  const update = {
    progressPercent: clamped,
    lastViewedAt: now,
    ...(stampCompletion ? { completedAt: now } : {}),
  };

  try {
    return await prisma.readingProgress.upsert({
      where: { studentId_noteId: { studentId, noteId } },
      create: {
        studentId,
        noteId,
        progressPercent: clamped,
        lastViewedAt: now,
        completedAt: isComplete ? now : null,
      },
      update,
    });
  } catch (error) {
    // Concurrent first write: the row was inserted between the read and the
    // upsert, so fall back to a plain update
    if (isUniqueViolation(error)) {
      return prisma.readingProgress.update({
        where: { studentId_noteId: { studentId, noteId } },
        data: update,
      });
    }

    throw error;
  }
}
