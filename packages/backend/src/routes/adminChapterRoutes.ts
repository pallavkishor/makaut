import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  countChapterDescendants,
  createChapter,
  deleteChapter,
  getChapterById,
  listChaptersPaginated,
  reorderChapters,
  subjectExists,
  updateChapter,
} from '../services/hierarchy';
import { asyncHandler, handleValidation } from './helpers';
import {
  adminGuards,
  paginationMeta,
  paginationValidators,
  parsePagination,
  toAdminApiError,
} from './adminHelpers';

/**
 * Admin chapter management endpoints - the level between a subject and its
 * notes.
 *
 * MOUNTING: mount at `/chapters` on the admin router
 * (`router.use('/chapters', adminChapterRoutes)` inside adminRoutes.ts):
 *
 * GET    /api/admin/chapters?subjectId=...  - paginated chapter list
 * POST   /api/admin/chapters                - create a chapter
 * PATCH  /api/admin/chapters/reorder        - rewrite positions in bulk
 * GET    /api/admin/chapters/:id            - chapter details
 * PUT    /api/admin/chapters/:id            - update a chapter
 * DELETE /api/admin/chapters/:id            - delete a chapter and its notes
 *
 * Requirements: 6.1, 6.2, 6.8, 6.9, 6.10
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const chapterIdValidator = [
  param('id').isUUID().withMessage('Chapter ID must be a valid UUID'),
];

const chapterContentValidators = [
  body('title')
    .exists({ checkFalsy: true })
    .withMessage('Chapter title is required')
    .bail()
    .isString()
    .withMessage('Chapter title is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Chapter title is required')
    .bail()
    .isLength({ max: 500 })
    .withMessage('Chapter title must be 500 characters or fewer'),
  body('position')
    .optional()
    .isInt({ min: 0 })
    .withMessage('position must be an integer of 0 or greater')
    .toInt(),
];

/**
 * GET /api/admin/chapters?subjectId=...
 * Requirements: 6.1, 6.8
 */
router.get(
  '/',
  [
    query('subjectId')
      .optional()
      .isUUID()
      .withMessage('subjectId must be a valid UUID'),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const subjectId = req.query.subjectId ? String(req.query.subjectId) : undefined;

    const { items, total } = await listChaptersPaginated({
      subjectId,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(subjectId ? { subjectId } : {}),
      chapters: items,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/chapters
 * Requirements: 6.1, 6.2
 */
router.post(
  '/',
  [
    body('subjectId').isUUID().withMessage('Subject ID must be a valid UUID'),
    ...chapterContentValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { subjectId, title, position } = req.body as {
      subjectId: string;
      title: string;
      position?: number;
    };

    // Clear 404 instead of a foreign-key violation surfacing as a 500
    if (!(await subjectExists(subjectId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
    }

    let chapter;
    try {
      chapter = await createChapter({ subjectId, title, position });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Subject not found',
        foreignKey: 'Subject does not exist',
      });
    }

    res.status(201).json({ chapter });
  })
);

/**
 * PATCH /api/admin/chapters/reorder
 *
 * Rewrites `position` for the listed chapters to match the order given, in one
 * transaction. Declared before /:id so the literal path wins. Every id must
 * belong to `subjectId` - a single foreign id rejects the whole request and
 * nothing is written.
 *
 * Requirements: 6.8
 */
router.patch(
  '/reorder',
  [
    body('subjectId').isUUID().withMessage('Subject ID must be a valid UUID'),
    body('orderedIds')
      .isArray({ min: 1 })
      .withMessage('orderedIds must be a non-empty array of chapter IDs')
      .bail()
      .custom((value: unknown[]) => new Set(value).size === value.length)
      .withMessage('orderedIds must not contain duplicate chapter IDs'),
    body('orderedIds.*')
      .isUUID()
      .withMessage('Every entry in orderedIds must be a valid UUID'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { subjectId, orderedIds } = req.body as {
      subjectId: string;
      orderedIds: string[];
    };

    if (!(await subjectExists(subjectId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
    }

    const { invalidIds, chapters } = await reorderChapters({
      subjectId,
      orderedIds,
    });

    if (invalidIds.length > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Every chapter must belong to the given subject',
        400,
        { field: 'orderedIds', invalidIds }
      );
    }

    res.status(200).json({
      message: 'Chapters reordered successfully',
      subjectId,
      chapters,
    });
  })
);

/**
 * GET /api/admin/chapters/:id
 * Requirements: 6.8
 */
router.get(
  '/:id',
  chapterIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const chapter = await getChapterById(req.params.id);

    if (!chapter) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Chapter not found', 404);
    }

    res.status(200).json({ chapter });
  })
);

/**
 * PUT /api/admin/chapters/:id
 * `subjectId` is optional and moves the chapter to another subject.
 * Requirements: 6.8
 */
router.put(
  '/:id',
  [
    ...chapterIdValidator,
    ...chapterContentValidators,
    body('subjectId')
      .optional()
      .isUUID()
      .withMessage('Subject ID must be a valid UUID'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, position, subjectId } = req.body as {
      title: string;
      position?: number;
      subjectId?: string;
    };

    if (subjectId && !(await subjectExists(subjectId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
    }

    let chapter;
    try {
      chapter = await updateChapter(req.params.id, { title, position, subjectId });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Chapter not found',
        foreignKey: 'Subject does not exist',
      });
    }

    res.status(200).json({ chapter });
  })
);

/**
 * DELETE /api/admin/chapters/:id
 * Notes and resources are removed with the chapter via the cascading FKs, so
 * they are counted before the delete.
 * Requirements: 6.9, 6.10
 */
router.delete(
  '/:id',
  chapterIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const chapterId = req.params.id;

    const deletedCounts = await countChapterDescendants(chapterId);

    try {
      await deleteChapter(chapterId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Chapter not found' });
    }

    res.status(200).json({
      message: 'Chapter deleted successfully',
      chapterId,
      deletedCounts,
    });
  })
);

export default router;
