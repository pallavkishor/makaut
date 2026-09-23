import request from 'supertest';
import express, { Express } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { errorHandler } from '../middleware/errorHandler';
import { generateAdminToken, generateStudentToken } from '../utils/jwt';
import catalogRoutes, {
  buildSearchWhere,
  deepestSuppliedLevel,
  reconcileSelection,
  setCatalogPrismaClient,
  resetCatalogPrismaClient,
} from './catalogRoutes';

/**
 * Student catalogue route tests.
 *
 * Two rules carry the weight here and both are asserted end to end:
 *
 *  - unpublished notes are invisible to students, in the chapter listing, in the
 *    published note counts and in search; and
 *  - a selection chain that is not internally consistent (a program from another
 *    university, a stream from another program, a semester from another stream)
 *    is rejected with a 400 and never written to the students table.
 *
 * The catalogue rows come from a small in-memory stand-in for the database that
 * honours the `chapterId` / `isPublished` predicates it is handed, so dropping
 * the published filter from a route would fail these tests rather than pass
 * them. Search is SQL against a generated tsvector column, so the query itself
 * is the assertion target: published-only, parameterised, title before body.
 *
 * Requirements: 3.5, 3.6, 4.1, 4.2, 4.7, 4.8
 */

jest.mock('../services/session');
jest.mock('../services/subscription');

import * as sessionService from '../services/session';
import * as subscriptionService from '../services/subscription';

const sessions = sessionService as jest.Mocked<typeof sessionService>;
const subscriptions = subscriptionService as jest.Mocked<typeof subscriptionService>;

// ---------------------------------------------------------------------------
// Fixture hierarchy: two parallel universities, so cross-branch combinations
// can be built deliberately.
//
//   MAKAUT   > B.Tech  > CSE    > Semester 3 > Data Structures > Arrays
//   Other Uni> MBA     > Finance> Semester 1
// ---------------------------------------------------------------------------

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const UNIVERSITY_A = '22222222-2222-4222-8222-222222222222';
const UNIVERSITY_B = '33333333-3333-4333-8333-333333333333';
const PROGRAM_A = '44444444-4444-4444-8444-444444444444';
const PROGRAM_B = '55555555-5555-4555-8555-555555555555';
const STREAM_A = '66666666-6666-4666-8666-666666666666';
const STREAM_B = '77777777-7777-4777-8777-777777777777';
const SEMESTER_A = '88888888-8888-4888-8888-888888888888';
const SEMESTER_B = '99999999-9999-4999-8999-999999999999';
const SUBJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAPTER_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PUBLISHED_NOTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DRAFT_NOTE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNKNOWN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const UNIVERSITIES = [
  { id: UNIVERSITY_A, name: 'MAKAUT' },
  { id: UNIVERSITY_B, name: 'Other University' },
];

const PROGRAMS = [
  { id: PROGRAM_A, name: 'B.Tech', universityId: UNIVERSITY_A },
  { id: PROGRAM_B, name: 'MBA', universityId: UNIVERSITY_B },
];

const STREAMS = [
  { id: STREAM_A, name: 'CSE', programId: PROGRAM_A },
  { id: STREAM_B, name: 'Finance', programId: PROGRAM_B },
];

const SEMESTERS = [
  { id: SEMESTER_A, number: 3, name: null as string | null, streamId: STREAM_A },
  { id: SEMESTER_B, number: 1, name: 'First', streamId: STREAM_B },
];

const SUBJECTS = [
  {
    id: SUBJECT_A,
    name: 'Data Structures',
    code: 'CS301',
    position: 0,
    semesterId: SEMESTER_A,
  },
];

const CHAPTERS = [
  { id: CHAPTER_A, title: 'Arrays', position: 0, subjectId: SUBJECT_A },
];

const timestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
};

const NOTES = [
  {
    id: PUBLISHED_NOTE,
    chapterId: CHAPTER_A,
    title: 'Array traversal',
    position: 0,
    isPublished: true,
    ...timestamps,
  },
  {
    id: DRAFT_NOTE,
    chapterId: CHAPTER_A,
    title: 'Unfinished draft - internal only',
    position: 1,
    isPublished: false,
    ...timestamps,
  },
];

interface NoteWhere {
  chapterId?: string | { in: string[] };
  isPublished?: boolean;
}

