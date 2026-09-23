import { apiRequest, apiUploadRaw, type QueryValue } from '../apiClient';
import { PDF_MIME_TYPE } from '../pdf';
import {
  readTotal,
  unwrapList,
  unwrapObject,
  unwrapPaginated,
} from './normalize';
import type { Paginated, Resource, ResourceType } from '@/types';

/**
 * PDF resource management (`packages/backend/src/routes/adminResourceRoutes.ts`).
 *
 * Uploads take one of two forms. This module always uses the raw one:
 *
 *   POST /api/admin/resources
 *   Content-Type: application/pdf
 *   ?title=...&resourceType=...&subjectId=...      <- metadata in the query
 *   <the PDF bytes as the body>
 *
 * The alternative is a JSON body with a base64 `data` field, which is subject to
 * the app-wide 10MB JSON limit and inflates the payload by a third - roughly a
 * 7.5MB effective ceiling, against 25MB for raw. Raw also gives us real upload
 * progress.
 *
 * The stored file is immutable: `PUT` changes metadata only, and replacing a PDF
 * means uploading a new resource.
 */

export interface ResourceFilters {
  subjectId?: string;
  chapterId?: string;
  resourceType?: ResourceType;
  /** The server only understands "published only"; it cannot filter to drafts. */
  publishedOnly?: boolean;
}

export interface ListResourcesParams extends ResourceFilters {
  page?: number;
  pageSize?: number;
}

function filterQuery(filters: ResourceFilters): Record<string, QueryValue> {
  return {
    subjectId: filters.subjectId,
    chapterId: filters.chapterId,
    resourceType: filters.resourceType,
    // Sending `isPublished=false` would be read as "no filter" by the server,
    // so it is only sent when it actually narrows the list.
    isPublished: filters.publishedOnly ? true : undefined,
  };
}

export async function listResources({
  page = 1,
  pageSize = 20,
  ...filters
}: ListResourcesParams = {}): Promise<Paginated<Resource>> {
  const body = await apiRequest<unknown>('/api/admin/resources', {
    query: { ...filterQuery(filters), page, pageSize },
  });

  return unwrapPaginated<Resource>(body, 'resources', { page, pageSize });
}

/** Resource count for the filters, without transferring the rows. */
export async function countResources(
  filters: ResourceFilters
): Promise<number> {
  const body = await apiRequest<unknown>('/api/admin/resources', {
    query: { ...filterQuery(filters), page: 1, pageSize: 1 },
  });

  return readTotal(body) ?? unwrapList<Resource>(body, 'resources').length;
}

export async function getResource(id: string): Promise<Resource> {
  const body = await apiRequest<unknown>(`/api/admin/resources/${id}`);

  return unwrapObject<Resource>(body, 'resource');
}

export interface ResourceMetadata {
  title: string;
  description?: string | null;
  resourceType: ResourceType;
  /** A resource must reference a subject, a chapter, or both. */
  subjectId?: string | null;
  chapterId?: string | null;
  position?: number;
  isPublished?: boolean;
}

export interface UploadResourceInput extends ResourceMetadata {
  file: File;
  onProgress?: (fraction: number | null) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a PDF and creates its record.
 *
 * A 413 comes back when the file exceeds the server cap; the message names the
 * limit, so it is surfaced verbatim.
 */
export async function uploadResource({
  file,
  onProgress,
  signal,
  ...metadata
}: UploadResourceInput): Promise<Resource> {
  const body = await apiUploadRaw<unknown>('/api/admin/resources', {
    contentType: PDF_MIME_TYPE,
    file,
    query: {
      title: metadata.title,
      description: metadata.description ?? undefined,
      resourceType: metadata.resourceType,
      subjectId: metadata.subjectId ?? undefined,
      chapterId: metadata.chapterId ?? undefined,
      position: metadata.position,
      isPublished: metadata.isPublished,
    },
    onProgress,
    signal,
  });

  return unwrapObject<Resource>(body, 'resource');
}

/**
 * Replaces the resource's metadata.
 *
 * Every field the create call validates is validated again here, including the
 * "must reference a subject or a chapter" rule, so this is a full replacement
 * rather than a patch.
 */
export async function updateResource(
  id: string,
  metadata: ResourceMetadata
): Promise<Resource> {
  const body = await apiRequest<unknown>(`/api/admin/resources/${id}`, {
    method: 'PUT',
    body: {
      title: metadata.title,
      description: metadata.description ?? null,
      resourceType: metadata.resourceType,
      subjectId: metadata.subjectId ?? null,
      chapterId: metadata.chapterId ?? null,
      ...(metadata.position === undefined ? {} : { position: metadata.position }),
      ...(metadata.isPublished === undefined
        ? {}
        : { isPublished: metadata.isPublished }),
    },
  });

  return unwrapObject<Resource>(body, 'resource');
}

/** Publishing and unpublishing both take effect immediately for students. */
export async function setResourcePublished(
  id: string,
  published: boolean
): Promise<Resource> {
  const body = await apiRequest<unknown>(
    `/api/admin/resources/${id}/${published ? 'publish' : 'unpublish'}`,
    { method: 'POST' }
  );

  return unwrapObject<Resource>(body, 'resource');
}

/** Removes the record and the stored PDF. */
export async function deleteResource(id: string): Promise<void> {
  await apiRequest<unknown>(`/api/admin/resources/${id}`, { method: 'DELETE' });
}
