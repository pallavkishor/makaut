import { Router, Request, Response } from 'express';
import { body, param, query, ValidationChain } from 'express-validator';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  countProgramDescendants,
  countSemesterDescendants,
  countStreamDescendants,
  countUniversityDescendants,
  createProgram,
  createSemester,
  createStream,
  createUniversity,
  deleteProgram,
  deleteSemester,
  deleteStream,
  deleteUniversity,
  getHierarchyTree,
  getProgram,
  getSemester,
  getStream,
  getUniversity,
  listProgramsPaginated,
  listSemestersPaginated,
  listStreamsPaginated,
  listUniversitiesPaginated,
  programExists,
  streamExists,
  universityExists,
  updateProgram,
  updateSemester,
  updateStream,
  updateUniversity,
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
 * Admin academic hierarchy endpoints for every level above a subject.
 *
 * MOUNTING: this router declares the resource prefix itself, so mount it at the
 * root of the admin router (`router.use('/', adminHierarchyRoutes)` inside
 * adminRoutes.ts) to get:
 *
 * GET|POST        /api/admin/universities          - list (paginated) / create
 * GET|PUT|DELETE  /api/admin/universities/:id      - read / update / delete
 * GET|POST        /api/admin/programs              - `?universityId=` filter
 * GET|PUT|DELETE  /api/admin/programs/:id
 * GET|POST        /api/admin/streams               - `?programId=` filter
 * GET|PUT|DELETE  /api/admin/streams/:id
 * GET|POST        /api/admin/semesters             - `?streamId=` filter
 * GET|PUT|DELETE  /api/admin/semesters/:id
 * GET             /api/admin/hierarchy/tree        - full nested tree
 *
 * Two behaviours are consistent across every level:
 *  - Creates (and re-parenting updates) check the parent first and answer 404
 *    with a clear message, instead of letting a FK violation become a 500.
 *  - Deletes count descendants BEFORE deleting and report them, so the admin UI
 *    can warn about the cascade.
 *
 * Requirements: 6.1, 6.2, 6.8, 6.9, 6.10
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

/** `:id` path parameter validator, with a per-level message. */
function idValidator(label: string): ValidationChain {
  return param('id').isUUID().withMessage(`${label} ID must be a valid UUID`);
}

