import express, { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import * as path from 'path';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  createNote,
  deleteNote,
  getChapter,
  getNote,
  listNotes,
  updateNote,
  uploadImage,
} from '../services/content';
import { asyncHandler, handleValidation } from './helpers';
import {
  adminGuards,
  paginationMeta,
  paginationValidators,
  parsePagination,
  toAdminApiError,
} from './adminHelpers';

/**
 * Task 9.4: Admin note management endpoints
 *
 * GET    /api/admin/notes?subjectId=...  - paginated note list (metadata only)
 * POST   /api/admin/notes                - create a note
 * POST   /api/admin/notes/images         - upload an image for note content
 * GET    /api/admin/notes/:id            - note details including content
 * PUT    /api/admin/notes/:id            - update a note
 * DELETE /api/admin/notes/:id            - delete a note
 *
 * Note bodies always go through the content service, which sanitizes HTML
 * before storage - these routes never write note content directly.
 *
 * Requirements: 6.3, 6.4, 6.5, 6.7, 6.8, 6.9
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Raster formats only - SVG is excluded because it can carry script. */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

const noteIdValidator = [
  param('id').isUUID().withMessage('Note ID must be a valid UUID'),
];

const noteContentValidators = [
  body('title')
    .exists({ checkFalsy: true })
    .withMessage('Note title is required')
    .bail()
    .isString()
    .withMessage('Note title is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Note title is required')
    .bail()
    .isLength({ max: 500 })
    .withMessage('Note title must be 500 characters or fewer'),
  body('content')
    .exists()
    .withMessage('Note content is required')
    .bail()
    .isString()
    .withMessage('Note content must be a string'),
  body('position')
    .optional()
    .isInt({ min: 0 })
    .withMessage('position must be an integer of 0 or greater')
    .toInt(),
  body('isPublished')
    .optional()
    .isBoolean()
    .withMessage('isPublished must be true or false')
    .toBoolean(),
];

/**
 * GET /api/admin/notes
 * `subjectId` still works and spans every chapter of that subject.
 * Requirements: 6.8
 */
router.get(
  '/',
  [
    query('subjectId')
      .optional()
      .isUUID()
      .withMessage('subjectId must be a valid UUID'),
    query('chapterId')
      .optional()
      .isUUID()
      .withMessage('chapterId must be a valid UUID'),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const subjectId = req.query.subjectId ? String(req.query.subjectId) : undefined;
    const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;

    const { notes, total } = await listNotes({
      subjectId,
      chapterId,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(subjectId ? { subjectId } : {}),
      ...(chapterId ? { chapterId } : {}),
      notes,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/notes
 * Content is Markdown; the content service strips dangerous raw HTML before
 * storage.
 *
 * TODO(phase2): notes hang off a chapter now, so the caller supplies
 * `chapterId` instead of `subjectId`. There is no chapter admin endpoint yet.
 *
 * Requirements: 6.3, 6.4, 6.5, 6.6
 */
router.post(
  '/',
  [
    body('chapterId').isUUID().withMessage('Chapter ID must be a valid UUID'),
    ...noteContentValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { chapterId, title, content, position, isPublished } = req.body as {
      chapterId: string;
      title: string;
      content: string;
      position?: number;
      isPublished?: boolean;
    };

    // Requirement 6.4: fail with a clear error rather than a FK violation
    const chapter = await getChapter(chapterId);

    if (!chapter) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Chapter not found', 404);
    }

    let note;
    try {
      note = await createNote({ chapterId, title, content, position, isPublished });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Chapter not found',
        foreignKey: 'Chapter does not exist',
      });
    }

    res.status(201).json({ note });
  })
);

/**
 * POST /api/admin/notes/images
 *
 * Accepts either a raw image body (Content-Type: image/png, image/jpeg, ... with
 * the filename in `X-Filename` or `?filename=`) or a JSON body of the shape
 * `{ filename, data }` where `data` is base64 (a `data:` URL prefix is allowed).
 * Declared before /:id so the literal path wins.
 *
 * Requirements: 6.7
 */