/** Applies the predicates the routes actually use, so the filter is real. */
function selectNotes(where: NoteWhere = {}): typeof NOTES {
  return NOTES.filter((note) => {
    if (typeof where.chapterId === 'string' && note.chapterId !== where.chapterId) {
      return false;
    }

    if (
      where.chapterId &&
      typeof where.chapterId === 'object' &&
      !where.chapterId.in.includes(note.chapterId)
    ) {
      return false;
    }

    if (where.isPublished !== undefined && note.isPublished !== where.isPublished) {
      return false;
    }

    return true;
  });
}

const SEARCH_ROW = {
  noteId: PUBLISHED_NOTE,
  title: 'Array traversal',
  position: 0,
  ...timestamps,
  headline: 'traversing an <mark>array</mark> in linear time',
  titleMatch: true,
  bodyMatch: true,
  subjectMatch: false,
  chapterMatch: false,
  chapterId: CHAPTER_A,
  chapterTitle: 'Arrays',
  subjectId: SUBJECT_A,
  subjectName: 'Data Structures',
  semesterId: SEMESTER_A,
  semesterNumber: 3,
  semesterName: null,
  streamId: STREAM_A,
  streamName: 'CSE',
  programId: PROGRAM_A,
  programName: 'B.Tech',
  universityId: UNIVERSITY_A,
  universityName: 'MAKAUT',
};

interface Stub {
  client: PrismaClient;
  noteFindMany: jest.Mock;
  noteGroupBy: jest.Mock;
  studentUpdate: jest.Mock;
  studentFindUnique: jest.Mock;
  queryRaw: jest.Mock;
  searchRows: typeof SEARCH_ROW[];
  searchTotal: number;
}

/** Resolves a student row shaped the way the selection endpoints select it. */
function selectionRow(chain: {
  universityId: string | null;
  programId: string | null;
  streamId: string | null;
  semesterId: string | null;
}) {
  const university = UNIVERSITIES.find((row) => row.id === chain.universityId);
  const program = PROGRAMS.find((row) => row.id === chain.programId);
  const stream = STREAMS.find((row) => row.id === chain.streamId);
  const semester = SEMESTERS.find((row) => row.id === chain.semesterId);

  return {
    selectedUniversity: university
      ? { id: university.id, name: university.name }
      : null,
    selectedProgram: program ? { id: program.id, name: program.name } : null,
    selectedStream: stream ? { id: stream.id, name: stream.name } : null,
    selectedSemester: semester
      ? { id: semester.id, number: semester.number, name: semester.name }
      : null,
  };
}

function stubClient(): Stub {
  const stub = {
    searchRows: [SEARCH_ROW],
    searchTotal: 1,
  } as Stub;

  stub.noteFindMany = jest
    .fn()
    .mockImplementation(async ({ where }) => selectNotes(where));

  stub.noteGroupBy = jest.fn().mockImplementation(async ({ where }) => {
    const grouped = new Map<string, number>();

    for (const note of selectNotes(where)) {
      grouped.set(note.chapterId, (grouped.get(note.chapterId) ?? 0) + 1);
    }

    return [...grouped.entries()].map(([chapterId, count]) => ({
      chapterId,
      _count: { _all: count },
    }));
  });

  stub.studentFindUnique = jest.fn().mockResolvedValue(
    selectionRow({
      universityId: UNIVERSITY_A,
      programId: PROGRAM_A,
      streamId: STREAM_A,
      semesterId: SEMESTER_A,
    })
  );

  stub.studentUpdate = jest
    .fn()
    .mockImplementation(async ({ data }) =>
      selectionRow({
        universityId: data.selectedUniversityId,
        programId: data.selectedProgramId,
        streamId: data.selectedStreamId,
        semesterId: data.selectedSemesterId,
      })
    );

  stub.queryRaw = jest.fn().mockImplementation(async (sql: Prisma.Sql) =>
    sql.text.includes('COUNT(*)')
      ? [{ total: stub.searchTotal }]
      : stub.searchRows
  );

  stub.client = {
    university: {
      findMany: jest.fn().mockResolvedValue(UNIVERSITIES),
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          UNIVERSITIES.find((row) => row.id === where.id) ?? null
        ),
    },
    program: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          PROGRAMS.filter(
            (row) => !where?.universityId || row.universityId === where.universityId
          )
        ),
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          PROGRAMS.find((row) => row.id === where.id) ?? null
        ),
    },
    stream: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          STREAMS.filter((row) => !where?.programId || row.programId === where.programId)
        ),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const stream = STREAMS.find((row) => row.id === where.id);

        if (!stream) {
          return null;
        }

        const program = PROGRAMS.find((row) => row.id === stream.programId);

        return {
          ...stream,
          program: { id: program?.id, universityId: program?.universityId },
        };
      }),
    },
    semester: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          SEMESTERS.filter((row) => !where?.streamId || row.streamId === where.streamId)
        ),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const semester = SEMESTERS.find((row) => row.id === where.id);

        if (!semester) {
          return null;
        }

        const stream = STREAMS.find((row) => row.id === semester.streamId);
        const program = PROGRAMS.find((row) => row.id === stream?.programId);

        return {
          ...semester,
          stream: {
            id: stream?.id,
            programId: stream?.programId,
            program: { id: program?.id, universityId: program?.universityId },
          },
        };
      }),
    },
    subject: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          SUBJECTS.filter(
            (row) => !where?.semesterId || row.semesterId === where.semesterId
          )
        ),
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          SUBJECTS.find((row) => row.id === where.id) ?? null
        ),
    },
    chapter: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          CHAPTERS.filter((row) => !where?.subjectId || row.subjectId === where.subjectId)
        ),
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }) =>
          CHAPTERS.find((row) => row.id === where.id) ?? null
        ),
    },
    note: {
      findMany: stub.noteFindMany,
      groupBy: stub.noteGroupBy,
    },
    student: {
      findUnique: stub.studentFindUnique,
      update: stub.studentUpdate,
    },
    $queryRaw: stub.queryRaw,
  } as unknown as PrismaClient;

  return stub;
}

