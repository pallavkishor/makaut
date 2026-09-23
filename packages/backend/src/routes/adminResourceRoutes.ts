import express, { NextFunction, Request, Response, Router } from 'express';
import { param, query } from 'express-validator';
import * as path from 'path';
import { ResourceType } from '@prisma/client';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { getChapter, getSubject } from '../services/content';
import {
  RESOURCE_MIME_TYPE,
  ResourceUploadError,
  createResource,
  deleteResource,
  deleteResourceFile,
  getResource,
  listResourcesPaginated,
  resolveMaxResourceBytes,
  setResourcePublished,
  storeResourceFile,
  updateResource,
} from '../services/resource';
import { asyncHandler, handleValidation } from './helpers';
import {
  adminGuards,
  paginationMeta,
  paginationValidators,
  parsePagination,
  toAdminApiError,
} from './adminHelpers';

/**
 * Admin resource (PDF) management endpoints
 *
 * GET    /api/admin/resources             - paginated list, filterable
 * POST   /api/admin/resources             - upload a PDF and create the record
 * GET    /api/admin/resources/:id         - resource details
 * PUT    /api/admin/resources/:id         - update metadata (file is immutable)
 * POST   /api/admin/resources/:id/publish   - make visible to students
 * POST   /api/admin/resources/:id/unpublish - hide from students
 * DELETE /api/admin/resources/:id         - delete the record and its file
 *
 * Uploads follow the same raw/base64 convention as the note image endpoint
 * (multer is not a dependency):
 *
 * - `Content-Type: application/pdf` with the bytes as the body, and metadata in
 *   the query string (`?title=...&resourceType=...&subjectId=...`).
 * - `Content-Type: application/json` with
 *   `{ title, resourceType, subjectId?, chapterId?, filename?, data }` where
 *   `data` is base64 (a `data:` URL prefix is tolerated).
 *
 * The raw form is the one to use for large files: base64 inflates the payload by
 * a third and the app-wide JSON body limit applies to it.
 */
const router = Router();

// Every route requires a live admin session
router.use(adminGuards);

const RESOURCE_TYPES = Object.values(ResourceType);

const resourceIdValidator = [
  param('id').isUUID().withMessage('Resource ID must be a valid UUID'),
];

/** Metadata accepted on create, from either the query string or a JSON body. */
interface ResourceMetadataInput {
  title: string;
  description: string | null;
  resourceType: ResourceType;
  subjectId: string | null;
  chapterId: string | null;
  position?: number;
  isPublished?: boolean;
}

function validationError(message: string, field: string): AppError {
  return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, { field });
}

function readString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, field);
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readUuid(
  source: Record<string, unknown>,
  field: string
): string | undefined {
  const value = readString(source, field);

  if (value === undefined) {
    return undefined;
  }

  if (!UUID_PATTERN.test(value)) {
    throw validationError(`${field} must be a valid UUID`, field);
  }

  return value;
}

function readBoolean(
  source: Record<string, unknown>,
  field: string
): boolean | undefined {
  const value = source[field];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw validationError(`${field} must be true or false`, field);
}

function readPosition(source: Record<string, unknown>): number | undefined {
  const value = source.position;

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw validationError(
      'position must be an integer of 0 or greater',
      'position'
    );
  }

  return parsed;
}

function readResourceType(source: Record<string, unknown>): ResourceType {
  const value = readString(source, 'resourceType');

  if (value === undefined) {
    throw validationError('resourceType is required', 'resourceType');
  }

  const match = RESOURCE_TYPES.find((type) => type === value.toUpperCase());

  if (!match) {
    throw validationError(
      `resourceType must be one of: ${RESOURCE_TYPES.join(', ')}`,
      'resourceType'
    );
  }

  return match;
}

/**
 * Validates the metadata that accompanies an upload.
 *
 * Every resource must hang off a subject or a chapter - an unparented resource
 * would be invisible in every listing.
 */
function readResourceMetadata(
  source: Record<string, unknown>
): ResourceMetadataInput {
  const title = readString(source, 'title');

  if (title === undefined) {
    throw validationError('Resource title is required', 'title');
  }

  if (title.length > 500) {
    throw validationError(
      'Resource title must be 500 characters or fewer',
      'title'
    );
  }

  const subjectId = readUuid(source, 'subjectId');
  const chapterId = readUuid(source, 'chapterId');

  if (!subjectId && !chapterId) {
    throw validationError(
      'A resource must reference a subjectId, a chapterId, or both',
      'subjectId'
    );
  }

  return {
    title,
    description: readString(source, 'description') ?? null,
    resourceType: readResourceType(source),
    subjectId: subjectId ?? null,
    chapterId: chapterId ?? null,
    position: readPosition(source),
    isPublished: readBoolean(source, 'isPublished'),
  };
}

