import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { authenticateStudent } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { getNote } from '../services/content';
import {
  asyncHandler,
  getStudentId,
  handleValidation,
  requireActiveSubscription,
} from './helpers';

/**
 * Task 7.6: Student note access endpoint
 *
 * GET /api/notes/:id - requires an active subscription to the note's subject
 *
 * Requirements: 4.3, 4.4
 */
const router = Router();

// Every route in this router requires a valid student session
router.use(authenticateStudent, requireActiveSession);

router.get(
  '/:id',
  [param('id').isUUID().withMessage('Note ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);
    const note = await getNote(req.params.id);

    if (!note) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', 404);
    }

    // Requirement 4.4: access requires an active subscription.
    // TODO(phase2): this was bound to the note's subject (note.subjectId).
    // Notes hang off chapters now and subscriptions are account-level, so the
    // check is account-wide. Note visibility (is_published) is not enforced
    // here yet either.
    await requireActiveSubscription(studentId);

    res.status(200).json({ note });
  })
);

export default router;