router.post(
  '/images',
  express.raw({ type: Object.keys(ALLOWED_IMAGE_TYPES), limit: MAX_IMAGE_BYTES }),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { buffer, filename } = readImageUpload(req);

    if (buffer.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Image file is empty', 400, {
        field: 'data',
      });
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`,
        400,
        { field: 'data' }
      );
    }

    const result = await uploadImage(buffer, filename);

    res.status(201).json({ image: result });
  })
);

/**
 * GET /api/admin/notes/:id
 * Requirements: 6.8
 */
router.get(
  '/:id',
  noteIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const note = await getNote(req.params.id);

    if (!note) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', 404);
    }

    res.status(200).json({ note });
  })
);

/**
 * PUT /api/admin/notes/:id
 * Content is sanitized by the content service before storage.
 * Requirements: 6.8
 */
router.put(
  '/:id',
  [...noteIdValidator, ...noteContentValidators],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, content, position, isPublished } = req.body as {
      title: string;
      content: string;
      position?: number;
      isPublished?: boolean;
    };

    let note;
    try {
      note = await updateNote(req.params.id, { title, content, position, isPublished });
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Note not found' });
    }

    res.status(200).json({ note });
  })
);

/**
 * DELETE /api/admin/notes/:id
 * Requirements: 6.9
 */
router.delete(
  '/:id',
  noteIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const noteId = req.params.id;

    try {
      await deleteNote(noteId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Note not found' });
    }

    res.status(200).json({
      message: 'Note deleted successfully',
      noteId,
    });
  })
);

/**
 * Extracts the image bytes and a safe filename from the request.
 * Rejects anything that is not one of the allowed raster formats.
 */
function readImageUpload(req: Request): { buffer: Buffer; filename: string } {
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

  // Raw binary upload
  if (Buffer.isBuffer(req.body)) {
    const extension = ALLOWED_IMAGE_TYPES[contentType];

    if (!extension) {
      throw unsupportedImageType();
    }

    const provided =
      (typeof req.headers['x-filename'] === 'string' ? req.headers['x-filename'] : '') ||
      (typeof req.query.filename === 'string' ? req.query.filename : '');

    return {
      buffer: req.body,
      filename: safeFilename(provided, extension),
    };
  }

  // JSON base64 upload
  if (contentType === 'application/json') {
    const { filename, data } = (req.body ?? {}) as {
      filename?: unknown;
      data?: unknown;
    };

    if (typeof data !== 'string' || data.trim().length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Image data is required as a base64 string',
        400,
        { field: 'data' }
      );
    }

    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Image filename is required', 400, {
        field: 'filename',
      });
    }

    const extension = path.extname(path.basename(filename)).toLowerCase();

    if (!ALLOWED_IMAGE_EXTENSIONS.includes(extension)) {
      throw unsupportedImageType();
    }

    const base64 = stripDataUrlPrefix(data.trim());

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64.replace(/\s/g, ''))) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Image data is not valid base64', 400, {
        field: 'data',
      });
    }

    return {
      buffer: Buffer.from(base64, 'base64'),
      filename: safeFilename(filename, extension),
    };
  }

  throw unsupportedImageType();
}

function unsupportedImageType(): AppError {
  return new AppError(
    ErrorCode.VALIDATION_ERROR,
    `Unsupported image type. Allowed formats: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`,
    400
  );
}

/**
 * Removes any `data:<mime>;base64,` prefix from a base64 payload.
 */
function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;]+;base64,(.*)$/s.exec(value);
  return match ? match[1] : value;
}

/**
 * Strips directory components so a crafted filename cannot escape the upload
 * directory, and forces a known-good extension.
 */
function safeFilename(provided: string, extension: string): string {
  const base = path.basename(provided || '').replace(/[^A-Za-z0-9._-]/g, '');
  const stem = base.replace(/\.[^.]*$/, '') || 'image';

  return `${stem}${extension}`;
}

export default router;
