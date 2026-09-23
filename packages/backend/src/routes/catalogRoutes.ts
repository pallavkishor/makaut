import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticateStudent } from '../middleware/auth';
import { requireActiveSession } from '../middleware/sessionValidation';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { getDatabaseClient } from '../config/database';
import {
  asyncHandler,
  getStudentId,
  handleValidation,
  requireActiveSubscription,
} from './helpers';

/**
 * Student-facing catalogue, mounted at /api/catalog.
 *
 * Powers the browse flow
 *   University > Program > Stream > Semester > Subject > Chapter > Note
 * and the cross-catalogue search.
 *
 * GET /api/catalog/universities                 - browsable without a subscription
 * GET /api/catalog/programs?universityId=       - browsable without a subscription
 * GET /api/catalog/streams?programId=           - browsable without a subscription
 * GET /api/catalog/semesters?streamId=          - browsable without a subscription
 * GET /api/catalog/semesters/:id/subjects       - subject names in a semester
 * GET /api/catalog/subjects/:id/chapters        - chapters with published note counts
 * GET /api/catalog/chapters/:id/notes           - note titles, ACTIVE SUBSCRIPTION
 * GET /api/catalog/search?q=                    - note search, ACTIVE SUBSCRIPTION
 * GET /api/catalog/me/selection                 - the student's current selection
 * PUT /api/catalog/me/selection                 - persist the selection
 *
 * Where the paywall sits: everything down to chapter level is a shop window, so
 * a prospective student can see what is on offer before paying. Note titles and
 * search are behind an active subscription, because that is where the content
 * starts. Two rules apply to every response on this router:
 *
 *  - unpublished notes are invisible to students, always, including in the
 *    published note counts on the chapter listing and in search; and
 *  - subscription checks run before anything is read, so a 403 never doubles as
 *    confirmation that some id exists.
 *
 * Requirements: 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.7, 4.8
 */
const router = Router();

// Every route in this router requires a valid student session
router.use(authenticateStudent, requireActiveSession);

// ---------------------------------------------------------------------------
// Prisma access
// ---------------------------------------------------------------------------

/**
 * Catalogue reads go straight to Prisma: they are plain hierarchy lookups with
 * no domain rules beyond the published/subscription filters enforced here.
 *
 * The override is the same test seam the services expose, so these routes can
 * be exercised without reaching for the real database.
 */
let prismaClientOverride: PrismaClient | null = null;

export function setCatalogPrismaClient(client: PrismaClient): void {
  prismaClientOverride = client;
}

export function resetCatalogPrismaClient(): void {
  prismaClientOverride = null;
}

function getPrisma(): PrismaClient {
  return prismaClientOverride || getDatabaseClient();
}

