import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateStudent } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  BookmarkWithNote,
  DEFAULT_RECENT_LIMIT,
  MAX_RECENT_LIMIT,
  NoteContext,
  PROGRESS_MIN,
  ReadingProgressRecord,
  ReadingProgressWithNote,
  addBookmark,
  getNoteContext,
  getReadingProgress,
  listBookmarks,
  listRecentReadingProgress,
  removeBookmark,
  upsertReadingProgress,
} from '../services/engagement';
import {
  asyncHandler,
  getStudentId,
  handleValidation,
  requireActiveSubscription,
} from './helpers';

/**
 * Student engagement endpoints: bookmarks and reading progress.
 *
 * Mount at `/api`:
 *   GET    /api/bookmarks
 *   POST   /api/bookmarks
 *   DELETE /api/bookmarks/:noteId
 *   GET    /api/reading-progress/recent
 *   GET    /api/reading-progress/:noteId
 *   PUT    /api/reading-progress/:noteId
 *
 * Authorization model, applied to every route in this router:
 *   1. valid student JWT           (authenticateStudent)
 *   2. live server-side session    (requireActiveSession)
 *   3. active subscription         (requireActiveSubscription)
 *
 * A student only ever reads or writes their own rows: the student id comes from
 * the session via getStudentId(req) and is never read from the body or query,
 * so there is no way to address another account's bookmarks or progress.
 *
 * Requirements: 3.5, 3.6, 4.3, 4.4
 */
const router = Router();

router.use(authenticateStudent, requireActiveSession);

/**
 * Page size limits for the bookmark listing. Kept local so this router does not
 * depend on the admin helpers.
 */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Reads `?page=` / `?pageSize=` off the request. Values are clamped, so this is
 * safe even if the validators are bypassed.
 */
function parsePagination(req: Request): Pagination {
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);

  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

const paginationValidators = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be an integer of 1 or greater')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: MAX_PAGE_SIZE })
    .withMessage(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`)
    .toInt(),
];

const noteIdParamValidator = [
  param('noteId').isUUID().withMessage('Note ID must be a valid UUID'),
];

/** Shared response shape for note metadata attached to a list row. */
function noteResponse(note: NoteContext): NoteContext {
  return {
    id: note.id,
    title: note.title,
    chapterId: note.chapterId,
    chapterTitle: note.chapterTitle,
    subjectId: note.subjectId,
    subjectName: note.subjectName,
  };
}

function bookmarkResponse(bookmark: BookmarkWithNote): {
  id: string;
  noteId: string;
  createdAt: Date;
  note: NoteContext;
} {
  return {
    id: bookmark.id,
    noteId: bookmark.noteId,
    createdAt: bookmark.createdAt,
    note: noteResponse(bookmark.note),
  };
}

function progressResponse(progress: ReadingProgressRecord): {
  noteId: string;
  progressPercent: number;
  lastViewedAt: Date;
  completedAt: Date | null;
} {
  return {
    noteId: progress.noteId,
    progressPercent: progress.progressPercent,
    lastViewedAt: progress.lastViewedAt,
    completedAt: progress.completedAt,
  };
}

function recentProgressResponse(progress: ReadingProgressWithNote): {
  noteId: string;
  progressPercent: number;
  lastViewedAt: Date;
  completedAt: Date | null;
  note: NoteContext;
} {
  return {
    ...progressResponse(progress),
    note: noteResponse(progress.note),
  };
}

/**
 * GET /api/bookmarks
 * The student's own bookmarks, newest first, each carrying the note title and
 * its chapter / subject names so the dashboard can render the list without a
 * follow-up request per bookmark.
 */
router.get(
  '/bookmarks',
  paginationValidators,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const pagination = parsePagination(req);
    const { bookmarks, total } = await listBookmarks(studentId, {
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      bookmarks: bookmarks.map(bookmarkResponse),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    });
  })
);

/**
 * POST /api/bookmarks
 * Body: { noteId }
 *
 * Idempotent: bookmarking an already-bookmarked note returns the existing
 * bookmark with 200 instead of failing on the unique constraint. A fresh
 * bookmark answers 201.
 */
router.post(
  '/bookmarks',
  [body('noteId').isUUID().withMessage('Note ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const noteId = String(req.body.noteId);

    // Resolve the note first: a missing note is a 404, not a foreign key error
    const note = await getNoteContext(noteId);

    if (!note) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', 404);
    }

    const { bookmark, created } = await addBookmark(studentId, noteId);

    res.status(created ? 201 : 200).json({
      bookmark: {
        id: bookmark.id,
        noteId: bookmark.noteId,
        createdAt: bookmark.createdAt,
        note: noteResponse(note),
      },
      created,
    });
  })
);

/**
 * DELETE /api/bookmarks/:noteId
 * Removes the student's own bookmark. 404 when the note is not bookmarked.
 */
router.delete(
  '/bookmarks/:noteId',
  noteIdParamValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const { noteId } = req.params;
    const removed = await removeBookmark(studentId, noteId);

    if (!removed) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Bookmark not found', 404);
    }

    res.status(200).json({
      message: 'Bookmark removed successfully',
      noteId,
    });
  })
);

/**
 * GET /api/reading-progress/recent?limit=
 * Most recently viewed notes first. Powers "recently viewed" and
 * "continue reading" - the client filters on progressPercent for the latter.
 *
 * Registered before /reading-progress/:noteId so "recent" is not read as a
 * note id.
 */
router.get(
  '/reading-progress/recent',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_RECENT_LIMIT })
      .withMessage(`limit must be an integer between 1 and ${MAX_RECENT_LIMIT}`)
      .toInt(),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;

    const progress = await listRecentReadingProgress(studentId, limit);

    res.status(200).json({
      limit: limit ?? DEFAULT_RECENT_LIMIT,
      progress: progress.map(recentProgressResponse),
    });
  })
);

/**
 * PUT /api/reading-progress/:noteId
 * Body: { progressPercent }
 *
 * Upserts the student's progress. The percentage is clamped to 0-100 in the
 * service, and completedAt is stamped the first time it reaches 100.
 */
router.put(
  '/reading-progress/:noteId',
  [
    ...noteIdParamValidator,
    body('progressPercent')
      .exists()
      .withMessage('progressPercent is required')
      .bail()
      // Out-of-range values are clamped rather than rejected; only
      // non-numeric input is a client error
      .isFloat()
      .withMessage('progressPercent must be a number')
      .toFloat(),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const { noteId } = req.params;
    const note = await getNoteContext(noteId);

    if (!note) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', 404);
    }

    const progress = await upsertReadingProgress(
      studentId,
      noteId,
      Number(req.body.progressPercent)
    );

    res.status(200).json({
      progress: {
        ...progressResponse(progress),
        note: noteResponse(note),
      },
    });
  })
);

/**
 * GET /api/reading-progress/:noteId
 * The student's progress for one note, for resuming where they left off.
 *
 * A note that has never been opened has no row, which is not an error: the
 * response is a zero-progress placeholder so the client can treat it as
 * "start from the beginning". 404 is reserved for a note that does not exist.
 */
router.get(
  '/reading-progress/:noteId',
  noteIdParamValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const { noteId } = req.params;
    const note = await getNoteContext(noteId);

    if (!note) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', 404);
    }

    const progress = await getReadingProgress(studentId, noteId);

    res.status(200).json({
      progress: {
        noteId,
        progressPercent: progress?.progressPercent ?? PROGRESS_MIN,
        lastViewedAt: progress?.lastViewedAt ?? null,
        completedAt: progress?.completedAt ?? null,
        note: noteResponse(note),
      },
    });
  })
);

export default router;
