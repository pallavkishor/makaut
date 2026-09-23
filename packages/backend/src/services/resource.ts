import { PrismaClient, Prisma, Resource, ResourceType } from '@prisma/client';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { getDatabaseClient } from '../config/database';
import { logger } from '../lib/logger';

/**
 * Resource Service
 *
 * Owns the PDF study material hung off a subject and/or a chapter: validation,
 * storage, metadata CRUD, and the reads the protected download path needs.
 *
 * Storage rules (this is paid content):
 *
 * - PDFs only, confirmed by the `%PDF-` magic number rather than the
 *   client-declared Content-Type.
 * - Files are written under `RESOURCE_STORAGE_PATH`, which must sit outside any
 *   statically served directory. Nothing here ever produces a public file URL -
 *   downloads go through a signed token and a subscription check.
 * - The stored filename is generated server-side (`<uuid>.pdf`). A client
 *   filename is only ever a display label.
 */

// Allow injecting a Prisma client for testing
let prismaClientOverride: PrismaClient | null = null;

export function setPrismaClient(client: PrismaClient): void {
  prismaClientOverride = client;
}

export function resetPrismaClient(): void {
  prismaClientOverride = null;
}

function getPrisma(): PrismaClient {
  return prismaClientOverride || getDatabaseClient();
}

/** The only accepted MIME type for a resource file. */
export const RESOURCE_MIME_TYPE = 'application/pdf';

/** Default upload cap: 25 MB. */
export const DEFAULT_MAX_RESOURCE_BYTES = 25 * 1024 * 1024;

/** `%PDF-` - every PDF starts with it. */
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');

/**
 * Configured upload cap, read lazily so the environment can be changed (and
 * tests can shrink it) without reloading the module.
 */
export function resolveMaxResourceBytes(): number {
  const configured = Number(process.env.RESOURCE_MAX_FILE_SIZE_BYTES);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_RESOURCE_BYTES;
  }

  return Math.floor(configured);
}

/**
 * Absolute path of the storage root. Deliberately not under `./uploads`, which
 * is where publicly served note images live.
 */
export function resolveStorageRoot(): string {
  const configured = process.env.RESOURCE_STORAGE_PATH || './storage/resources';

  return path.resolve(configured);
}

/** Why an upload was rejected. */
export enum ResourceUploadFailure {
  EMPTY_FILE = 'EMPTY_FILE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  NOT_A_PDF = 'NOT_A_PDF',
}

/** Thrown for a rejected upload; routes map it to a 400. */
export class ResourceUploadError extends Error {
  constructor(
    public readonly reason: ResourceUploadFailure,
    message: string
  ) {
    super(message);
    this.name = 'ResourceUploadError';
  }
}

/**
 * True when the buffer's leading bytes are the PDF magic number.
 *
 * The declared Content-Type is attacker-controlled, so it is never the basis of
 * the decision: a `.pdf` named HTML file, or an image sent as
 * `application/pdf`, fails here.
 *
 * @param buffer - Uploaded bytes
 */
export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC.length) {
    return false;
  }

  return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

/**
 * Validates an upload: non-empty, within the size cap, and actually a PDF.
 *
 * @param buffer - Uploaded bytes
 * @throws ResourceUploadError when the upload must be rejected
 */
export function assertValidResourceUpload(buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new ResourceUploadError(
      ResourceUploadFailure.EMPTY_FILE,
      'Resource file is empty'
    );
  }

  const maxBytes = resolveMaxResourceBytes();

  if (buffer.length > maxBytes) {
    throw new ResourceUploadError(
      ResourceUploadFailure.FILE_TOO_LARGE,
      `Resource exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit`
    );
  }

  if (!isPdfBuffer(buffer)) {
    throw new ResourceUploadError(
      ResourceUploadFailure.NOT_A_PDF,
      'Resource must be a PDF file'
    );
  }
}

/**
 * Resolves a stored path against the storage root and refuses anything that
 * escapes it.
 *
 * The stored value is server-generated, so this should never fire - it is here
 * so that a tampered or migrated database row cannot turn into an arbitrary
 * file read.
 *
 * @param storagePath - Value from `resources.storage_path`
 */
export function resolveResourceFilePath(storagePath: string): string {
  const root = resolveStorageRoot();
  const absolute = path.resolve(root, storagePath);
  const relative = path.relative(root, absolute);

  if (
    relative.length === 0 ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Resolved resource path escapes the storage root');
  }

  return absolute;
}

/**
 * Writes validated PDF bytes to storage under a generated filename.
 *
 * @param buffer - Validated PDF bytes
 * @returns The stored filename (what goes in `storage_path`) and its size
 */
