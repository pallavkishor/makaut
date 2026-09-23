import { PrismaClient, Prisma } from '@prisma/client';
import { getDatabaseClient } from '../config/database';

/**
 * Academic Hierarchy Service
 *
 * CRUD for every level of the admin-managed academic hierarchy above a subject,
 * plus the chapter level below it:
 *
 *   University > Program > Stream > Semester > Subject > Chapter > Note
 *
 * Subjects and notes keep their own service (`services/content.ts`); this
 * service owns the levels the content service only had read helpers for.
 *
 * Two conventions that the admin routes depend on:
 *  - `*Exists` helpers let a route return a 404 with a clear message instead of
 *    letting a foreign-key violation surface as a 500 on create.
 *  - `count*Descendants` helpers are called BEFORE a delete, so the response can
 *    tell the admin UI exactly what the cascading FKs removed.
 *
 * Requirements: 6.1, 6.2, 6.8, 6.9, 6.10
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

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface University {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Program {
  id: string;
  universityId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Stream {
  id: string;
  programId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Semester {
  id: string;
  streamId: string;
  number: number;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: string;
  subjectId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationOptions {
  skip?: number;
  take?: number;
}

/**
 * One page of a listing plus the total number of matching rows, so the caller
 * can build pagination metadata.
 */
export interface ListResult<T> {
  items: T[];
  total: number;
}

/**
 * What a cascading delete will remove, counted before the delete runs.
 * Each level reports only the levels strictly below it.
 */
export interface UniversityDeletionImpact {
  programs: number;
  streams: number;
  semesters: number;
  subjects: number;
  chapters: number;
  notes: number;
  resources: number;
}

export type ProgramDeletionImpact = Omit<UniversityDeletionImpact, 'programs'>;
export type StreamDeletionImpact = Omit<ProgramDeletionImpact, 'streams'>;
export type SemesterDeletionImpact = Omit<StreamDeletionImpact, 'semesters'>;

export interface ChapterDeletionImpact {
  notes: number;
  resources: number;
}

/**
 * Counts everything hanging off a set of subjects, identified by a subject
 * filter rather than an id so the same code serves every level of the
 * hierarchy (a semester's subjects, a stream's subjects, and so on).
 *
 * Resources attach to a subject and/or a chapter, hence the OR.
 *
 * @param prisma - Prisma client to query with
 * @param subjectWhere - Filter selecting the subjects in scope
 * @returns Counts of subjects, chapters, notes and resources in scope
 */
async function countBelowSubjects(
  prisma: PrismaClient,
  subjectWhere: Prisma.SubjectWhereInput
): Promise<SemesterDeletionImpact> {
  const [subjects, chapters, notes, resources] = await Promise.all([
    prisma.subject.count({ where: subjectWhere }),
    prisma.chapter.count({ where: { subject: subjectWhere } }),
    prisma.note.count({ where: { chapter: { subject: subjectWhere } } }),
    prisma.resource.count({
      where: {
        OR: [{ subject: subjectWhere }, { chapter: { subject: subjectWhere } }],
      },
    }),
  ]);

  return { subjects, chapters, notes, resources };
}

// ---------------------------------------------------------------------------
// Universities
// ---------------------------------------------------------------------------

export interface CreateUniversityInput {
  name: string;
}

export interface UpdateUniversityInput {
  name: string;
}

/**
 * Lists universities for a single page, alphabetically.
 *
 * @param options - Pagination window
 * @returns Page of universities plus the total count
 */