/** Required, trimmed, length-capped `name` body field. */
function nameValidator(label: string): ValidationChain {
  return body('name')
    .exists({ checkFalsy: true })
    .withMessage(`${label} name is required`)
    .bail()
    .isString()
    .withMessage(`${label} name is required`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${label} name is required`)
    .bail()
    .isLength({ max: 255 })
    .withMessage(`${label} name must be 255 characters or fewer`);
}

/** Required UUID body field naming a parent record. */
function parentIdValidator(field: string, label: string): ValidationChain {
  return body(field).isUUID().withMessage(`${label} ID must be a valid UUID`);
}

/** Optional UUID body field, used when an update re-parents a record. */
function optionalParentIdValidator(field: string, label: string): ValidationChain {
  return body(field)
    .optional()
    .isUUID()
    .withMessage(`${label} ID must be a valid UUID`);
}

/** Optional UUID query filter. */
function filterValidator(field: string): ValidationChain {
  return query(field)
    .optional()
    .isUUID()
    .withMessage(`${field} must be a valid UUID`);
}

/** Reads an optional UUID filter off the query string. */
function readFilter(req: Request, field: string): string | undefined {
  return req.query[field] ? String(req.query[field]) : undefined;
}

// ---------------------------------------------------------------------------
// Universities
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/universities
 * Requirements: 6.1, 6.8
 */
router.get(
  '/universities',
  paginationValidators,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);

    const { items, total } = await listUniversitiesPaginated({
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      universities: items,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/universities
 * Requirements: 6.1, 6.2
 */
router.post(
  '/universities',
  [nameValidator('University')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body as { name: string };

    const university = await createUniversity({ name });

    res.status(201).json({ university });
  })
);

/**
 * GET /api/admin/universities/:id
 * Requirements: 6.8
 */
router.get(
  '/universities/:id',
  [idValidator('University')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const university = await getUniversity(req.params.id);

    if (!university) {
      throw new AppError(ErrorCode.NOT_FOUND, 'University not found', 404);
    }

    res.status(200).json({ university });
  })
);

/**
 * PUT /api/admin/universities/:id
 * Requirements: 6.8
 */
router.put(
  '/universities/:id',
  [idValidator('University'), nameValidator('University')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body as { name: string };

    let university;
    try {
      university = await updateUniversity(req.params.id, { name });
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'University not found' });
    }

    res.status(200).json({ university });
  })
);

/**
 * DELETE /api/admin/universities/:id
 * Descendants are counted first so the response reports the whole cascade.
 * Requirements: 6.9, 6.10
 */
router.delete(
  '/universities/:id',
  [idValidator('University')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const universityId = req.params.id;

    // Counted before the delete - afterwards the rows are gone
    const deletedCounts = await countUniversityDescendants(universityId);

    try {
      await deleteUniversity(universityId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'University not found' });
    }

    res.status(200).json({
      message: 'University deleted successfully',
      universityId,
      deletedCounts,
    });
  })
);

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/programs?universityId=...
 * Requirements: 6.1, 6.8
 */
router.get(
  '/programs',
  [filterValidator('universityId'), ...paginationValidators],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const universityId = readFilter(req, 'universityId');

    const { items, total } = await listProgramsPaginated({
      universityId,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(universityId ? { universityId } : {}),
      programs: items,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/programs
 * Requirements: 6.1, 6.2
 */
router.post(
  '/programs',
  [parentIdValidator('universityId', 'University'), nameValidator('Program')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { universityId, name } = req.body as {
      universityId: string;
      name: string;
    };

    // Clear 404 instead of a foreign-key violation surfacing as a 500
    if (!(await universityExists(universityId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'University not found', 404);
    }

    let program;
    try {
      program = await createProgram({ universityId, name });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'University not found',
        foreignKey: 'University does not exist',
      });
    }

    res.status(201).json({ program });
  })
);

/**
 * GET /api/admin/programs/:id
 * Requirements: 6.8
 */
router.get(
  '/programs/:id',
  [idValidator('Program')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const program = await getProgram(req.params.id);

    if (!program) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Program not found', 404);
    }

    res.status(200).json({ program });
  })
);

/**
 * PUT /api/admin/programs/:id
 * `universityId` is optional and moves the program to another university.
 * Requirements: 6.8
 */
router.put(
  '/programs/:id',
  [
    idValidator('Program'),
    nameValidator('Program'),
    optionalParentIdValidator('universityId', 'University'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, universityId } = req.body as {
      name: string;
      universityId?: string;
    };

    if (universityId && !(await universityExists(universityId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'University not found', 404);
    }

    let program;
    try {
      program = await updateProgram(req.params.id, { name, universityId });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Program not found',
        foreignKey: 'University does not exist',
      });
    }

    res.status(200).json({ program });
  })
);

/**
 * DELETE /api/admin/programs/:id
 * Requirements: 6.9, 6.10
 */
router.delete(
  '/programs/:id',
  [idValidator('Program')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const programId = req.params.id;

    const deletedCounts = await countProgramDescendants(programId);

    try {
      await deleteProgram(programId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Program not found' });
    }

    res.status(200).json({
      message: 'Program deleted successfully',
      programId,
      deletedCounts,
    });
  })
);

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/streams?programId=...
 * Requirements: 6.1, 6.8
 */
router.get(
  '/streams',
  [filterValidator('programId'), ...paginationValidators],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const programId = readFilter(req, 'programId');

    const { items, total } = await listStreamsPaginated({
      programId,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(programId ? { programId } : {}),
      streams: items,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/streams
 * Requirements: 6.1, 6.2
 */
router.post(
  '/streams',
  [parentIdValidator('programId', 'Program'), nameValidator('Stream')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { programId, name } = req.body as { programId: string; name: string };

    if (!(await programExists(programId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Program not found', 404);
    }

    let stream;
    try {
      stream = await createStream({ programId, name });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Program not found',
        foreignKey: 'Program does not exist',
      });
    }

    res.status(201).json({ stream });
  })
);

/**
 * GET /api/admin/streams/:id
 * Requirements: 6.8
 */
router.get(
  '/streams/:id',
  [idValidator('Stream')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stream = await getStream(req.params.id);

    if (!stream) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Stream not found', 404);
    }

    res.status(200).json({ stream });
  })
);

/**
 * PUT /api/admin/streams/:id
 * `programId` is optional and moves the stream to another program.
 * Requirements: 6.8
 */
router.put(
  '/streams/:id',
  [
    idValidator('Stream'),
    nameValidator('Stream'),
    optionalParentIdValidator('programId', 'Program'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, programId } = req.body as { name: string; programId?: string };

    if (programId && !(await programExists(programId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Program not found', 404);
    }

    let stream;
    try {
      stream = await updateStream(req.params.id, { name, programId });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Stream not found',
        foreignKey: 'Program does not exist',
      });
    }

    res.status(200).json({ stream });
  })
);

/**
 * DELETE /api/admin/streams/:id
 * Requirements: 6.9, 6.10
 */
router.delete(
  '/streams/:id',
  [idValidator('Stream')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const streamId = req.params.id;

    const deletedCounts = await countStreamDescendants(streamId);

    try {
      await deleteStream(streamId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Stream not found' });
    }

    res.status(200).json({
      message: 'Stream deleted successfully',
      streamId,
      deletedCounts,
    });
  })
);

// ---------------------------------------------------------------------------
// Semesters
// ---------------------------------------------------------------------------

/** Semester `number` is 1-based and capped well above any real programme. */
const semesterNumberValidator = body('number')
  .exists()
  .withMessage('Semester number is required')
  .bail()
  .isInt({ min: 1, max: 20 })
  .withMessage('Semester number must be an integer between 1 and 20')
  .toInt();

/** Semesters may be unnamed - `null` clears an existing name. */
const semesterNameValidator = body('name')
  .optional({ nullable: true })
  .isString()
  .withMessage('Semester name must be a string')
  .bail()
  .trim()
  .isLength({ max: 255 })
  .withMessage('Semester name must be 255 characters or fewer');

/**
 * GET /api/admin/semesters?streamId=...
 * Requirements: 6.1, 6.8
 */
router.get(
  '/semesters',
  [filterValidator('streamId'), ...paginationValidators],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const streamId = readFilter(req, 'streamId');

    const { items, total } = await listSemestersPaginated({
      streamId,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(streamId ? { streamId } : {}),
      semesters: items,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/semesters
 * Requirements: 6.1, 6.2
 */
router.post(
  '/semesters',
  [
    parentIdValidator('streamId', 'Stream'),
    semesterNumberValidator,
    semesterNameValidator,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { streamId, number, name } = req.body as {
      streamId: string;
      number: number;
      name?: string | null;
    };

    if (!(await streamExists(streamId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Stream not found', 404);
    }

    let semester;
    try {
      semester = await createSemester({ streamId, number, name });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Stream not found',
        foreignKey: 'Stream does not exist',
      });
    }

    res.status(201).json({ semester });
  })
);

/**
 * GET /api/admin/semesters/:id
 * Requirements: 6.8
 */
router.get(
  '/semesters/:id',
  [idValidator('Semester')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const semester = await getSemester(req.params.id);

    if (!semester) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Semester not found', 404);
    }

    res.status(200).json({ semester });
  })
);

/**
 * PUT /api/admin/semesters/:id
 * `streamId` is optional and moves the semester to another stream.
 * Requirements: 6.8
 */
router.put(
  '/semesters/:id',
  [
    idValidator('Semester'),
    semesterNumberValidator,
    semesterNameValidator,
    optionalParentIdValidator('streamId', 'Stream'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { number, name, streamId } = req.body as {
      number: number;
      name?: string | null;
      streamId?: string;
    };

    if (streamId && !(await streamExists(streamId))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Stream not found', 404);
    }

    let semester;
    try {
      semester = await updateSemester(req.params.id, { number, name, streamId });
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Semester not found',
        foreignKey: 'Stream does not exist',
      });
    }

    res.status(200).json({ semester });
  })
);

/**
 * DELETE /api/admin/semesters/:id
 * Requirements: 6.9, 6.10
 */
router.delete(
  '/semesters/:id',
  [idValidator('Semester')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const semesterId = req.params.id;

    const deletedCounts = await countSemesterDescendants(semesterId);

    try {
      await deleteSemester(semesterId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Semester not found' });
    }

    res.status(200).json({
      message: 'Semester deleted successfully',
      semesterId,
      deletedCounts,
    });
  })
);

// ---------------------------------------------------------------------------
// Full tree
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/hierarchy/tree?universityId=...
 *
 * The whole university -> program -> stream -> semester -> subject -> chapter
 * tree for the admin navigation pane, loaded with nested includes in one query.
 *
 * Requirements: 6.8
 */
router.get(
  '/hierarchy/tree',
  [query('universityId').isUUID().withMessage('universityId must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const universityId = String(req.query.universityId);

    const tree = await getHierarchyTree(universityId);

    if (!tree) {
      throw new AppError(ErrorCode.NOT_FOUND, 'University not found', 404);
    }

    res.status(200).json({ tree });
  })
);

export default router;