const STUDENT_TOKEN = generateStudentToken(STUDENT_ID, 'student@example.com');
const ADMIN_TOKEN = generateAdminToken(STUDENT_ID, 'admin@example.com');

function buildApp(): Express {
  const app = express();

  app.use(express.json());
  app.use('/api/catalog', catalogRoutes);
  app.use(errorHandler);

  return app;
}

type HttpMethod = 'get' | 'put';

function call(app: Express, method: HttpMethod, path: string): request.Test {
  return method === 'put' ? request(app).put(path) : request(app).get(path);
}

function asStudent(app: Express, method: HttpMethod, path: string): request.Test {
  return call(app, method, path).set('Authorization', `Bearer ${STUDENT_TOKEN}`);
}

const routes: Array<[HttpMethod, string]> = [
  ['get', '/api/catalog/universities'],
  ['get', '/api/catalog/programs'],
  ['get', '/api/catalog/streams'],
  ['get', '/api/catalog/semesters'],
  ['get', `/api/catalog/semesters/${SEMESTER_A}/subjects`],
  ['get', `/api/catalog/subjects/${SUBJECT_A}/chapters`],
  ['get', `/api/catalog/chapters/${CHAPTER_A}/notes`],
  ['get', '/api/catalog/search?q=array'],
  ['get', '/api/catalog/me/selection'],
  ['put', '/api/catalog/me/selection'],
];