export async function storeResourceFile(
  buffer: Buffer
): Promise<{ storagePath: string; fileSizeBytes: number }> {
  assertValidResourceUpload(buffer);

  const root = resolveStorageRoot();
  await fs.mkdir(root, { recursive: true });

  // Server-generated name: the client's filename never touches the filesystem
  const storagePath = `${randomUUID()}.pdf`;

  // 0o600: readable by the service account only
  await fs.writeFile(path.join(root, storagePath), buffer, { mode: 0o600 });

  return { storagePath, fileSizeBytes: buffer.length };
}

/**
 * Deletes a stored file. A file that is already gone counts as success.
 *
 * @param storagePath - Value from `resources.storage_path`
 * @returns true when a file was removed
 */
export async function deleteResourceFile(storagePath: string): Promise<boolean> {
  try {
    await fs.unlink(resolveResourceFilePath(storagePath));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export interface ResourceFileHandle {
  stream: Readable;
  sizeBytes: number;
}

/**
 * Opens a stored file for streaming.
 *
 * @param storagePath - Value from `resources.storage_path`
 * @returns A read stream plus the on-disk size, for `Content-Length`
 * @throws Error when the file is missing from storage
 */
export async function openResourceFile(
  storagePath: string
): Promise<ResourceFileHandle> {
  const absolute = resolveResourceFilePath(storagePath);
  const stats = await fs.stat(absolute);

  if (!stats.isFile()) {
    throw new Error('Stored resource is not a regular file');
  }

  return { stream: createReadStream(absolute), sizeBytes: stats.size };
}

/**
 * Metadata as returned to administrators.
 */
export interface ResourceData {
  id: string;
  subjectId: string | null;
  chapterId: string | null;
  title: string;
  description: string | null;
  resourceType: ResourceType;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  isPublished: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Metadata as returned to students: no storage path, no publish flag.
 */
export interface PublicResourceData {
  id: string;
  subjectId: string | null;
  chapterId: string | null;
  title: string;
  description: string | null;
  resourceType: ResourceType;
  fileSizeBytes: number;
  mimeType: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

function toResourceData(resource: Resource): ResourceData {
  return {
    id: resource.id,
    subjectId: resource.subjectId,
    chapterId: resource.chapterId,
    title: resource.title,
    description: resource.description,
    resourceType: resource.resourceType,
    storagePath: resource.storagePath,
    fileSizeBytes: resource.fileSizeBytes,
    mimeType: resource.mimeType,
    isPublished: resource.isPublished,
    position: resource.position,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

/**
 * Strips storage details before a resource is shown to a student.
 *
 * @param resource - Full resource record
 */
export function toPublicResourceData(resource: ResourceData): PublicResourceData {
  return {
    id: resource.id,
    subjectId: resource.subjectId,
    chapterId: resource.chapterId,
    title: resource.title,
    description: resource.description,
    resourceType: resource.resourceType,
    fileSizeBytes: resource.fileSizeBytes,
    mimeType: resource.mimeType,
    position: resource.position,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

export interface CreateResourceInput {
  subjectId?: string | null;
  chapterId?: string | null;
  title: string;
  description?: string | null;
  resourceType: ResourceType;
  storagePath: string;
  fileSizeBytes: number;
  position?: number;
  isPublished?: boolean;
}

export interface UpdateResourceInput {
  title?: string;
  description?: string | null;
  resourceType?: ResourceType;
  subjectId?: string | null;
  chapterId?: string | null;
  position?: number;
  isPublished?: boolean;
}

export interface ResourceFilters {
  subjectId?: string;
  chapterId?: string;
  resourceType?: ResourceType;
  /** When true, unpublished resources are excluded (the student view). */
  publishedOnly?: boolean;
}

export interface ResourcePage {
  resources: ResourceData[];
  total: number;
}

/**
 * Creates a resource row for an already-stored file.
 *
 * The caller stores the file first and is responsible for removing it if this
 * insert fails, so a failed create cannot leave an orphaned PDF on disk.
 *
 * @param input - Resource metadata plus the stored path and size
 */
export async function createResource(
  input: CreateResourceInput
): Promise<ResourceData> {
  const prisma = getPrisma();

  const resource = await prisma.resource.create({
    data: {
      subjectId: input.subjectId ?? null,
      chapterId: input.chapterId ?? null,
      title: input.title,
      description: input.description ?? null,
      resourceType: input.resourceType,
      storagePath: input.storagePath,
      fileSizeBytes: input.fileSizeBytes,
      // Always the verified type, never the client's declared one
      mimeType: RESOURCE_MIME_TYPE,
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
    },
  });

  return toResourceData(resource);
}

/**
 * Retrieves a resource regardless of publish state (admin read).
 *
 * @param id - Resource ID
 * @returns The resource, or null when not found
 */
export async function getResource(id: string): Promise<ResourceData | null> {
  const prisma = getPrisma();

  const resource = await prisma.resource.findUnique({ where: { id } });

  return resource ? toResourceData(resource) : null;
}

/**
 * Retrieves a resource only when it is published (student read).
 *
 * Unpublishing therefore revokes access immediately, including for a signed URL
 * that was minted while the resource was still visible.
 *
 * @param id - Resource ID
 * @returns The published resource, or null when missing or unpublished
 */
export async function getPublishedResource(
  id: string
): Promise<ResourceData | null> {
  const prisma = getPrisma();

  const resource = await prisma.resource.findFirst({
    where: { id, isPublished: true },
  });

  return resource ? toResourceData(resource) : null;
}

function buildResourceWhere(
  filters: ResourceFilters | undefined
): Prisma.ResourceWhereInput {
  return {
    ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters?.chapterId ? { chapterId: filters.chapterId } : {}),
    ...(filters?.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters?.publishedOnly ? { isPublished: true } : {}),
  };
}

/**
 * Lists resources for one page, in display order, with the unpaginated total.
 *
 * @param filters - Optional subject / chapter / type / published filters and a
 *   pagination window
 */
export async function listResourcesPaginated(
  filters: ResourceFilters & { skip?: number; take?: number } = {}
): Promise<ResourcePage> {
  const prisma = getPrisma();

  const where = buildResourceWhere(filters);

  const [resources, total] = await Promise.all([
    prisma.resource.findMany({
      where,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.resource.count({ where }),
  ]);

  return { resources: resources.map(toResourceData), total };
}

/**
 * Updates resource metadata. The stored file, its size and its MIME type are
 * immutable - replacing a file means creating a new resource.
 *
 * @param id - Resource ID
 * @param input - Fields to change; omitted fields are left alone
 * @throws Prisma P2025 when the resource does not exist
 */
export async function updateResource(
  id: string,
  input: UpdateResourceInput
): Promise<ResourceData> {
  const prisma = getPrisma();

  const resource = await prisma.resource.update({
    where: { id },
    data: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.resourceType === undefined ? {} : { resourceType: input.resourceType }),
      ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
      ...(input.chapterId === undefined ? {} : { chapterId: input.chapterId }),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
    },
  });

  return toResourceData(resource);
}

/**
 * Publishes or unpublishes a resource.
 *
 * @param id - Resource ID
 * @param isPublished - Target visibility
 * @throws Prisma P2025 when the resource does not exist
 */
export async function setResourcePublished(
  id: string,
  isPublished: boolean
): Promise<ResourceData> {
  return updateResource(id, { isPublished });
}

export interface DeleteResourceResult {
  resource: ResourceData;
  /** False when the row was removed but no file was found on disk. */
  fileDeleted: boolean;
}

/**
 * Deletes a resource row and the file behind it.
 *
 * The row goes first: if the unlink then fails we are left with an unreferenced
 * file (recoverable, and invisible to students) rather than a row pointing at a
 * file that no longer exists.
 *
 * @param id - Resource ID
 * @returns The deleted record and whether its file was removed
 * @throws Prisma P2025 when the resource does not exist
 */
export async function deleteResource(id: string): Promise<DeleteResourceResult> {
  const prisma = getPrisma();

  const deleted = await prisma.resource.delete({ where: { id } });
  const resource = toResourceData(deleted);

  let fileDeleted = false;

  try {
    fileDeleted = await deleteResourceFile(resource.storagePath);
  } catch (error) {
    // The row is already gone, so the delete is not failed - but an
    // undeletable file needs to be visible to an operator.
    logger.error(
      {
        resourceId: resource.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Deleted resource row but failed to remove its stored file'
    );
  }

  return { resource, fileDeleted };
}

/**
 * Counts live sessions for a student.
 *
 * The download route redeems a signed token that carries no Authorization
 * header, so "is this student still logged in somewhere" is checked here
 * instead. A logged-out student cannot redeem a token that was minted before
 * they logged out.
 *
 * @param studentId - Student ID taken from a verified token
 * @param now - Current time, injectable for tests
 * @returns true when at least one unexpired student session exists
 */
export async function hasLiveStudentSession(
  studentId: string,
  now: Date = new Date()
): Promise<boolean> {
  const prisma = getPrisma();

  const count = await prisma.session.count({
    where: {
      userId: studentId,
      userType: 'student',
      expiresAt: { gt: now },
    },
  });

  return count > 0;
}

/**
 * Builds a safe download filename from a resource title.
 *
 * Path separators, quotes and control characters are stripped so the value
 * cannot break out of the `Content-Disposition` header or suggest a path.
 *
 * @param title - Resource title
 * @returns An ASCII filename ending in `.pdf`
 */
export function toDownloadFilename(title: string): string {
  const base = path
    .basename(title || '')
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/^\.+/, '');

  return `${base.length > 0 ? base : 'resource'}.pdf`;
}