/**
 * Confirms the referenced subject / chapter exist, so a bad reference is a clear
 * 404 rather than a foreign key error after the file has been written.
 */
async function assertParentsExist(metadata: ResourceMetadataInput): Promise<void> {
  if (metadata.subjectId && !(await getSubject(metadata.subjectId))) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
  }

  if (metadata.chapterId) {
    const chapter = await getChapter(metadata.chapterId);

    if (!chapter) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Chapter not found', 404);
    }

    if (metadata.subjectId && chapter.subjectId !== metadata.subjectId) {
      throw validationError(
        'chapterId does not belong to the given subjectId',
        'chapterId'
      );
    }
  }
}

function contentTypeOf(req: Request): string {
  return (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

function unsupportedUploadType(): AppError {
  return new AppError(
    ErrorCode.VALIDATION_ERROR,
    'Resource uploads must be a PDF: send the bytes with Content-Type: application/pdf, or JSON with a base64 `data` field',
    400
  );
}

function payloadTooLarge(): AppError {
  const maxBytes = resolveMaxResourceBytes();

  return new AppError(
    ErrorCode.VALIDATION_ERROR,
    `Resource exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit`,
    413,
    { field: 'data' }
  );
}

/**
 * Reads the raw PDF body, capped at the configured limit.
 *
 * The parser is built per request so that changing the cap does not require a
 * restart, and its 413 is translated into the standard error envelope instead of
 * surfacing as an unhandled 500.
 */
function readRawPdfBody(req: Request, res: Response, next: NextFunction): void {
  if (contentTypeOf(req) !== RESOURCE_MIME_TYPE) {
    next();
    return;
  }

  const maxBytes = resolveMaxResourceBytes();
  const declaredLength = Number(req.headers['content-length']);

  // Fail before reading the body when the client has already told us it is
  // too big
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    next(payloadTooLarge());
    return;
  }

  express.raw({ type: RESOURCE_MIME_TYPE, limit: maxBytes })(
    req,
    res,
    (error?: unknown) => {
      if (!error) {
        next();
        return;
      }

      const type = (error as { type?: string }).type;
      const status = (error as { status?: number }).status;

      if (type === 'entity.too.large' || status === 413) {
        next(payloadTooLarge());
        return;
      }

      next(error);
    }
  );
}

/** Removes any `data:<mime>;base64,` prefix from a base64 payload. */
function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;]+;base64,(.*)$/s.exec(value);

  return match ? match[1] : value;
}

/**
 * Extracts the PDF bytes and the metadata from either upload form.
 *
 * A client-supplied filename is never used as a path: it is reduced to its
 * basename and only kept to check the extension.
 */
function readUpload(req: Request): {
  buffer: Buffer;
  metadata: ResourceMetadataInput;
} {
  const contentType = contentTypeOf(req);

  if (contentType === RESOURCE_MIME_TYPE) {
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Resource file body is missing',
        400,
        { field: 'data' }
      );
    }

    return {
      buffer: req.body,
      metadata: readResourceMetadata(req.query as Record<string, unknown>),
    };
  }

  if (contentType === 'application/json') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data = body.data;

    if (typeof data !== 'string' || data.trim().length === 0) {
      throw validationError(
        'Resource data is required as a base64 string',
        'data'
      );
    }

    const filename = readString(body, 'filename');

    if (filename !== undefined) {
      const extension = path.extname(path.basename(filename)).toLowerCase();

      if (extension !== '.pdf') {
        throw validationError('Resource file must be a .pdf', 'filename');
      }
    }

    const base64 = stripDataUrlPrefix(data.trim()).replace(/\s/g, '');

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw validationError('Resource data is not valid base64', 'data');
    }

    return {
      buffer: Buffer.from(base64, 'base64'),
      metadata: readResourceMetadata(body),
    };
  }

  throw unsupportedUploadType();
}

/**
 * GET /api/admin/resources
 * Filters: subjectId, chapterId, resourceType, isPublished.
 */