describe('Student catalogue routes', () => {
  let app: Express;
  let stub: Stub;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    stub = stubClient();
    setCatalogPrismaClient(stub.client);

    // A live student session, so requireActiveSession lets requests through
    sessions.getSessionByToken.mockResolvedValue({
      id: STUDENT_ID,
      userId: STUDENT_ID,
      userType: 'student',
      token: STUDENT_TOKEN,
      deviceId: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
    });

    // Default: no subscription. Each paid-content test opts in explicitly.
    subscriptions.hasActiveSubscription.mockResolvedValue(false);
  });

  afterEach(() => {
    resetCatalogPrismaClient();
  });

  describe('Authentication', () => {
    it.each(routes)('rejects %s %s without a token', async (method, path) => {
      const response = await call(app, method, path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it.each(routes)('rejects %s %s with an admin token', async (method, path) => {
      const response = await call(app, method, path).set(
        'Authorization',
        `Bearer ${ADMIN_TOKEN}`
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a student token whose session is gone', async () => {
      sessions.getSessionByToken.mockResolvedValue(null);

      const response = await asStudent(app, 'get', '/api/catalog/universities');

      expect(response.status).toBe(401);
    });
  });

  describe('Browsing without a subscription', () => {
    it('lists universities', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/universities');

      expect(response.status).toBe(200);
      expect(response.body.universities).toHaveLength(2);
    });

    it('lists the programs of a university', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/programs?universityId=${UNIVERSITY_A}`
      );

      expect(response.status).toBe(200);
      expect(response.body.programs).toEqual([
        { id: PROGRAM_A, name: 'B.Tech', universityId: UNIVERSITY_A },
      ]);
    });

    it('lists the streams of a program', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/streams?programId=${PROGRAM_A}`
      );

      expect(response.status).toBe(200);
      expect(response.body.streams).toHaveLength(1);
    });

    it('lists the semesters of a stream, with a display label', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/semesters?streamId=${STREAM_A}`
      );

      expect(response.status).toBe(200);
      // The fixture semester has no name, so the label falls back to its number
      expect(response.body.semesters[0].label).toBe('Semester 3');
    });

    it('lists the subjects of a semester', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/semesters/${SEMESTER_A}/subjects`
      );

      expect(response.status).toBe(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].name).toBe('Data Structures');
    });

    it('lists the chapters of a subject', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/subjects/${SUBJECT_A}/chapters`
      );

      expect(response.status).toBe(200);
      expect(response.body.chapters[0].title).toBe('Arrays');
    });

    it('404s a parent filter that points at nothing', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/programs?universityId=${UNKNOWN_ID}`
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('University not found');
    });

    it('rejects a non-UUID filter', async () => {
      const response = await asStudent(
        app,
        'get',
        '/api/catalog/programs?universityId=not-a-uuid'
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('404s an unknown semester', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/semesters/${UNKNOWN_ID}/subjects`
      );

      expect(response.status).toBe(404);
    });

    it('404s an unknown subject', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/subjects/${UNKNOWN_ID}/chapters`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Unpublished notes are invisible to students', () => {
    it('counts only published notes on the chapter listing', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/subjects/${SUBJECT_A}/chapters`
      );

      // The fixture chapter holds one published note and one draft
      expect(response.body.chapters[0].noteCount).toBe(1);
      expect(stub.noteGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPublished: true }),
        })
      );
    });

    it('returns only published notes for a chapter', async () => {
      subscriptions.hasActiveSubscription.mockResolvedValue(true);

      const response = await asStudent(
        app,
        'get',
        `/api/catalog/chapters/${CHAPTER_A}/notes`
      );

      expect(response.status).toBe(200);
      expect(response.body.notes).toHaveLength(1);
      expect(response.body.notes[0].id).toBe(PUBLISHED_NOTE);
    });

    it('never mentions a draft note, by id or by title', async () => {
      subscriptions.hasActiveSubscription.mockResolvedValue(true);

      const response = await asStudent(
        app,
        'get',
        `/api/catalog/chapters/${CHAPTER_A}/notes`
      );

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(DRAFT_NOTE);
      expect(body).not.toContain('Unfinished draft');
    });

    it('asks the database for published notes only', async () => {
      subscriptions.hasActiveSubscription.mockResolvedValue(true);

      await asStudent(app, 'get', `/api/catalog/chapters/${CHAPTER_A}/notes`);

      expect(stub.noteFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chapterId: CHAPTER_A, isPublished: true },
        })
      );
    });

    it('excludes unpublished notes from search at the SQL level', async () => {
      subscriptions.hasActiveSubscription.mockResolvedValue(true);

      await asStudent(app, 'get', '/api/catalog/search?q=array');

      for (const [sql] of stub.queryRaw.mock.calls as Array<[Prisma.Sql]>) {
        expect(sql.text).toContain('"is_published" = true');
      }
    });
  });

  describe('Note access requires an active subscription', () => {
    it('refuses the chapter note listing without one', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/chapters/${CHAPTER_A}/notes`
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('NO_ACTIVE_SUBSCRIPTION');
    });

    it('reads nothing before the subscription check, so a 403 leaks no ids', async () => {
      const response = await asStudent(
        app,
        'get',
        `/api/catalog/chapters/${UNKNOWN_ID}/notes`
      );

      // The unknown chapter is still a 403, not a 404
      expect(response.status).toBe(403);
      expect(stub.noteFindMany).not.toHaveBeenCalled();
    });

    it('404s a chapter that does not exist once the student is authorized', async () => {
      subscriptions.hasActiveSubscription.mockResolvedValue(true);

      const response = await asStudent(
        app,
        'get',
        `/api/catalog/chapters/${UNKNOWN_ID}/notes`
      );

      expect(response.status).toBe(404);
    });

    it('refuses search without one, before running any query', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/search?q=array');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('NO_ACTIVE_SUBSCRIPTION');
      expect(stub.queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/catalog/me/selection', () => {
    it('resolves the names of the current selection', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/me/selection');

      expect(response.status).toBe(200);
      expect(response.body.selection).toMatchObject({
        university: { id: UNIVERSITY_A, name: 'MAKAUT' },
        program: { id: PROGRAM_A, name: 'B.Tech' },
        stream: { id: STREAM_A, name: 'CSE' },
        semester: { id: SEMESTER_A, number: 3, label: 'Semester 3' },
      });
    });

    it('returns nulls for a student who has not chosen yet', async () => {
      stub.studentFindUnique.mockResolvedValue(
        selectionRow({
          universityId: null,
          programId: null,
          streamId: null,
          semesterId: null,
        })
      );

      const response = await asStudent(app, 'get', '/api/catalog/me/selection');

      expect(response.status).toBe(200);
      expect(response.body.selection).toEqual({
        university: null,
        program: null,
        stream: null,
        semester: null,
      });
    });

    it('404s when the account is gone', async () => {
      stub.studentFindUnique.mockResolvedValue(null);

      const response = await asStudent(app, 'get', '/api/catalog/me/selection');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/catalog/me/selection', () => {
    it('persists a fully consistent chain', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        universityId: UNIVERSITY_A,
        programId: PROGRAM_A,
        streamId: STREAM_A,
        semesterId: SEMESTER_A,
      });

      expect(response.status).toBe(200);
      expect(stub.studentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: STUDENT_ID },
          data: {
            selectedUniversityId: UNIVERSITY_A,
            selectedProgramId: PROGRAM_A,
            selectedStreamId: STREAM_A,
            selectedSemesterId: SEMESTER_A,
          },
        })
      );
    });

    it('derives the ancestors when only the semester is sent', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        semesterId: SEMESTER_A,
      });

      expect(response.status).toBe(200);
      expect(stub.studentUpdate.mock.calls[0][0].data).toEqual({
        selectedUniversityId: UNIVERSITY_A,
        selectedProgramId: PROGRAM_A,
        selectedStreamId: STREAM_A,
        selectedSemesterId: SEMESTER_A,
      });
    });

    it('clears the levels below the deepest one supplied', async () => {
      await asStudent(app, 'put', '/api/catalog/me/selection').send({
        universityId: UNIVERSITY_A,
        programId: PROGRAM_A,
      });

      expect(stub.studentUpdate.mock.calls[0][0].data).toEqual({
        selectedUniversityId: UNIVERSITY_A,
        selectedProgramId: PROGRAM_A,
        selectedStreamId: null,
        selectedSemesterId: null,
      });
    });

    it('clears the whole selection for an empty body', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send(
        {}
      );

      expect(response.status).toBe(200);
      expect(stub.studentUpdate.mock.calls[0][0].data).toEqual({
        selectedUniversityId: null,
        selectedProgramId: null,
        selectedStreamId: null,
        selectedSemesterId: null,
      });
    });

    it('rejects a program that belongs to another university', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        universityId: UNIVERSITY_B,
        programId: PROGRAM_A,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'universityId' });
      expect(response.body.error.message).toMatch(/does not match/i);
      expect(stub.studentUpdate).not.toHaveBeenCalled();
    });

    it('rejects a stream that belongs to another program', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        programId: PROGRAM_A,
        streamId: STREAM_B,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'programId' });
      expect(stub.studentUpdate).not.toHaveBeenCalled();
    });

    it('rejects a semester that belongs to another stream', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        streamId: STREAM_A,
        semesterId: SEMESTER_B,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'streamId' });
      expect(stub.studentUpdate).not.toHaveBeenCalled();
    });

    it('rejects a chain that is broken two levels up', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        universityId: UNIVERSITY_B,
        programId: PROGRAM_A,
        streamId: STREAM_A,
        semesterId: SEMESTER_A,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'universityId' });
      expect(stub.studentUpdate).not.toHaveBeenCalled();
    });

    it('rejects an id that does not exist', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        semesterId: UNKNOWN_ID,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Semester not found');
      expect(response.body.error.details).toMatchObject({ field: 'semesterId' });
      expect(stub.studentUpdate).not.toHaveBeenCalled();
    });

    it('rejects a malformed id', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        semesterId: 'not-a-uuid',
      });

      expect(response.status).toBe(400);
      expect(stub.studentUpdate).not.toHaveBeenCalled();
    });

    it('returns the saved selection with names resolved', async () => {
      const response = await asStudent(app, 'put', '/api/catalog/me/selection').send({
        semesterId: SEMESTER_B,
      });

      expect(response.body.selection).toMatchObject({
        university: { name: 'Other University' },
        program: { name: 'MBA' },
        stream: { name: 'Finance' },
        semester: { label: 'First' },
      });
    });
  });

  describe('Selection chain rules in isolation', () => {
    const derivedFromSemesterA = {
      universityId: UNIVERSITY_A,
      programId: PROGRAM_A,
      streamId: STREAM_A,
      semesterId: SEMESTER_A,
    };

    it('picks the deepest supplied level', () => {
      expect(deepestSuppliedLevel({})).toBeNull();
      expect(deepestSuppliedLevel({ universityId: UNIVERSITY_A })).toBe('university');
      expect(
        deepestSuppliedLevel({ universityId: UNIVERSITY_A, streamId: STREAM_A })
      ).toBe('stream');
      expect(deepestSuppliedLevel({ semesterId: SEMESTER_A })).toBe('semester');
    });

    it('treats null the same as absent', () => {
      expect(
        deepestSuppliedLevel({ universityId: UNIVERSITY_A, semesterId: null })
      ).toBe('university');
    });

    it('accepts a chain that agrees with the derived ancestry', () => {
      expect(
        reconcileSelection(
          { universityId: UNIVERSITY_A, semesterId: SEMESTER_A },
          derivedFromSemesterA
        )
      ).toBeNull();
    });

    it('accepts an empty selection', () => {
      expect(
        reconcileSelection(
          {},
          {
            universityId: null,
            programId: null,
            streamId: null,
            semesterId: null,
          }
        )
      ).toBeNull();
    });

    it('names the level that disagrees', () => {
      expect(
        reconcileSelection(
          { programId: PROGRAM_B, semesterId: SEMESTER_A },
          derivedFromSemesterA
        )
      ).toMatchObject({ field: 'programId' });
    });

    it('reports the shallowest disagreement first', () => {
      const issue = reconcileSelection(
        {
          universityId: UNIVERSITY_B,
          programId: PROGRAM_B,
          semesterId: SEMESTER_A,
        },
        derivedFromSemesterA
      );

      expect(issue).toMatchObject({ field: 'universityId' });
    });
  });

  describe('GET /api/catalog/search', () => {
    beforeEach(() => {
      subscriptions.hasActiveSubscription.mockResolvedValue(true);
    });

    it('requires a query', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/search');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(stub.queryRaw).not.toHaveBeenCalled();
    });

    it('rejects a blank query', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/search?q=%20%20');

      expect(response.status).toBe(400);
    });

    it('returns a snippet and the full breadcrumb for each hit', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/search?q=array');

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(1);

      const [hit] = response.body.results;
      expect(hit.noteId).toBe(PUBLISHED_NOTE);
      expect(hit.headline).toContain('<mark>');
      expect(hit.matchedIn).toEqual(['title']);
      expect(hit.breadcrumb).toMatchObject({
        university: { name: 'MAKAUT' },
        program: { name: 'B.Tech' },
        stream: { name: 'CSE' },
        semester: { label: 'Semester 3' },
        subject: { name: 'Data Structures' },
        chapter: { title: 'Arrays' },
      });
    });

    it('reports a body-only match as such', async () => {
      stub.searchRows = [{ ...SEARCH_ROW, titleMatch: false, bodyMatch: true }];

      const response = await asStudent(app, 'get', '/api/catalog/search?q=array');

      expect(response.body.results[0].matchedIn).toEqual(['body']);
    });

    it('reports a subject-name match as such', async () => {
      stub.searchRows = [
        {
          ...SEARCH_ROW,
          titleMatch: false,
          bodyMatch: false,
          subjectMatch: true,
        },
      ];

      const response = await asStudent(app, 'get', '/api/catalog/search?q=structures');

      expect(response.body.results[0].matchedIn).toEqual(['subject']);
    });

    it('paginates and reports the total from the count query', async () => {
      stub.searchTotal = 42;

      const response = await asStudent(
        app,
        'get',
        '/api/catalog/search?q=array&page=2&pageSize=5'
      );

      expect(response.body.pagination).toEqual({
        page: 2,
        pageSize: 5,
        total: 42,
        totalPages: 9,
      });

      const [rowQuery] = stub.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(rowQuery.values).toContain(5);
    });

    it('rejects a pageSize above the maximum', async () => {
      const response = await asStudent(
        app,
        'get',
        '/api/catalog/search?q=array&pageSize=500'
      );

      expect(response.status).toBe(400);
      expect(stub.queryRaw).not.toHaveBeenCalled();
    });

    it('matches subject and chapter names as well as the note vector', async () => {
      await asStudent(app, 'get', '/api/catalog/search?q=array');

      const [rowQuery] = stub.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(rowQuery.text).toContain('n."search_vector" @@');
      expect(rowQuery.text).toContain(`to_tsvector('english', s."name")`);
      expect(rowQuery.text).toContain(`to_tsvector('english', ch."title")`);
    });

    it('ranks title matches above body matches', async () => {
      await asStudent(app, 'get', '/api/catalog/search?q=array');

      const [rowQuery] = stub.queryRaw.mock.calls[0] as [Prisma.Sql];
      const orderBy = rowQuery.text.slice(rowQuery.text.indexOf('ORDER BY'));

      // The title-match flag is the primary key, the weighted rank the secondary
      expect(orderBy.indexOf('n."title"')).toBeLessThan(orderBy.indexOf('ts_rank'));
    });

    it('binds the search term instead of interpolating it', async () => {
      const term = "array'); DROP TABLE notes;--";

      const response = await asStudent(app, 'get', '/api/catalog/search').query({
        q: term,
      });

      expect(response.status).toBe(200);

      const [rowQuery] = stub.queryRaw.mock.calls[0] as [Prisma.Sql];
      expect(rowQuery.values).toContain(term);
      expect(rowQuery.text).not.toContain('DROP TABLE');
    });

    it('binds every filter instead of interpolating it', async () => {
      await asStudent(app, 'get', '/api/catalog/search').query({
        q: 'array',
        universityId: UNIVERSITY_A,
        programId: PROGRAM_A,
        streamId: STREAM_A,
        semesterId: SEMESTER_A,
        subjectId: SUBJECT_A,
      });

      const [rowQuery] = stub.queryRaw.mock.calls[0] as [Prisma.Sql];

      for (const id of [
        UNIVERSITY_A,
        PROGRAM_A,
        STREAM_A,
        SEMESTER_A,
        SUBJECT_A,
      ]) {
        expect(rowQuery.values).toContain(id);
        expect(rowQuery.text).not.toContain(id);
      }
    });

    it('echoes the filters that were applied', async () => {
      const response = await asStudent(app, 'get', '/api/catalog/search').query({
        q: 'array',
        subjectId: SUBJECT_A,
      });

      expect(response.body.filters).toEqual({ subjectId: SUBJECT_A });
    });

    it('rejects a filter that is not a UUID', async () => {
      const response = await asStudent(
        app,
        'get',
        '/api/catalog/search?q=array&subjectId=nope'
      );

      expect(response.status).toBe(400);
      expect(stub.queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('buildSearchWhere', () => {
    const tsQuery = Prisma.sql`websearch_to_tsquery('english', ${'array'})`;

    it('always restricts to published notes', () => {
      expect(buildSearchWhere(tsQuery, {}).text).toContain('"is_published" = true');
    });

    it('adds no filter conditions when none were supplied', () => {
      const where = buildSearchWhere(tsQuery, {}).text;

      expect(where).not.toContain('s."id" =');
      expect(where).not.toContain('u."id" =');
    });

    it('binds each supplied filter as a parameter', () => {
      const where = buildSearchWhere(tsQuery, {
        subjectId: SUBJECT_A,
        universityId: UNIVERSITY_A,
      });

      expect(where.values).toContain(SUBJECT_A);
      expect(where.values).toContain(UNIVERSITY_A);
      expect(where.text).not.toContain(SUBJECT_A);
      expect(where.text).toContain('s."id" = $');
    });
  });
});
