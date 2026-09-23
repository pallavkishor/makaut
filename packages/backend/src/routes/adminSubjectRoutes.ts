import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  createSubject,
  deleteSubject,
  getSubject,
  listNotes,
  listSubjectsPaginated,
  updateSubject,
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
 * Task 9.3: Admin subject management endpoints
 *
 * GET    /api/admin/subjects      - paginated subject list
 * POST   /api/admin/subjects      - create a subject
 * GET    /api/admin/subjects/:id  - subject details
 * PUT    /api/admin/subjects/:id  - rename a subject
 * DELETE /api/admin/subjects/:id  - delete a subject and all of its notes
 *
 * Requirements: 6.1, 6.2, 6.8, 6.9, 6.10
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const subjectIdValidator = [
  param('id').isUUID().withMessage('Subject ID must be a valid UUID'),
];

const subjectNameValidator = [
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('Subject name is required')
    .bail()
    .isString()
    .withMessage('Subject name is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Subject name is required')
    .bail()
    .isLength({ max: 255 })
    .withMessage('Subject name must be 255 characters or fewer'),
  body('code')
    .optional({ nullable: true })
    .isString()
    .withMessage('Subject code must be a string')
    .bail()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Subject code must be 50 characters or fewer'),
  body('position')
    .optional()
    .isInt({ min: 0 })
    .withMessage('position must be an integer of 0 or greater')
    .toInt(),
];

/**
 * GET /api/admin/subjects?semesterId=...
 * Requirements: 6.1, 6.8
 */
router.get(
  '/',
  [
    query('semesterId')
      .optional()
      .isUUID()
      .withMessage('semesterId must be a valid UUID'),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const semesterId = req.query.semesterId
      ? String(req.query.semesterId)
      : undefined;

    const { subjects, total } = await listSubjectsPaginated({
      semesterId,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(semesterId ? { semesterId } : {}),
      subjects,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/subjects
 *
 * TODO(phase2): subjects hang off a semester now, so the caller must supply
 * `semesterId`. There is no endpoint to create semesters yet - that arrives with
 * the hierarchy admin API.
 *
 * Requirements: 6.1, 6.2
 */
router.post(
  '/',
  [
    body('semesterId').isUUID().withMessage('Semester ID must be a valid UUID'),
    ...subjectNameValidator,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { semesterId, name, code, position } = req.body as {
      semesterId: string;
      name: string;
      code?: string;
      position?: number;
    };

    let subject;
    try {
      subject = await createSubject({ semesterId, name, code, position });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Semester not found',
        foreignKey: 'Semester does not exist',
      });
    }

    res.status(201).json({ subject });
  })
);

/**
 * GET /api/admin/subjects/:id
 * Requirements: 6.8
 */
router.get(
  '/:id',
  subjectIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const subject = await getSubject(req.params.id);

    if (!subject) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
    }

    // Only the total is used; take: 1 keeps the row fetch trivial
    const { total } = await listNotes({ subjectId: subject.id, take: 1 });

    res.status(200).json({
      subject: {
        ...subject,
        noteCount: total,
      },
    });
  })
);

/**
 * PUT /api/admin/subjects/:id
 * Requirements: 6.8
 */
router.put(
  '/:id',
  [...subjectIdValidator, ...subjectNameValidator],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, code, position } = req.body as {
      name: string;
      code?: string;
      position?: number;
    };

    let subject;
    try {
      subject = await updateSubject(req.params.id, { name, code, position });
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Subject not found' });
    }

    res.status(200).json({ subject });
  })
);

/**
 * DELETE /api/admin/subjects/:id
 * Notes are removed with the subject via the cascading FK on notes.subject_id.
 * Requirements: 6.9, 6.10
 */
router.delete(
  '/:id',
  subjectIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const subjectId = req.params.id;

    // Counted before the delete so the response can report the cascade
    const { total: deletedNoteCount } = await listNotes({ subjectId, take: 1 });

    try {
      await deleteSubject(subjectId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Subject not found' });
    }

    res.status(200).json({
      message: 'Subject deleted successfully',
      subjectId,
      deletedNoteCount,
    });
  })
);

export default router;