router.get(
  '/',
  [
    query('subjectId').optional().isUUID().withMessage('subjectId must be a valid UUID'),
    query('chapterId').optional().isUUID().withMessage('chapterId must be a valid UUID'),
    query('resourceType')
      .optional()
      .isIn(RESOURCE_TYPES)
      .withMessage(`resourceType must be one of: ${RESOURCE_TYPES.join(', ')}`),
    query('isPublished')
      .optional()
      .isBoolean()
      .withMessage('isPublished must be true or false')
      .toBoolean(),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pagination = parsePagination(req);
    const subjectId = req.query.subjectId ? String(req.query.subjectId) : undefined;
    const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
    const resourceType = req.query.resourceType
      ? (String(req.query.resourceType) as ResourceType)
      : undefined;
    // `.toBoolean()` has already coerced the value; the query typings still
    // describe it as a string
    const publishedOnly = (req.query.isPublished as unknown) === true;

    const { resources, total } = await listResourcesPaginated({
      subjectId,
      chapterId,
      resourceType,
      publishedOnly,
      skip: pagination.skip,
      take: pagination.take,
    });

    res.status(200).json({
      ...(subjectId ? { subjectId } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(resourceType ? { resourceType } : {}),
      resources,
      pagination: paginationMeta(pagination, total),
    });
  })
);

/**
 * POST /api/admin/resources
 *
 * PDF only, verified by magic number rather than the declared Content-Type, and
 * capped at `RESOURCE_MAX_FILE_SIZE_BYTES` (25MB by default). The file is
 * written under `RESOURCE_STORAGE_PATH` with a generated name and is not
 * reachable by any static URL.
 */
router.post(
  '/',
  readRawPdfBody,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { buffer, metadata } = readUpload(req);

    // Check references before anything is written to disk
    await assertParentsExist(metadata);

    let storagePath: string;
    let fileSizeBytes: number;

    try {
      ({ storagePath, fileSizeBytes } = await storeResourceFile(buffer));
    } catch (error) {
      if (error instanceof ResourceUploadError) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, error.message, 400, {
          field: 'data',
          reason: error.reason,
        });
      }

      throw error;
    }

    let resource;
    try {
      resource = await createResource({
        ...metadata,
        storagePath,
        fileSizeBytes,
      });
    } catch (error) {
      // Never leave a stored file with no row pointing at it
      await deleteResourceFile(storagePath).catch(() => undefined);

      throw toAdminApiError(error, {
        notFound: 'Subject or chapter not found',
        foreignKey: 'Subject or chapter does not exist',
      });
    }

    res.status(201).json({ resource });
  })
);

/**
 * GET /api/admin/resources/:id
 */
router.get(
  '/:id',
  resourceIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const resource = await getResource(req.params.id);

    if (!resource) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Resource not found', 404);
    }

    res.status(200).json({ resource });
  })
);

/**
 * PUT /api/admin/resources/:id
 * Metadata only - the stored file, its size and its MIME type cannot change.
 */
router.put(
  '/:id',
  resourceIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const metadata = readResourceMetadata(body);

    await assertParentsExist(metadata);

    let resource;
    try {
      resource = await updateResource(req.params.id, metadata);
    } catch (error) {
      throw toAdminApiError(error, {
        notFound: 'Resource not found',
        foreignKey: 'Subject or chapter does not exist',
      });
    }

    res.status(200).json({ resource });
  })
);

/**
 * POST /api/admin/resources/:id/publish
 */
router.post(
  '/:id/publish',
  resourceIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    let resource;
    try {
      resource = await setResourcePublished(req.params.id, true);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Resource not found' });
    }

    res.status(200).json({ resource });
  })
);

/**
 * POST /api/admin/resources/:id/unpublish
 * Takes effect immediately, including for download URLs already in flight.
 */
router.post(
  '/:id/unpublish',
  resourceIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    let resource;
    try {
      resource = await setResourcePublished(req.params.id, false);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Resource not found' });
    }

    res.status(200).json({ resource });
  })
);

/**
 * DELETE /api/admin/resources/:id
 * Removes the stored PDF as well as the row.
 */
router.delete(
  '/:id',
  resourceIdValidator,
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const resourceId = req.params.id;

    let result;
    try {
      result = await deleteResource(resourceId);
    } catch (error) {
      throw toAdminApiError(error, { notFound: 'Resource not found' });
    }

    res.status(200).json({
      message: 'Resource deleted successfully',
      resourceId,
      fileDeleted: result.fileDeleted,
    });
  })
);

export default router;