// ---------------------------------------------------------------------------
// Pagination (search only)
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const paginationValidators = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be an integer of 1 or greater')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: MAX_PAGE_SIZE })
    .withMessage(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`)
    .toInt(),
];

/** Reads the pagination window off the request, clamped to safe bounds. */
function parsePagination(req: Request): Pagination {
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);

  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function paginationMeta(
  pagination: Pagination,
  total: number
): { page: number; pageSize: number; total: number; totalPages: number } {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: pagination.pageSize > 0 ? Math.ceil(total / pagination.pageSize) : 0,
  };
}

// ---------------------------------------------------------------------------
// Hierarchy browsing
// ---------------------------------------------------------------------------

/**
 * Confirms an optional parent filter points at something real, so a typo comes
 * back as a 404 instead of a silently empty list.
 */
async function assertParentExists(
  level: 'university' | 'program' | 'stream',
  id: string
): Promise<void> {
  const prisma = getPrisma();

  const found =
    level === 'university'
      ? await prisma.university.findUnique({ where: { id }, select: { id: true } })
      : level === 'program'
        ? await prisma.program.findUnique({ where: { id }, select: { id: true } })
        : await prisma.stream.findUnique({ where: { id }, select: { id: true } });

  if (!found) {
    throw new AppError(
      ErrorCode.NOT_FOUND,
      `${level.charAt(0).toUpperCase()}${level.slice(1)} not found`,
      404
    );
  }
}

/**
 * GET /api/catalog/universities
 * No subscription required - this is the entry point to the browse flow.
 */
router.get(
  '/universities',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();

    const universities = await prisma.university.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ universities });
  })
);

/**
 * GET /api/catalog/programs?universityId=
 * No subscription required.
 */
router.get(
  '/programs',
  [
    query('universityId')
      .optional()
      .isUUID()
      .withMessage('universityId must be a valid UUID'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const universityId = req.query.universityId
      ? String(req.query.universityId)
      : undefined;

    if (universityId) {
      await assertParentExists('university', universityId);
    }

    const programs = await prisma.program.findMany({
      where: universityId ? { universityId } : {},
      select: { id: true, name: true, universityId: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ programs });
  })
);

/**
 * GET /api/catalog/streams?programId=
 * No subscription required.
 */
router.get(
  '/streams',
  [query('programId').optional().isUUID().withMessage('programId must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const programId = req.query.programId ? String(req.query.programId) : undefined;

    if (programId) {
      await assertParentExists('program', programId);
    }

    const streams = await prisma.stream.findMany({
      where: programId ? { programId } : {},
      select: { id: true, name: true, programId: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ streams });
  })
);

/**
 * GET /api/catalog/semesters?streamId=
 * No subscription required.
 */
router.get(
  '/semesters',
  [query('streamId').optional().isUUID().withMessage('streamId must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const streamId = req.query.streamId ? String(req.query.streamId) : undefined;

    if (streamId) {
      await assertParentExists('stream', streamId);
    }

    const semesters = await prisma.semester.findMany({
      where: streamId ? { streamId } : {},
      select: { id: true, number: true, name: true, streamId: true },
      orderBy: { number: 'asc' },
    });

    res.status(200).json({
      semesters: semesters.map((semester) => ({
        ...semester,
        label: semester.name ?? `Semester ${semester.number}`,
      })),
    });
  })
);

/**
 * GET /api/catalog/semesters/:id/subjects
 */
router.get(
  '/semesters/:id/subjects',
  [param('id').isUUID().withMessage('Semester ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const semesterId = req.params.id;

    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
      select: { id: true },
    });

    if (!semester) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Semester not found', 404);
    }

    const subjects = await prisma.subject.findMany({
      where: { semesterId },
      select: { id: true, name: true, code: true, position: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    res.status(200).json({ semesterId, subjects });
  })
);

/**
 * GET /api/catalog/subjects/:id/chapters
 *
 * `noteCount` counts published notes only: an unpublished draft must not even
 * register as a number a student can see.
 */
router.get(
  '/subjects/:id/chapters',
  [param('id').isUUID().withMessage('Subject ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const subjectId = req.params.id;

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true },
    });

    if (!subject) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subject not found', 404);
    }

    const chapters = await prisma.chapter.findMany({
      where: { subjectId },
      select: { id: true, title: true, position: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const counts = chapters.length
      ? await prisma.note.groupBy({
          by: ['chapterId'],
          where: {
            chapterId: { in: chapters.map((chapter) => chapter.id) },
            isPublished: true,
          },
          _count: { _all: true },
        })
      : [];

    const countByChapter = new Map(
      counts.map((row) => [row.chapterId, row._count._all])
    );

    res.status(200).json({
      subjectId,
      subjectName: subject.name,
      chapters: chapters.map((chapter) => ({
        ...chapter,
        noteCount: countByChapter.get(chapter.id) ?? 0,
      })),
    });
  })
);

/**
 * GET /api/catalog/chapters/:id/notes
 *
 * Note titles only - bodies are served by /api/notes/:id. Requires an active
 * subscription, and returns published notes exclusively.
 *
 * Requirements: 3.5, 3.6, 4.2
 */
router.get(
  '/chapters/:id/notes',
  [param('id').isUUID().withMessage('Chapter ID must be a valid UUID')],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const studentId = getStudentId(req);
    const chapterId = req.params.id;

    // Fail closed: authorize before revealing anything about the chapter
    await requireActiveSubscription(studentId);

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, title: true, subjectId: true },
    });

    if (!chapter) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Chapter not found', 404);
    }

    const notes = await prisma.note.findMany({
      // Unpublished notes are not part of the student's catalogue
      where: { chapterId, isPublished: true },
      select: {
        id: true,
        title: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    res.status(200).json({
      chapterId,
      chapterTitle: chapter.title,
      subjectId: chapter.subjectId,
      notes,
    });
  })
);

// ---------------------------------------------------------------------------
// Dashboard selection
// ---------------------------------------------------------------------------

export type HierarchyLevel = 'university' | 'program' | 'stream' | 'semester';

/** Shallowest to deepest. The order the consistency check walks. */
const LEVELS: readonly HierarchyLevel[] = [
  'university',
  'program',
  'stream',
  'semester',
] as const;

const SELECTION_FIELD: Record<HierarchyLevel, keyof SelectionChain> = {
  university: 'universityId',
  program: 'programId',
  stream: 'streamId',
  semester: 'semesterId',
};

export interface SelectionInput {
  universityId?: string | null;
  programId?: string | null;
  streamId?: string | null;
  semesterId?: string | null;
}

/** A fully resolved selection. Every level is either set or explicitly null. */
export interface SelectionChain {
  universityId: string | null;
  programId: string | null;
  streamId: string | null;
  semesterId: string | null;
}

export interface SelectionIssue {
  field: string;
  message: string;
}

const EMPTY_CHAIN: SelectionChain = {
  universityId: null,
  programId: null,
  streamId: null,
  semesterId: null,
};

/**
 * Returns the deepest level the input actually supplies an id for.
 *
 * The deepest node determines the whole chain: its ancestry is authoritative,
 * and any shallower id the caller also sent has to agree with it.
 *
 * @param input - Raw selection body
 * @returns The deepest supplied level, or null when nothing was supplied
 */
export function deepestSuppliedLevel(input: SelectionInput): HierarchyLevel | null {
  let deepest: HierarchyLevel | null = null;

  for (const level of LEVELS) {
    if (input[SELECTION_FIELD[level]]) {
      deepest = level;
    }
  }

  return deepest;
}

/**
 * Checks a selection body against the chain derived from its deepest node.
 *
 * Pure, so the consistency rule is testable on its own: the caller resolves the
 * deepest supplied node's ancestry from the database, and this decides whether
 * every shallower id the caller also sent belongs to that ancestry. A program
 * from another university, a stream from another program or a semester from
 * another stream is rejected here.
 *
 * @param input - Raw selection body
 * @param derived - Chain derived from the deepest supplied node's ancestry
 * @returns The first inconsistency found, or null when the combination is coherent
 */
export function reconcileSelection(
  input: SelectionInput,
  derived: SelectionChain
): SelectionIssue | null {
  const deepest = deepestSuppliedLevel(input);

  if (!deepest) {
    return null;
  }

  for (const level of LEVELS) {
    const field = SELECTION_FIELD[level];
    const supplied = input[field];

    if (!supplied) {
      continue;
    }

    if (derived[field] !== supplied) {
      return {
        field,
        message: `The selected ${level} does not match the selected ${deepest}: that ${deepest} belongs to a different ${level}.`,
      };
    }
  }

  return null;
}

/**
 * Loads the deepest supplied node with its ancestry and flattens it into a
 * chain. Returns null when the node does not exist.
 */
async function deriveChain(
  level: HierarchyLevel,
  id: string
): Promise<SelectionChain | null> {
  const prisma = getPrisma();

  if (level === 'semester') {
    const semester = await prisma.semester.findUnique({
      where: { id },
      select: {
        id: true,
        streamId: true,
        stream: {
          select: {
            id: true,
            programId: true,
            program: { select: { id: true, universityId: true } },
          },
        },
      },
    });

    return semester
      ? {
          universityId: semester.stream.program.universityId,
          programId: semester.stream.programId,
          streamId: semester.streamId,
          semesterId: semester.id,
        }
      : null;
  }

  if (level === 'stream') {
    const stream = await prisma.stream.findUnique({
      where: { id },
      select: {
        id: true,
        programId: true,
        program: { select: { id: true, universityId: true } },
      },
    });

    return stream
      ? {
          universityId: stream.program.universityId,
          programId: stream.programId,
          streamId: stream.id,
          semesterId: null,
        }
      : null;
  }

  if (level === 'program') {
    const program = await prisma.program.findUnique({
      where: { id },
      select: { id: true, universityId: true },
    });

    return program
      ? {
          universityId: program.universityId,
          programId: program.id,
          streamId: null,
          semesterId: null,
        }
      : null;
  }

  const university = await prisma.university.findUnique({
    where: { id },
    select: { id: true },
  });

  return university ? { ...EMPTY_CHAIN, universityId: university.id } : null;
}

/**
 * GET /api/catalog/me/selection
 * The student's current dashboard selection, with names resolved.
 */
router.get(
  '/me/selection',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const studentId = getStudentId(req);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        selectedUniversity: { select: { id: true, name: true } },
        selectedProgram: { select: { id: true, name: true } },
        selectedStream: { select: { id: true, name: true } },
        selectedSemester: { select: { id: true, number: true, name: true } },
      },
    });

    if (!student) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Student account not found', 404);
    }

    const semester = student.selectedSemester;

    res.status(200).json({
      selection: {
        university: student.selectedUniversity,
        program: student.selectedProgram,
        stream: student.selectedStream,
        semester: semester
          ? {
              id: semester.id,
              number: semester.number,
              name: semester.name,
              label: semester.name ?? `Semester ${semester.number}`,
            }
          : null,
      },
    });
  })
);

/**
 * PUT /api/catalog/me/selection
 *
 * The deepest supplied id defines the selection: its ancestry is filled in
 * automatically, and levels below it are cleared. Any shallower id the caller
 * also sends must agree with that ancestry - a program from another university,
 * a stream from another program or a semester from another stream is a 400, so
 * an incoherent chain can never reach the students table. An empty body clears
 * the selection.
 */
router.put(
  '/me/selection',
  [
    body('universityId')
      .optional({ nullable: true })
      .isUUID()
      .withMessage('universityId must be a valid UUID or null'),
    body('programId')
      .optional({ nullable: true })
      .isUUID()
      .withMessage('programId must be a valid UUID or null'),
    body('streamId')
      .optional({ nullable: true })
      .isUUID()
      .withMessage('streamId must be a valid UUID or null'),
    body('semesterId')
      .optional({ nullable: true })
      .isUUID()
      .withMessage('semesterId must be a valid UUID or null'),
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const studentId = getStudentId(req);

    const input: SelectionInput = {
      universityId: req.body?.universityId ?? null,
      programId: req.body?.programId ?? null,
      streamId: req.body?.streamId ?? null,
      semesterId: req.body?.semesterId ?? null,
    };

    const deepest = deepestSuppliedLevel(input);

    let chain: SelectionChain = EMPTY_CHAIN;

    if (deepest) {
      const derived = await deriveChain(
        deepest,
        input[SELECTION_FIELD[deepest]] as string
      );

      // Requirement: every supplied id must exist
      if (!derived) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          `${deepest.charAt(0).toUpperCase()}${deepest.slice(1)} not found`,
          400,
          { field: SELECTION_FIELD[deepest] }
        );
      }

      // Requirement: the chain must be internally consistent
      const issue = reconcileSelection(input, derived);

      if (issue) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, issue.message, 400, {
          field: issue.field,
        });
      }

      chain = derived;
    }

    let updated;
    try {
      updated = await prisma.student.update({
        where: { id: studentId },
        data: {
          selectedUniversityId: chain.universityId,
          selectedProgramId: chain.programId,
          selectedStreamId: chain.streamId,
          selectedSemesterId: chain.semesterId,
        },
        select: {
          selectedUniversity: { select: { id: true, name: true } },
          selectedProgram: { select: { id: true, name: true } },
          selectedStream: { select: { id: true, name: true } },
          selectedSemester: { select: { id: true, number: true, name: true } },
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2025'
      ) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Student account not found', 404);
      }

      throw error;
    }

    const semester = updated.selectedSemester;

    res.status(200).json({
      message: 'Selection saved',
      selection: {
        university: updated.selectedUniversity,
        program: updated.selectedProgram,
        stream: updated.selectedStream,
        semester: semester
          ? {
              id: semester.id,
              number: semester.number,
              name: semester.name,
              label: semester.name ?? `Semester ${semester.number}`,
            }
          : null,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchFilters {
  universityId?: string;
  programId?: string;
  streamId?: string;
  semesterId?: string;
  subjectId?: string;
}

/**
 * ts_headline and ts_rank tuning. Both are fixed literals written straight into
 * the statement - they are not caller input, and inlining them keeps every bound
 * parameter in this file a value rather than a knob.
 *
 * The highlight delimiters produce a snippet derived from Markdown note content,
 * so it carries the same rule as a note body: render it as text or sanitize it,
 * never inject it raw as HTML.
 */
const HEADLINE_OPTIONS = Prisma.raw(
  `'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=24, MinWords=8'`
);

/** Default tsvector weights, D..A. The column weights title A and body B. */
const RANK_WEIGHTS = Prisma.raw(`'{0.1, 0.2, 0.4, 1.0}'::float4[]`);

/**
 * Builds the WHERE clause shared by the search result and count queries.
 *
 * Every value is a bound parameter - the returned fragment interpolates no
 * caller input into SQL text. Two conditions are not optional:
 * `is_published = true`, and a match against the generated `search_vector`
 * column (title weighted above body) or a subject / chapter name.
 *
 * @param tsQuery - Fragment producing the tsquery, already parameterised
 * @param filters - Optional hierarchy filters
 * @returns The WHERE clause, without the `WHERE` keyword
 */
export function buildSearchWhere(
  tsQuery: Prisma.Sql,
  filters: SearchFilters
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    // Unpublished notes never reach a student, in search or anywhere else
    Prisma.sql`n."is_published" = true`,
    Prisma.sql`(
      n."search_vector" @@ ${tsQuery}
      OR to_tsvector('english', s."name") @@ ${tsQuery}
      OR to_tsvector('english', ch."title") @@ ${tsQuery}
    )`,
  ];

  if (filters.subjectId) {
    conditions.push(Prisma.sql`s."id" = ${filters.subjectId}::uuid`);
  }

  if (filters.semesterId) {
    conditions.push(Prisma.sql`sem."id" = ${filters.semesterId}::uuid`);
  }

  if (filters.streamId) {
    conditions.push(Prisma.sql`st."id" = ${filters.streamId}::uuid`);
  }

  if (filters.programId) {
    conditions.push(Prisma.sql`p."id" = ${filters.programId}::uuid`);
  }

  if (filters.universityId) {
    conditions.push(Prisma.sql`u."id" = ${filters.universityId}::uuid`);
  }

  return Prisma.join(conditions, ' AND ');
}

/** The join chain from a note up to its university. */
const SEARCH_FROM = Prisma.sql`
  FROM "notes" n
  JOIN "chapters" ch    ON ch."id"  = n."chapter_id"
  JOIN "subjects" s     ON s."id"   = ch."subject_id"
  JOIN "semesters" sem  ON sem."id" = s."semester_id"
  JOIN "streams" st     ON st."id"  = sem."stream_id"
  JOIN "programs" p     ON p."id"   = st."program_id"
  JOIN "universities" u ON u."id"   = p."university_id"
`;

export interface SearchQueryOptions {
  /** Raw search terms as typed by the student. */
  query: string;
  filters: SearchFilters;
  skip: number;
  take: number;
}

/**
 * Builds the two statements a search needs: the page of hits, and the total.
 *
 * Both share one WHERE clause, so the count can never disagree with the rows.
 * Every value - the search terms, the filters, the window - is a bound
 * parameter.
 *
 * The tsquery is spelled out at each site it is needed rather than factored into
 * a CTE. `websearch_to_tsquery` is stable, so Postgres evaluates it once per
 * occurrence, and keeping it inline next to `search_vector @@` is what lets the
 * planner use the GIN index - a CTE would hide the value behind a scan.
 *
 * @param options - Search terms, filters and pagination window
 * @returns The row query and the matching count query
 */
export function buildSearchQueries(
  options: SearchQueryOptions
): { rows: Prisma.Sql; count: Prisma.Sql } {
  const tsQuery = Prisma.sql`websearch_to_tsquery('english', ${options.query})`;
  const where = buildSearchWhere(tsQuery, options.filters);

  return {
    rows: Prisma.sql`
      SELECT n."id"           AS "noteId",
             n."title"        AS "title",
             n."position"     AS "position",
             n."created_at"   AS "createdAt",
             n."updated_at"   AS "updatedAt",
             ts_headline('english', n."content", ${tsQuery}, ${HEADLINE_OPTIONS}) AS "headline",
             (to_tsvector('english', n."title") @@ ${tsQuery})  AS "titleMatch",
             (n."search_vector" @@ ${tsQuery})                  AS "bodyMatch",
             (to_tsvector('english', s."name") @@ ${tsQuery})    AS "subjectMatch",
             (to_tsvector('english', ch."title") @@ ${tsQuery})  AS "chapterMatch",
             ch."id"          AS "chapterId",
             ch."title"       AS "chapterTitle",
             s."id"           AS "subjectId",
             s."name"         AS "subjectName",
             sem."id"         AS "semesterId",
             sem."number"     AS "semesterNumber",
             sem."name"       AS "semesterName",
             st."id"          AS "streamId",
             st."name"        AS "streamName",
             p."id"           AS "programId",
             p."name"         AS "programName",
             u."id"           AS "universityId",
             u."name"         AS "universityName"
      ${SEARCH_FROM}
      WHERE ${where}
      ORDER BY (to_tsvector('english', n."title") @@ ${tsQuery}) DESC,
               ts_rank(${RANK_WEIGHTS}, n."search_vector", ${tsQuery}) DESC,
               n."created_at" DESC
      LIMIT ${options.take} OFFSET ${options.skip}
    `,
    count: Prisma.sql`
      SELECT COUNT(*)::int AS "total"
      ${SEARCH_FROM}
      WHERE ${where}
    `,
  };
}

interface SearchRow {
  noteId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  headline: string;
  titleMatch: boolean;
  bodyMatch: boolean;
  subjectMatch: boolean;
  chapterMatch: boolean;
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectName: string;
  semesterId: string;
  semesterNumber: number;
  semesterName: string | null;
  streamId: string;
  streamName: string;
  programId: string;
  programName: string;
  universityId: string;
  universityName: string;
}

/** Where the query matched, most specific first. */
function matchedIn(row: SearchRow): string[] {
  const matches: string[] = [];

  if (row.titleMatch) {
    matches.push('title');
  }

  // The generated vector covers title and body, so a vector hit that is not a
  // title hit is a body hit
  if (row.bodyMatch && !row.titleMatch) {
    matches.push('body');
  }

  if (row.subjectMatch) {
    matches.push('subject');
  }

  if (row.chapterMatch) {
    matches.push('chapter');
  }

  return matches;
}

/**
 * GET /api/catalog/search?q=
 *
 * Full-text search over published notes, using the generated
 * `notes.search_vector` column and its GIN index. Subject and chapter names are
 * matched too, so searching for a subject surfaces its notes.
 *
 * Title matches rank above body matches: the vector already weights the title
 * A and the body B, and an explicit title-match flag is the primary sort key on
 * top of that.
 *
 * Requires an active subscription. Every hit carries its full breadcrumb so the
 * result is navigable.
 *
 * Requirements: 3.5, 3.6, 4.7, 4.8
 */
router.get(
  '/search',
  [
    query('q')
      .exists({ checkFalsy: true })
      .withMessage('Search query is required')
      .bail()
      .isString()
      .withMessage('Search query is required')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('Search query is required')
      .bail()
      .isLength({ max: 200 })
      .withMessage('Search query must be at most 200 characters'),
    query('universityId')
      .optional()
      .isUUID()
      .withMessage('universityId must be a valid UUID'),
    query('programId').optional().isUUID().withMessage('programId must be a valid UUID'),
    query('streamId').optional().isUUID().withMessage('streamId must be a valid UUID'),
    query('semesterId')
      .optional()
      .isUUID()
      .withMessage('semesterId must be a valid UUID'),
    query('subjectId').optional().isUUID().withMessage('subjectId must be a valid UUID'),
    ...paginationValidators,
  ],
  handleValidation,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const prisma = getPrisma();
    const studentId = getStudentId(req);
    const searchQuery = String(req.query.q).trim();

    // Fail closed: search reads note bodies, so authorize first
    await requireActiveSubscription(studentId);

    const pagination = parsePagination(req);

    const filters: SearchFilters = {
      ...(req.query.universityId
        ? { universityId: String(req.query.universityId) }
        : {}),
      ...(req.query.programId ? { programId: String(req.query.programId) } : {}),
      ...(req.query.streamId ? { streamId: String(req.query.streamId) } : {}),
      ...(req.query.semesterId ? { semesterId: String(req.query.semesterId) } : {}),
      ...(req.query.subjectId ? { subjectId: String(req.query.subjectId) } : {}),
    };

    const queries = buildSearchQueries({
      query: searchQuery,
      filters,
      skip: pagination.skip,
      take: pagination.take,
    });

    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<SearchRow[]>(queries.rows),
      prisma.$queryRaw<Array<{ total: number }>>(queries.count),
    ]);

    const total = totals[0]?.total ?? 0;

    res.status(200).json({
      query: searchQuery,
      filters,
      pagination: paginationMeta(pagination, total),
      results: rows.map((row) => ({
        noteId: row.noteId,
        title: row.title,
        position: row.position,
        headline: row.headline,
        matchedIn: matchedIn(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        breadcrumb: {
          university: { id: row.universityId, name: row.universityName },
          program: { id: row.programId, name: row.programName },
          stream: { id: row.streamId, name: row.streamName },
          semester: {
            id: row.semesterId,
            number: row.semesterNumber,
            name: row.semesterName,
            label: row.semesterName ?? `Semester ${row.semesterNumber}`,
          },
          subject: { id: row.subjectId, name: row.subjectName },
          chapter: { id: row.chapterId, title: row.chapterTitle },
        },
      })),
    });
  })
);

export default router;
