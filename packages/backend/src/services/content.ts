import { PrismaClient, Prisma } from '@prisma/client';
import { getDatabaseClient } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

/**
 * Content Management Service
 * Handles subject management, chapter lookup, note management, image uploads
 * and note search.
 *
 * Hierarchy after the schema redesign:
 *   University > Program > Stream > Semester > Subject > Chapter > Note
 *
 * TODO(phase2): the university / program / stream / semester / chapter levels
 * and the resources table only have the read helpers this service needed to
 * keep compiling. Full admin CRUD for them is the next phase.
 */

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

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

// Configuration for image storage
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || './uploads/images';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || '/uploads/images';

/**
 * Task 6.1: Subject Management Service
 * Implements subject creation, retrieval, update, and deletion with cascading delete
 */

export interface Subject {
  id: string;
  semesterId: string;
  name: string;
  code: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubjectInput {
  semesterId: string;
  name: string;
  code?: string | null;
  position?: number;
}

export interface UpdateSubjectInput {
  name: string;
  code?: string | null;
  position?: number;
}

/**
 * Creates a new subject under a semester
 * @param input - Subject creation data
 * @returns Created subject
 */
export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const prisma = getPrisma();

  const subject = await prisma.subject.create({
    data: {
      semesterId: input.semesterId,
      name: input.name,
      code: input.code ?? null,
      ...(input.position === undefined ? {} : { position: input.position }),
    },
  });

  return subject;
}

/**
 * Retrieves a subject by ID
 * @param id - Subject ID
 * @returns Subject if found, null otherwise
 */
export async function getSubject(id: string): Promise<Subject | null> {
  const prisma = getPrisma();
  
  const subject = await prisma.subject.findUnique({
    where: { id },
  });
  
  return subject;
}

/**
 * Updates a subject
 * @param id - Subject ID
 * @param input - Subject update data
 * @returns Updated subject
 */
export async function updateSubject(id: string, input: UpdateSubjectInput): Promise<Subject> {
  const prisma = getPrisma();

  const subject = await prisma.subject.update({
    where: { id },
    data: {
      name: input.name,
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.position === undefined ? {} : { position: input.position }),
    },
  });

  return subject;
}

/**
 * Deletes a subject and all associated chapters, notes and resources
 * (cascading delete)
 * @param id - Subject ID
 */
export async function deleteSubject(id: string): Promise<void> {
  const prisma = getPrisma();
  
  // Prisma handles cascading delete automatically based on schema definition
  await prisma.subject.delete({
    where: { id },
  });
}

/**
 * Lists all subjects
 * @param semesterId - Optional semester to scope the listing to
 * @returns Array of subjects
 */
export async function listSubjects(semesterId?: string): Promise<Subject[]> {
  const prisma = getPrisma();

  const subjects = await prisma.subject.findMany({
    where: semesterId ? { semesterId } : {},
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  });

  return subjects;
}

/**
 * Chapter lookup
 *
 * Notes hang off chapters, so note writes need to be able to check that the
 * target chapter exists.
 */

