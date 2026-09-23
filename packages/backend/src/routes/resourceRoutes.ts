import { Request, RequestHandler, Response, Router } from 'express';
import { param, query } from 'express-validator';
import { ResourceType } from '@prisma/client';
import { authenticateStudent } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import {
  SignedUrlError,
  SignedUrlFailure,
  buildSignedDownloadUrl,
  resolveDefaultTtlSeconds,
  signResourceDownload,
  verifyResourceDownloadToken,
} from '../lib/signedUrl';
import {
  RESOURCE_MIME_TYPE,
  getPublishedResource,
  hasLiveStudentSession,
  listResourcesPaginated,
  openResourceFile,
  toDownloadFilename,
  toPublicResourceData,
} from '../services/resource';
import {
  asyncHandler,
  getStudentId,
  handleValidation,
  requireActiveSubscription,
} from './helpers';
import { hasActiveSubscription } from '../services/subscription';
import {
  paginationMeta,
  paginationValidators,
  parsePagination,
} from './adminHelpers';

/**
 * Student resource (PDF) access endpoints
 *
 * GET  /api/resources?subjectId=...        - published resources only
 * POST /api/resources/:id/download-url     - mint a short-lived signed URL
 * GET  /api/resources/download/:token      - stream the file
 *
 * The first two sit behind three gates: authenticated student, live session,
 * active subscription.
 *
 * The download route is deliberately not behind the Authorization header - a
 * browser following a download link does not send one. Instead the signed token
 * identifies the student, and the same authorization is re-checked server-side
 * against current state: the resource must still be published, the student must
 * still have a live session, and the subscription must still be active. A token
 * minted five minutes ago therefore cannot outlive a cancelled subscription, a
 * logout, or an unpublish.
 *
 * Resource files live outside any served directory, so this is the only path to
 * their bytes.
 */
const router = Router();

/** Authenticated student with a live session. */
const studentGuards: RequestHandler[] = [authenticateStudent, requireActiveSession];

const RESOURCE_TYPES = Object.values(ResourceType);

/**
 * GET /api/resources
 * Published resources only, optionally scoped to a subject or chapter.
 */
router.get(
  '/',
  studentGuards,
  [
    query('subjectId').optional().isUUID().withMessage('subjectId must be a valid UUID'),
    query('chapterId').optional().isUUID().withMessage('chapterId must be a valid UUID'),
    query('resourceType')
      .optional()
      .isIn(RESOURCE_TYPES)
      .withMessage(`resourceType must be one of: ${RESOURCE_TYPES.join(', ')}`),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    // Paid content: no listing without an active subscription
    await requireActiveSubscription(studentId);

    const pagination = parsePagination(req);
    const subjectId = req.query.subjectId ? String(req.query.subjectId) : undefined;
    const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
    const resourceType = req.query.resourceType
      ? (String(req.query.resourceType) as ResourceType)
      : undefined;

    const { resources, total } = await listResourcesPaginated({
      subjectId,
      chapterId,
      resourceType,
      publishedOnly: true,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(subjectId ? { subjectId } : {}),
      ...(chapterId ? { chapterId } : {}),
      resources: resources.map(toPublicResourceData),
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/resources/:id/download-url
 *
 * Returns a signed, short-lived URL bound to the requesting student. The URL is
 * not a bearer of access on its own: every gate is re-evaluated when it is
 * redeemed.
 */
router.post(
  '/:id/download-url',
  studentGuards,
  [param('id').isUUID().withMessage('Resource ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const studentId = getStudentId(req);

    await requireActiveSubscription(studentId);

    const resource = await getPublishedResource(req.params.id);

    if (!resource) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Resource not found', 404);
    }

    const signed = signResourceDownload({
      resourceId: resource.id,
      studentId,
      ttlSeconds: resolveDefaultTtlSeconds(),
    });

    res.status(201).json({
      download: {
        url: buildSignedDownloadUrl(signed.token),
        expiresAt: signed.expiresAt.toISOString(),
        expiresInSeconds: signed.expiresInSeconds,
        filename: toDownloadFilename(resource.title),
        fileSizeBytes: resource.fileSizeBytes,
        mimeType: resource.mimeType,
      },
    });
  })
);

/**
 * Maps a token rejection onto an API error.
 *
 * `details.reason` is what a client should branch on: EXPIRED means "ask for a
 * new URL", everything else means "this link is not yours / not real".
 */
function toTokenApiError(error: SignedUrlError): AppError {
  if (error.reason === SignedUrlFailure.EXPIRED) {
    // 410 Gone: the link was genuine but is no longer usable
    return new AppError(ErrorCode.FORBIDDEN, error.message, 410, {
      reason: SignedUrlFailure.EXPIRED,
    });
  }

  return new AppError(
    ErrorCode.FORBIDDEN,
    'Download link is not valid',
    403,
    { reason: error.reason }
  );
}

/**
 * GET /api/resources/download/:token
 * Streams the PDF after verifying the signature, the expiry, and the student's
 * current entitlement.
 */
router.get(
  '/download/:token',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    let verified;
    try {
      // Signature and expiry first: nothing in the token is trusted before this
      verified = verifyResourceDownloadToken(req.params.token);
    } catch (error) {
      if (error instanceof SignedUrlError) {
        // Reason only - a token is never written to the log
        logger.warn(
          { reason: error.reason, endpoint: '/api/resources/download' },
          'Rejected a resource download token'
        );

        throw toTokenApiError(error);
      }

      throw error;
    }

    const { resourceId, studentId } = verified;

    // Re-check current state, not the state at issue time
    const resource = await getPublishedResource(resourceId);

    if (!resource) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Resource not found', 404);
    }

    if (!(await hasLiveStudentSession(studentId))) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Session is no longer valid. Please log in again.',
        401
      );
    }

    if (!(await hasActiveSubscription(studentId))) {
      throw new AppError(
        ErrorCode.NO_ACTIVE_SUBSCRIPTION,
        'No active subscription',
        403
      );
    }

    let file;
    try {
      file = await openResourceFile(resource.storagePath);
    } catch (error) {
      logger.error(
        {
          resourceId: resource.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'Resource row exists but its stored file could not be opened'
      );

      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Resource file is no longer available',
        404
      );
    }

    res.setHeader('Content-Type', RESOURCE_MIME_TYPE);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${toDownloadFilename(resource.title)}"`
    );
    // Do not let a browser or proxy reinterpret or retain paid content
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');

    file.stream.on('error', (error: Error) => {
      logger.error(
        { resourceId: resource.id, errorMessage: error.message },
        'Failed while streaming a resource file'
      );

      // Headers are already out; the truncated response is the only signal left
      res.destroy(error);
    });

    file.stream.pipe(res);
  })
);

export default router;