export async function listUniversitiesPaginated(
  options: PaginationOptions = {}
): Promise<ListResult<University>> {
  const prisma = getPrisma();

  const [items, total] = await Promise.all([
    prisma.university.findMany({
      orderBy: { name: 'asc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.university.count(),
  ]);

  return { items, total };
}

/**
 * Creates a university.
 *
 * @param input - University data
 * @returns Created university
 */
export async function createUniversity(
  input: CreateUniversityInput
): Promise<University> {
  const prisma = getPrisma();

  return prisma.university.create({
    data: { name: input.name },
  });
}

/**
 * Retrieves a university by ID.
 *
 * @param id - University ID
 * @returns University if found, null otherwise
 */
export async function getUniversity(id: string): Promise<University | null> {
  const prisma = getPrisma();

  return prisma.university.findUnique({ where: { id } });
}

/**
 * Reports whether a university exists, without fetching its columns.
 *
 * @param id - University ID
 * @returns True when the university exists
 */
export async function universityExists(id: string): Promise<boolean> {
  const prisma = getPrisma();

  const found = await prisma.university.findUnique({
    where: { id },
    select: { id: true },
  });

  return found !== null;
}

/**
 * Renames a university.
 *
 * @param id - University ID
 * @param input - Fields to update
 * @returns Updated university
 */
export async function updateUniversity(
  id: string,
  input: UpdateUniversityInput
): Promise<University> {
  const prisma = getPrisma();

  return prisma.university.update({
    where: { id },
    data: { name: input.name },
  });
}

/**
 * Deletes a university. Programs, streams, semesters, subjects, chapters, notes
 * and resources below it go with it via the cascading FKs.
 *
 * @param id - University ID
 */
export async function deleteUniversity(id: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.university.delete({ where: { id } });
}

/**
 * Counts everything a university delete would cascade to.
 * Call this BEFORE deleting.
 *
 * @param id - University ID
 * @returns Descendant counts per level
 */
export async function countUniversityDescendants(
  id: string
): Promise<UniversityDeletionImpact> {
  const prisma = getPrisma();

  const [programs, streams, semesters, below] = await Promise.all([
    prisma.program.count({ where: { universityId: id } }),
    prisma.stream.count({ where: { program: { universityId: id } } }),
    prisma.semester.count({
      where: { stream: { program: { universityId: id } } },
    }),
    countBelowSubjects(prisma, {
      semester: { stream: { program: { universityId: id } } },
    }),
  ]);

  return { programs, streams, semesters, ...below };
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export interface CreateProgramInput {
  universityId: string;
  name: string;
}

export interface UpdateProgramInput {
  name: string;
  /** Optional: moves the program under a different university. */
  universityId?: string;
}

/**
 * Lists programs for a single page, optionally scoped to one university.
 *
 * @param options - Pagination window and optional university filter
 * @returns Page of programs plus the total matching count
 */
export async function listProgramsPaginated(
  options: PaginationOptions & { universityId?: string } = {}
): Promise<ListResult<Program>> {
  const prisma = getPrisma();

  const where: Prisma.ProgramWhereInput = options.universityId
    ? { universityId: options.universityId }
    : {};

  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total };
}

/**
 * Creates a program under a university.
 *
 * @param input - Program data
 * @returns Created program
 */
export async function createProgram(input: CreateProgramInput): Promise<Program> {
  const prisma = getPrisma();

  return prisma.program.create({
    data: { universityId: input.universityId, name: input.name },
  });
}

/**
 * Retrieves a program by ID.
 *
 * @param id - Program ID
 * @returns Program if found, null otherwise
 */
export async function getProgram(id: string): Promise<Program | null> {
  const prisma = getPrisma();

  return prisma.program.findUnique({ where: { id } });
}

/**
 * Reports whether a program exists, without fetching its columns.
 *
 * @param id - Program ID
 * @returns True when the program exists
 */
export async function programExists(id: string): Promise<boolean> {
  const prisma = getPrisma();

  const found = await prisma.program.findUnique({
    where: { id },
    select: { id: true },
  });

  return found !== null;
}

/**
 * Updates a program, optionally moving it to another university.
 *
 * @param id - Program ID
 * @param input - Fields to update
 * @returns Updated program
 */
export async function updateProgram(
  id: string,
  input: UpdateProgramInput
): Promise<Program> {
  const prisma = getPrisma();

  return prisma.program.update({
    where: { id },
    data: {
      name: input.name,
      ...(input.universityId === undefined
        ? {}
        : { universityId: input.universityId }),
    },
  });
}

/**
 * Deletes a program and everything below it (cascading FKs).
 *
 * @param id - Program ID
 */
export async function deleteProgram(id: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.program.delete({ where: { id } });
}

/**
 * Counts everything a program delete would cascade to.
 * Call this BEFORE deleting.
 *
 * @param id - Program ID
 * @returns Descendant counts per level
 */
export async function countProgramDescendants(
  id: string
): Promise<ProgramDeletionImpact> {
  const prisma = getPrisma();

  const [streams, semesters, below] = await Promise.all([
    prisma.stream.count({ where: { programId: id } }),
    prisma.semester.count({ where: { stream: { programId: id } } }),
    countBelowSubjects(prisma, { semester: { stream: { programId: id } } }),
  ]);

  return { streams, semesters, ...below };
}

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

export interface CreateStreamInput {
  programId: string;
  name: string;
}

export interface UpdateStreamInput {
  name: string;
  /** Optional: moves the stream under a different program. */
  programId?: string;
}

/**
 * Lists streams for a single page, optionally scoped to one program.
 *
 * @param options - Pagination window and optional program filter
 * @returns Page of streams plus the total matching count
 */
export async function listStreamsPaginated(
  options: PaginationOptions & { programId?: string } = {}
): Promise<ListResult<Stream>> {
  const prisma = getPrisma();

  const where: Prisma.StreamWhereInput = options.programId
    ? { programId: options.programId }
    : {};

  const [items, total] = await Promise.all([
    prisma.stream.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.stream.count({ where }),
  ]);

  return { items, total };
}

/**
 * Creates a stream under a program.
 *
 * @param input - Stream data
 * @returns Created stream
 */
export async function createStream(input: CreateStreamInput): Promise<Stream> {
  const prisma = getPrisma();

  return prisma.stream.create({
    data: { programId: input.programId, name: input.name },
  });
}

/**
 * Retrieves a stream by ID.
 *
 * @param id - Stream ID
 * @returns Stream if found, null otherwise
 */
export async function getStream(id: string): Promise<Stream | null> {
  const prisma = getPrisma();

  return prisma.stream.findUnique({ where: { id } });
}

/**
 * Reports whether a stream exists, without fetching its columns.
 *
 * @param id - Stream ID
 * @returns True when the stream exists
 */
export async function streamExists(id: string): Promise<boolean> {
  const prisma = getPrisma();

  const found = await prisma.stream.findUnique({
    where: { id },
    select: { id: true },
  });

  return found !== null;
}

/**
 * Updates a stream, optionally moving it to another program.
 *
 * @param id - Stream ID
 * @param input - Fields to update
 * @returns Updated stream
 */
export async function updateStream(
  id: string,
  input: UpdateStreamInput
): Promise<Stream> {
  const prisma = getPrisma();

  return prisma.stream.update({
    where: { id },
    data: {
      name: input.name,
      ...(input.programId === undefined ? {} : { programId: input.programId }),
    },
  });
}

/**
 * Deletes a stream and everything below it (cascading FKs).
 *
 * @param id - Stream ID
 */
export async function deleteStream(id: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.stream.delete({ where: { id } });
}

/**
 * Counts everything a stream delete would cascade to.
 * Call this BEFORE deleting.
 *
 * @param id - Stream ID
 * @returns Descendant counts per level
 */
export async function countStreamDescendants(
  id: string
): Promise<StreamDeletionImpact> {
  const prisma = getPrisma();

  const [semesters, below] = await Promise.all([
    prisma.semester.count({ where: { streamId: id } }),
    countBelowSubjects(prisma, { semester: { streamId: id } }),
  ]);

  return { semesters, ...below };
}

// ---------------------------------------------------------------------------
// Semesters
// ---------------------------------------------------------------------------

export interface CreateSemesterInput {
  streamId: string;
  number: number;
  name?: string | null;
}

export interface UpdateSemesterInput {
  number: number;
  name?: string | null;
  /** Optional: moves the semester under a different stream. */
  streamId?: string;
}

/**
 * Lists semesters for a single page, optionally scoped to one stream, in
 * academic order.
 *
 * @param options - Pagination window and optional stream filter
 * @returns Page of semesters plus the total matching count
 */
export async function listSemestersPaginated(
  options: PaginationOptions & { streamId?: string } = {}
): Promise<ListResult<Semester>> {
  const prisma = getPrisma();

  const where: Prisma.SemesterWhereInput = options.streamId
    ? { streamId: options.streamId }
    : {};

  const [items, total] = await Promise.all([
    prisma.semester.findMany({
      where,
      orderBy: { number: 'asc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.semester.count({ where }),
  ]);

  return { items, total };
}

/**
 * Creates a semester under a stream.
 *
 * @param input - Semester data
 * @returns Created semester
 */
export async function createSemester(
  input: CreateSemesterInput
): Promise<Semester> {
  const prisma = getPrisma();

  return prisma.semester.create({
    data: {
      streamId: input.streamId,
      number: input.number,
      name: input.name ?? null,
    },
  });
}

/**
 * Retrieves a semester by ID.
 *
 * @param id - Semester ID
 * @returns Semester if found, null otherwise
 */
export async function getSemester(id: string): Promise<Semester | null> {
  const prisma = getPrisma();

  return prisma.semester.findUnique({ where: { id } });
}

/**
 * Reports whether a semester exists, without fetching its columns.
 *
 * @param id - Semester ID
 * @returns True when the semester exists
 */
export async function semesterExists(id: string): Promise<boolean> {
  const prisma = getPrisma();

  const found = await prisma.semester.findUnique({
    where: { id },
    select: { id: true },
  });

  return found !== null;
}

/**
 * Updates a semester, optionally moving it to another stream.
 *
 * @param id - Semester ID
 * @param input - Fields to update
 * @returns Updated semester
 */
export async function updateSemester(
  id: string,
  input: UpdateSemesterInput
): Promise<Semester> {
  const prisma = getPrisma();

  return prisma.semester.update({
    where: { id },
    data: {
      number: input.number,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.streamId === undefined ? {} : { streamId: input.streamId }),
    },
  });
}

/**
 * Deletes a semester and everything below it (cascading FKs).
 *
 * @param id - Semester ID
 */
export async function deleteSemester(id: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.semester.delete({ where: { id } });
}

/**
 * Counts everything a semester delete would cascade to.
 * Call this BEFORE deleting.
 *
 * @param id - Semester ID
 * @returns Descendant counts per level
 */
export async function countSemesterDescendants(
  id: string
): Promise<SemesterDeletionImpact> {
  const prisma = getPrisma();

  return countBelowSubjects(prisma, { semesterId: id });
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

export interface CreateChapterInput {
  subjectId: string;
  title: string;
  position?: number;
}

export interface UpdateChapterInput {
  title: string;
  position?: number;
  /** Optional: moves the chapter under a different subject. */
  subjectId?: string;
}

/**
 * Lists chapters for a single page, optionally scoped to one subject, in
 * display order.
 *
 * @param options - Pagination window and optional subject filter
 * @returns Page of chapters plus the total matching count
 */
export async function listChaptersPaginated(
  options: PaginationOptions & { subjectId?: string } = {}
): Promise<ListResult<Chapter>> {
  const prisma = getPrisma();

  const where: Prisma.ChapterWhereInput = options.subjectId
    ? { subjectId: options.subjectId }
    : {};

  const [items, total] = await Promise.all([
    prisma.chapter.findMany({
      where,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      skip: options.skip,
      take: options.take,
    }),
    prisma.chapter.count({ where }),
  ]);

  return { items, total };
}

/**
 * Creates a chapter under a subject.
 *
 * @param input - Chapter data
 * @returns Created chapter
 */
export async function createChapter(input: CreateChapterInput): Promise<Chapter> {
  const prisma = getPrisma();

  return prisma.chapter.create({
    data: {
      subjectId: input.subjectId,
      title: input.title,
      ...(input.position === undefined ? {} : { position: input.position }),
    },
  });
}

/**
 * Retrieves a chapter by ID.
 *
 * @param id - Chapter ID
 * @returns Chapter if found, null otherwise
 */
export async function getChapterById(id: string): Promise<Chapter | null> {
  const prisma = getPrisma();

  return prisma.chapter.findUnique({ where: { id } });
}

/**
 * Reports whether a subject exists, without fetching its columns.
 * Lives here because chapter creates need it.
 *
 * @param id - Subject ID
 * @returns True when the subject exists
 */
export async function subjectExists(id: string): Promise<boolean> {
  const prisma = getPrisma();

  const found = await prisma.subject.findUnique({
    where: { id },
    select: { id: true },
  });

  return found !== null;
}

/**
 * Updates a chapter, optionally moving it to another subject.
 *
 * @param id - Chapter ID
 * @param input - Fields to update
 * @returns Updated chapter
 */
export async function updateChapter(
  id: string,
  input: UpdateChapterInput
): Promise<Chapter> {
  const prisma = getPrisma();

  return prisma.chapter.update({
    where: { id },
    data: {
      title: input.title,
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
    },
  });
}

/**
 * Deletes a chapter. Its notes and resources go with it (cascading FKs).
 *
 * @param id - Chapter ID
 */
export async function deleteChapter(id: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.chapter.delete({ where: { id } });
}

/**
 * Counts everything a chapter delete would cascade to.
 * Call this BEFORE deleting.
 *
 * @param id - Chapter ID
 * @returns Note and resource counts
 */
export async function countChapterDescendants(
  id: string
): Promise<ChapterDeletionImpact> {
  const prisma = getPrisma();

  const [notes, resources] = await Promise.all([
    prisma.note.count({ where: { chapterId: id } }),
    prisma.resource.count({ where: { chapterId: id } }),
  ]);

  return { notes, resources };
}

export interface ReorderChaptersInput {
  subjectId: string;
  orderedIds: string[];
}

export interface ReorderChaptersResult {
  /**
   * Ids from the request that do not belong to the subject. When this is
   * non-empty nothing was written and `chapters` is empty.
   */
  invalidIds: string[];
  chapters: Chapter[];
}

/**
 * Rewrites chapter positions to match the given order, in one transaction.
 *
 * Ownership is checked inside the transaction and the whole batch is rejected
 * if any id belongs to a different subject, so a bad request can never leave
 * positions half-rewritten.
 *
 * @param input - Target subject and its chapter ids in the desired order
 * @returns The reordered chapters, or the offending ids when validation failed
 */
export async function reorderChapters(
  input: ReorderChaptersInput
): Promise<ReorderChaptersResult> {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const owned = await tx.chapter.findMany({
      where: { subjectId: input.subjectId },
      select: { id: true },
    });

    const ownedIds = new Set(owned.map((chapter) => chapter.id));
    const invalidIds = input.orderedIds.filter((id) => !ownedIds.has(id));

    if (invalidIds.length > 0) {
      return { invalidIds, chapters: [] };
    }

    // Sequential on purpose: positions are written in the order given
    for (let index = 0; index < input.orderedIds.length; index += 1) {
      await tx.chapter.update({
        where: { id: input.orderedIds[index] },
        data: { position: index },
      });
    }

    const chapters = await tx.chapter.findMany({
      where: { subjectId: input.subjectId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    return { invalidIds: [], chapters };
  });
}

// ---------------------------------------------------------------------------
// Full tree
// ---------------------------------------------------------------------------

export interface HierarchyTreeChapter {
  id: string;
  title: string;
  position: number;
}

export interface HierarchyTreeSubject {
  id: string;
  name: string;
  code: string | null;
  position: number;
  chapters: HierarchyTreeChapter[];
}

export interface HierarchyTreeSemester {
  id: string;
  number: number;
  name: string | null;
  subjects: HierarchyTreeSubject[];
}

export interface HierarchyTreeStream {
  id: string;
  name: string;
  semesters: HierarchyTreeSemester[];
}

export interface HierarchyTreeProgram {
  id: string;
  name: string;
  streams: HierarchyTreeStream[];
}

export interface HierarchyTree {
  id: string;
  name: string;
  programs: HierarchyTreeProgram[];
}

/**
 * Loads one university's entire hierarchy for admin navigation.
 *
 * A single query with nested includes - never a query per level - so the tree
 * costs one round trip regardless of how many branches it has. Only the columns
 * the navigation tree renders are selected; note bodies and resources are not
 * part of it.
 *
 * @param universityId - University at the root of the tree
 * @returns The nested tree, or null when the university does not exist
 */
export async function getHierarchyTree(
  universityId: string
): Promise<HierarchyTree | null> {
  const prisma = getPrisma();

  return prisma.university.findUnique({
    where: { id: universityId },
    select: {
      id: true,
      name: true,
      programs: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          streams: {
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              semesters: {
                orderBy: { number: 'asc' },
                select: {
                  id: true,
                  number: true,
                  name: true,
                  subjects: {
                    orderBy: [{ position: 'asc' }, { name: 'asc' }],
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      position: true,
                      chapters: {
                        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
                        select: {
                          id: true,
                          title: true,
                          position: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