export interface Chapter {
  id: string;
  subjectId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Retrieves a chapter by ID
 * @param id - Chapter ID
 * @returns Chapter if found, null otherwise
 */
export async function getChapter(id: string): Promise<Chapter | null> {
  const prisma = getPrisma();

  const chapter = await prisma.chapter.findUnique({
    where: { id },
  });

  return chapter;
}

/**
 * Lists the chapters of a subject in display order
 * @param subjectId - Subject ID
 * @returns Array of chapters
 */
export async function getChaptersForSubject(subjectId: string): Promise<Chapter[]> {
  const prisma = getPrisma();

  const chapters = await prisma.chapter.findMany({
    where: { subjectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return chapters;
}

/**
 * Task 6.2: Note Management Service
 * Implements note creation, retrieval, update, and deletion.
 *
 * Note content is Markdown (it was sanitized HTML before the schema redesign).
 * Markdown is stored as authored, minus raw HTML constructs that can execute
 * script - see sanitizeNoteContent.
 */

export interface Note {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  position: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNoteInput {
  chapterId: string;
  title: string;
  content: string;
  position?: number;
  isPublished?: boolean;
}

export interface UpdateNoteInput {
  title: string;
  content: string;
  position?: number;
  isPublished?: boolean;
}

/** Raw HTML elements that can execute script or exfiltrate, stripped wholesale. */
const DANGEROUS_HTML_BLOCKS =
  /<\s*(script|iframe|object|embed|style|link|meta|base|form)\b[\s\S]*?(<\s*\/\s*\1\s*>|>)/gi;

/** Self-closing / unclosed variants of the same elements. */
const DANGEROUS_HTML_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|base|form)\b[^>]*>/gi;

/** Inline event handlers, e.g. onclick= / onerror= inside raw HTML. */
const INLINE_EVENT_HANDLERS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** javascript: and data:text/html URLs, in both Markdown links and raw HTML. */
const DANGEROUS_URL_SCHEMES = /(javascript|vbscript|data)\s*:\s*(?=[^\s)]*(text\/html|script|[(]))/gi;

/**
 * Removes the raw-HTML constructs that could execute script from Markdown
 * source, while leaving Markdown syntax untouched.
 *
 * This is storage-time defence in depth only. The renderer MUST still sanitize
 * the HTML it produces from this Markdown (e.g. DOMPurify on the rendered
 * output, or a Markdown renderer with raw HTML disabled).
 *
 * @param markdown - Markdown source as authored
 * @returns Markdown with dangerous raw HTML removed
 */
function sanitizeNoteContent(markdown: string): string {
  return markdown
    .replace(DANGEROUS_HTML_BLOCKS, '')
    .replace(DANGEROUS_HTML_TAGS, '')
    .replace(INLINE_EVENT_HANDLERS, '')
    .replace(DANGEROUS_URL_SCHEMES, 'removed:');
}

/**
 * Creates a new note under a chapter
 * @param input - Note creation data
 * @returns Created note
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const prisma = getPrisma();

  const note = await prisma.note.create({
    data: {
      chapterId: input.chapterId,
      title: input.title,
      content: sanitizeNoteContent(input.content),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
    },
  });

  return note;
}

/**
 * Retrieves a note by ID
 * @param id - Note ID
 * @returns Note if found, null otherwise
 */
export async function getNote(id: string): Promise<Note | null> {
  const prisma = getPrisma();
  
  const note = await prisma.note.findUnique({
    where: { id },
  });
  
  return note;
}

/**
 * Updates a note
 * @param id - Note ID
 * @param input - Note update data
 * @returns Updated note
 */
export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
  const prisma = getPrisma();

  const note = await prisma.note.update({
    where: { id },
    data: {
      title: input.title,
      content: sanitizeNoteContent(input.content),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
    },
  });

  return note;
}

/**
 * Deletes a note
 * @param id - Note ID
 */
export async function deleteNote(id: string): Promise<void> {
  const prisma = getPrisma();
  
  await prisma.note.delete({
    where: { id },
  });
}

/**
 * Retrieves all notes of a chapter in display order
 * @param chapterId - Chapter ID
 * @returns Array of notes for the chapter
 */
export async function getNotesForChapter(chapterId: string): Promise<Note[]> {
  const prisma = getPrisma();

  const notes = await prisma.note.findMany({
    where: { chapterId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return notes;
}

/**
 * Retrieves all notes of a subject, across all of its chapters, in display
 * order (chapter position, then note position).
 *
 * @param subjectId - Subject ID
 * @returns Array of notes for the subject
 */
export async function getNotesForSubject(subjectId: string): Promise<Note[]> {
  const prisma = getPrisma();

  const notes = await prisma.note.findMany({
    where: {
      chapter: { subjectId },
    },
    orderBy: [
      { chapter: { position: 'asc' } },
      { position: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  return notes;
}

/**
 * Task 6.3: Image Upload Service
 * Implements multipart image upload with local storage (S3 can be added later)
 */

export interface UploadImageResult {
  url: string;
  filename: string;
}

/**
 * Uploads an image file to storage and returns the URL
 * @param file - Image file buffer
 * @param originalFilename - Original filename
 * @returns Image URL and stored filename
 */
export async function uploadImage(file: Buffer, originalFilename: string): Promise<UploadImageResult> {
  // Generate a unique filename to prevent collisions
  const timestamp = Date.now();
  const ext = path.extname(originalFilename);
  const filename = `${timestamp}-${Math.random().toString(36).substring(7)}${ext}`;
  
  // Ensure storage directory exists
  await mkdir(IMAGE_STORAGE_PATH, { recursive: true });
  
  // Write file to storage
  const filepath = path.join(IMAGE_STORAGE_PATH, filename);
  await writeFile(filepath, file);
  
  // Return URL for embedding in note content
  const url = `${IMAGE_BASE_URL}/${filename}`;
  
  return {
    url,
    filename,
  };
}

/**
 * Task 6.5: Note Search Service
 *
 * Uses the generated `notes.search_vector` tsvector column (title weighted
 * above body) and its GIN index, so search never has to read every note body.
 * The column is generated and therefore invisible to Prisma Client, so the
 * query is raw.
 */

export interface SearchNotesInput {
  subjectId: string;
  query: string;
}

interface NoteRow {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  position: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Searches notes within a subject by title or content using PostgreSQL
 * full-text search, ranked with title matches first.
 *
 * @param input - Search parameters
 * @returns Array of matching notes, most relevant first
 */
export async function searchNotes(input: SearchNotesInput): Promise<Note[]> {
  const prisma = getPrisma();

  const trimmed = input.query.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const notes = await prisma.$queryRaw<NoteRow[]>(Prisma.sql`
    SELECT n."id",
           n."chapter_id"   AS "chapterId",
           n."title",
           n."content",
           n."position",
           n."is_published" AS "isPublished",
           n."created_at"   AS "createdAt",
           n."updated_at"   AS "updatedAt"
      FROM "notes" n
      JOIN "chapters" c ON c."id" = n."chapter_id"
     WHERE c."subject_id" = ${input.subjectId}::uuid
       AND n."search_vector" @@ websearch_to_tsquery('english', ${trimmed})
     ORDER BY ts_rank(n."search_vector", websearch_to_tsquery('english', ${trimmed})) DESC,
              n."created_at" DESC
  `);

  return notes;
}

/**
 * Task 9.3 / 9.4: Paginated admin listings
 *
 * The note listing selects metadata only - note bodies are returned by
 * getNote() so list responses stay small.
 *
 * Requirements: 6.1, 6.3, 6.8
 */

export interface PaginationOptions {
  skip?: number;
  take?: number;
}

export interface SubjectListResult {
  subjects: Subject[];
  total: number;
}

export interface NoteSummary {
  id: string;
  chapterId: string;
  title: string;
  position: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteListResult {
  notes: NoteSummary[];
  total: number;
}

/**
 * Lists subjects for a single page, in display order.
 *
 * @param options - Pagination window and optional semester filter
 * @returns Page of subjects plus the total subject count
 */
export async function listSubjectsPaginated(
  options: PaginationOptions & { semesterId?: string } = {}
): Promise<SubjectListResult> {
  const prisma = getPrisma();

  const where = options.semesterId ? { semesterId: options.semesterId } : {};

  const [subjects, total] = await Promise.all([
    prisma.subject.findMany({
      where,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      skip: options.skip,
      take: options.take,
    }),
    prisma.subject.count({ where }),
  ]);

  return { subjects, total };
}

/**
 * Lists note metadata, optionally scoped to one chapter or to every chapter of
 * one subject.
 *
 * @param options - Optional chapter / subject filter and pagination window
 * @returns Page of note summaries plus the total matching count
 */
export async function listNotes(
  options: PaginationOptions & { chapterId?: string; subjectId?: string } = {}
): Promise<NoteListResult> {
  const prisma = getPrisma();

  const where: Prisma.NoteWhereInput = {
    ...(options.chapterId ? { chapterId: options.chapterId } : {}),
    ...(options.subjectId ? { chapter: { subjectId: options.subjectId } } : {}),
  };

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      // Metadata only - note bodies are fetched individually
      select: {
        id: true,
        chapterId: true,
        title: true,
        position: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.note.count({ where }),
  ]);

  return { notes, total };
}
