import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { authenticateStudent } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  getNotesForSubject,
  getSubject,
  listSubjects,
  searchNotes,
} from '../services/content';
import { getActiveSubscriptions } from '../services/subscription';
import {
  asyncHandler,
  getStudentId,
  handleValidation,
  requireActiveSubscription,
} from './helpers';

/**
 * Task 7.4: Student subject access endpoints
 *
 * GET /api/subjects                  - catalogue, requires an active subscription
 * GET /api/subjects/:id              - requires active subscription
 * GET /api/subjects/:id/notes        - requires active subscription
 * GET /api/subjects/:id/search?q=... - requires active subscription
 *
 * Requirements: 3.4, 3.5, 3.6, 4.1, 4.2, 4.7, 4.8
 */
const router = Router();

// Every route in this router requires a valid student session
router.use(authenticateStudent, requireActiveSession);

const subjectIdValidator = [
  param('id').isUUID().withMessage('Subject ID must be a valid UUID'),
];

/**
 * GET /api/subjects
 *
 * TODO(phase2): this used to list exactly the subjects the student held a
 * subscription to. Subscriptions are account-level now, so it returns the
 * catalogue instead - it must be scoped to the student's selected semester
 * (students.selected_semester_id) once the hierarchy endpoints exist.
 *
 * Requirements: 3.4, 3.7
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const [subjects, subscriptions] = await Promise.all([
      listSubjects(),
      getActiveSubscriptions(studentId),
    ]);

    // Account-level access: the furthest period end is when access lapses
    const accessEndsAt = subscriptions.reduce<Date | null>(
      (latest, subscription) =>
        !latest || subscription.currentPeriodEnd > latest
          ? subscription.currentPeriodEnd
          : latest,
      null
    );

    res.status(200).json({
      accessEndsAt,
      subjects: subjects.map((subject) => ({
        id: subject.id,
        semesterId: subject.semesterId,
        name: subject.name,
        code: subject.code,
        position: subject.position,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      })),
    });
  })
);

/**
 * GET /api/subjects/:id
 * Requirements: 3.5, 3.6, 4.1
 */
router.get(
  '/:id',
  subjectIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const subjectId = req.params.id;

    // Fail closed: authorize before revealing anything about the subject
    await requireActiveSubscription(studentId);

    const subject = await getSubject(subjectId);

    if (!subject) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
    }

    res.status(200).json({ subject });
  })
);

/**
 * GET /api/subjects/:id/notes
 * Returns the subject's notes across all of its chapters.
 * Requirements: 3.5, 3.6, 4.1, 4.2
 */
router.get(
  '/:id/notes',
  subjectIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const subjectId = req.params.id;

    await requireActiveSubscription(studentId);

    const notes = await getNotesForSubject(subjectId);

    res.status(200).json({
      subjectId,
      notes: notes.map((note) => ({
        id: note.id,
        chapterId: note.chapterId,
        title: note.title,
        position: note.position,
        isPublished: note.isPublished,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
    });
  })
);

/**
 * GET /api/subjects/:id/search?q=...
 * Requirements: 3.5, 3.6, 4.7, 4.8
 */
router.get(
  '/:id/search',
  [
    ...subjectIdValidator,
    query('q')
      .exists({ checkFalsy: true })
      .withMessage('Search query is required')
      .bail()
      .isString()
      .withMessage('Search query is required')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('Search query is required'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const subjectId = req.params.id;
    const searchQuery = String(req.query.q).trim();

    await requireActiveSubscription(studentId);

    const notes = await searchNotes({ subjectId, query: searchQuery });

    res.status(200).json({
      subjectId,
      query: searchQuery,
      notes: notes.map((note) => ({
        id: note.id,
        chapterId: note.chapterId,
        title: note.title,
        position: note.position,
        isPublished: note.isPublished,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
    });
  })
);

export default router;
