import request from 'supertest';
import express, { Express, Router } from 'express';
import { errorHandler } from '../middleware/errorHandler';
import { generateAdminToken, generateStudentToken } from '../utils/jwt';
import adminChapterRoutes from './adminChapterRoutes';
import adminHierarchyRoutes from './adminHierarchyRoutes';

/**
 * Admin academic hierarchy route tests.
 *
 * The routers are the unit under test: authorization, request validation, the
 * parent-exists check that turns a would-be foreign-key 500 into a 404, the
 * count-before-delete ordering, and the reorder ownership check. The hierarchy
 * service is substituted so no database is required and so the tests can assert
 * exactly what the routes ask of it (for example, that the tree is loaded with a
 * single call rather than a query per level).
 *
 * Requirements: 5.4 (student tokens rejected), 6.1, 6.2, 6.8, 6.9, 6.10
 */

jest.mock('../services/hierarchy');
jest.mock('../services/session');

import * as hierarchyService from '../services/hierarchy';
import * as sessionService from '../services/session';

const hierarchy = hierarchyService as jest.Mocked<typeof hierarchyService>;
const sessions = sessionService as jest.Mocked<typeof sessionService>;

const UUID = '3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90';
const OTHER_UUID = '9c4d1b2e-7a6f-4e3d-8b51-1f2a3c4d5e6f';
const THIRD_UUID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const ADMIN_TOKEN = generateAdminToken(UUID, 'admin@example.com');
const STUDENT_TOKEN = generateStudentToken(UUID, 'student@example.com');

/**
 * Mirrors the wiring the admin router uses: the hierarchy router carries its own
 * resource prefixes, the chapter router is mounted at /chapters.
 */
function createHierarchyTestApp(): Express {
  const app = express();
  app.use(express.json());

  const admin = Router();
  admin.use('/', adminHierarchyRoutes);
  admin.use('/chapters', adminChapterRoutes);

  app.use('/api/admin', admin);
  app.use(errorHandler);

  return app;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function call(app: Express, method: HttpMethod, path: string): request.Test {
  const agent = request(app);

  switch (method) {
    case 'post':
      return agent.post(path);
    case 'put':
      return agent.put(path);
    case 'patch':
      return agent.patch(path);
    case 'delete':
      return agent.delete(path);
    default:
      return agent.get(path);
  }
}

/** Every hierarchy and chapter endpoint. */
const protectedRoutes: Array<[HttpMethod, string]> = [
  ['get', '/api/admin/universities'],
  ['post', '/api/admin/universities'],
  ['get', `/api/admin/universities/${UUID}`],
  ['put', `/api/admin/universities/${UUID}`],
  ['delete', `/api/admin/universities/${UUID}`],

  ['get', '/api/admin/programs'],
  ['post', '/api/admin/programs'],
  ['get', `/api/admin/programs/${UUID}`],
  ['put', `/api/admin/programs/${UUID}`],
  ['delete', `/api/admin/programs/${UUID}`],

  ['get', '/api/admin/streams'],
  ['post', '/api/admin/streams'],
  ['get', `/api/admin/streams/${UUID}`],
  ['put', `/api/admin/streams/${UUID}`],
  ['delete', `/api/admin/streams/${UUID}`],

  ['get', '/api/admin/semesters'],
  ['post', '/api/admin/semesters'],
  ['get', `/api/admin/semesters/${UUID}`],
  ['put', `/api/admin/semesters/${UUID}`],
  ['delete', `/api/admin/semesters/${UUID}`],

  ['get', '/api/admin/chapters'],
  ['post', '/api/admin/chapters'],
  ['patch', '/api/admin/chapters/reorder'],
  ['get', `/api/admin/chapters/${UUID}`],
  ['put', `/api/admin/chapters/${UUID}`],
  ['delete', `/api/admin/chapters/${UUID}`],

  ['get', `/api/admin/hierarchy/tree?universityId=${UUID}`],
];

/** Sends an authenticated admin request. */
function asAdmin(app: Express, method: HttpMethod, path: string): request.Test {
  return call(app, method, path).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
}

const timestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

describe('Admin hierarchy API routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createHierarchyTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // A live, non-idle admin session, so the admin guards let requests through
    sessions.getSessionByToken.mockResolvedValue({
      id: UUID,
      userId: UUID,
      userType: 'admin',
      token: ADMIN_TOKEN,
      deviceId: null,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      createdAt: new Date(),
    });
    sessions.refreshSessionExpiry.mockResolvedValue(true);
  });

  describe('Authorization', () => {
    it.each(protectedRoutes)(
      'rejects %s %s without a token',
      async (method, path) => {
        const response = await call(app, method, path);

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    );

    it.each(protectedRoutes)(
      'rejects %s %s with a student token',
      async (method, path) => {
        const response = await call(app, method, path).set(
          'Authorization',
          `Bearer ${STUDENT_TOKEN}`
        );

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }
    );

    it('rejects a valid admin token whose session is gone', async () => {
      sessions.getSessionByToken.mockResolvedValue(null);

      const response = await asAdmin(app, 'get', '/api/admin/universities');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Universities', () => {
    it('paginates the listing and reports the window', async () => {
      hierarchy.listUniversitiesPaginated.mockResolvedValue({
        items: [{ id: UUID, name: 'MAKAUT', ...timestamps }],
        total: 42,
      });

      const response = await asAdmin(
        app,
        'get',
        '/api/admin/universities?page=2&pageSize=5'
      );

      expect(response.status).toBe(200);
      expect(hierarchy.listUniversitiesPaginated).toHaveBeenCalledWith({
        skip: 5,
        take: 5,
      });
      expect(response.body.universities).toHaveLength(1);
      expect(response.body.pagination).toEqual({
        page: 2,
        pageSize: 5,
        total: 42,
        totalPages: 9,
      });
    });

    it('rejects a pageSize above the maximum', async () => {
      const response = await asAdmin(
        app,
        'get',
        '/api/admin/universities?pageSize=1000'
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(hierarchy.listUniversitiesPaginated).not.toHaveBeenCalled();
    });

    it('creates a university', async () => {
      hierarchy.createUniversity.mockResolvedValue({
        id: UUID,
        name: 'MAKAUT',
        ...timestamps,
      });

      const response = await asAdmin(app, 'post', '/api/admin/universities').send({
        name: 'MAKAUT',
      });

      expect(response.status).toBe(201);
      expect(response.body.university.name).toBe('MAKAUT');
      expect(hierarchy.createUniversity).toHaveBeenCalledWith({ name: 'MAKAUT' });
    });

    it('rejects a create without a name', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/universities').send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'name' });
      expect(hierarchy.createUniversity).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID id', async () => {
      const response = await asAdmin(app, 'get', '/api/admin/universities/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(hierarchy.getUniversity).not.toHaveBeenCalled();
    });

    it('returns 404 for a university that does not exist', async () => {
      hierarchy.getUniversity.mockResolvedValue(null);

      const response = await asAdmin(app, 'get', `/api/admin/universities/${UUID}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('University not found');
    });

    it('counts descendants before deleting and reports the cascade', async () => {
      const callOrder: string[] = [];

      hierarchy.countUniversityDescendants.mockImplementation(async () => {
        callOrder.push('count');
        return {
          programs: 2,
          streams: 3,
          semesters: 8,
          subjects: 40,
          chapters: 120,
          notes: 700,
          resources: 12,
        };
      });
      hierarchy.deleteUniversity.mockImplementation(async () => {
        callOrder.push('delete');
      });

      const response = await asAdmin(app, 'delete', `/api/admin/universities/${UUID}`);

      expect(response.status).toBe(200);
      expect(callOrder).toEqual(['count', 'delete']);
      expect(response.body.deletedCounts).toEqual({
        programs: 2,
        streams: 3,
        semesters: 8,
        subjects: 40,
        chapters: 120,
        notes: 700,
        resources: 12,
      });
    });

    it('translates a missing record on delete into a 404', async () => {
      hierarchy.countUniversityDescendants.mockResolvedValue({
        programs: 0,
        streams: 0,
        semesters: 0,
        subjects: 0,
        chapters: 0,
        notes: 0,
        resources: 0,
      });
      hierarchy.deleteUniversity.mockRejectedValue(
        Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' })
      );

      const response = await asAdmin(app, 'delete', `/api/admin/universities/${UUID}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Programs', () => {
    it('filters the listing by universityId', async () => {
      hierarchy.listProgramsPaginated.mockResolvedValue({ items: [], total: 0 });

      const response = await asAdmin(
        app,
        'get',
        `/api/admin/programs?universityId=${UUID}`
      );

      expect(response.status).toBe(200);
      expect(response.body.universityId).toBe(UUID);
      expect(hierarchy.listProgramsPaginated).toHaveBeenCalledWith({
        universityId: UUID,
        skip: 0,
        take: 20,
      });
    });

    it('rejects a non-UUID universityId filter', async () => {
      const response = await asAdmin(
        app,
        'get',
        '/api/admin/programs?universityId=nope'
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(hierarchy.listProgramsPaginated).not.toHaveBeenCalled();
    });

    it('answers 404 when the parent university does not exist', async () => {
      hierarchy.universityExists.mockResolvedValue(false);

      const response = await asAdmin(app, 'post', '/api/admin/programs').send({
        universityId: UUID,
        name: 'B.Tech',
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('University not found');
      expect(hierarchy.createProgram).not.toHaveBeenCalled();
    });

    it('creates a program under an existing university', async () => {
      hierarchy.universityExists.mockResolvedValue(true);
      hierarchy.createProgram.mockResolvedValue({
        id: OTHER_UUID,
        universityId: UUID,
        name: 'B.Tech',
        ...timestamps,
      });

      const response = await asAdmin(app, 'post', '/api/admin/programs').send({
        universityId: UUID,
        name: 'B.Tech',
      });

      expect(response.status).toBe(201);
      expect(response.body.program.universityId).toBe(UUID);
    });

    it('rejects a create with a malformed universityId', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/programs').send({
        universityId: 'not-a-uuid',
        name: 'B.Tech',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(hierarchy.universityExists).not.toHaveBeenCalled();
    });
  });

  describe('Streams', () => {
    it('answers 404 when the parent program does not exist', async () => {
      hierarchy.programExists.mockResolvedValue(false);

      const response = await asAdmin(app, 'post', '/api/admin/streams').send({
        programId: UUID,
        name: 'Computer Science',
      });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Program not found');
      expect(hierarchy.createStream).not.toHaveBeenCalled();
    });

    it('creates a stream under an existing program', async () => {
      hierarchy.programExists.mockResolvedValue(true);
      hierarchy.createStream.mockResolvedValue({
        id: OTHER_UUID,
        programId: UUID,
        name: 'Computer Science',
        ...timestamps,
      });

      const response = await asAdmin(app, 'post', '/api/admin/streams').send({
        programId: UUID,
        name: 'Computer Science',
      });

      expect(response.status).toBe(201);
      expect(response.body.stream.name).toBe('Computer Science');
    });
  });

  describe('Semesters', () => {
    it.each([
      ['a missing number', { streamId: UUID }],
      ['a zero number', { streamId: UUID, number: 0 }],
      ['a non-numeric number', { streamId: UUID, number: 'two' }],
      ['a fractional number', { streamId: UUID, number: 1.5 }],
    ])('rejects %s', async (_label, payload) => {
      const response = await asAdmin(app, 'post', '/api/admin/semesters').send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'number' });
      expect(hierarchy.createSemester).not.toHaveBeenCalled();
    });

    it('creates a semester without a name', async () => {
      hierarchy.streamExists.mockResolvedValue(true);
      hierarchy.createSemester.mockResolvedValue({
        id: OTHER_UUID,
        streamId: UUID,
        number: 3,
        name: null,
        ...timestamps,
      });

      const response = await asAdmin(app, 'post', '/api/admin/semesters').send({
        streamId: UUID,
        number: 3,
      });

      expect(response.status).toBe(201);
      expect(hierarchy.createSemester).toHaveBeenCalledWith({
        streamId: UUID,
        number: 3,
        name: undefined,
      });
      expect(response.body.semester.number).toBe(3);
    });

    it('answers 404 when the parent stream does not exist', async () => {
      hierarchy.streamExists.mockResolvedValue(false);

      const response = await asAdmin(app, 'post', '/api/admin/semesters').send({
        streamId: UUID,
        number: 1,
      });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Stream not found');
      expect(hierarchy.createSemester).not.toHaveBeenCalled();
    });

    it('lists semesters scoped to a stream', async () => {
      hierarchy.listSemestersPaginated.mockResolvedValue({ items: [], total: 0 });

      const response = await asAdmin(
        app,
        'get',
        `/api/admin/semesters?streamId=${UUID}`
      );

      expect(response.status).toBe(200);
      expect(hierarchy.listSemestersPaginated).toHaveBeenCalledWith({
        streamId: UUID,
        skip: 0,
        take: 20,
      });
    });
  });

  describe('GET /api/admin/hierarchy/tree', () => {
    it('requires a universityId', async () => {
      const response = await asAdmin(app, 'get', '/api/admin/hierarchy/tree');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(hierarchy.getHierarchyTree).not.toHaveBeenCalled();
    });

    it('returns the nested tree in a single lookup', async () => {
      hierarchy.getHierarchyTree.mockResolvedValue({
        id: UUID,
        name: 'MAKAUT',
        programs: [
          {
            id: OTHER_UUID,
            name: 'B.Tech',
            streams: [
              {
                id: THIRD_UUID,
                name: 'CSE',
                semesters: [
                  {
                    id: UUID,
                    number: 1,
                    name: null,
                    subjects: [
                      {
                        id: OTHER_UUID,
                        name: 'Maths I',
                        code: 'M101',
                        position: 0,
                        chapters: [{ id: THIRD_UUID, title: 'Limits', position: 0 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      const response = await asAdmin(
        app,
        'get',
        `/api/admin/hierarchy/tree?universityId=${UUID}`
      );

      expect(response.status).toBe(200);
      // One nested query, not a walk down the levels
      expect(hierarchy.getHierarchyTree).toHaveBeenCalledTimes(1);
      expect(hierarchy.getHierarchyTree).toHaveBeenCalledWith(UUID);
      expect(
        response.body.tree.programs[0].streams[0].semesters[0].subjects[0].chapters[0]
          .title
      ).toBe('Limits');
    });

    it('returns 404 for an unknown university', async () => {
      hierarchy.getHierarchyTree.mockResolvedValue(null);

      const response = await asAdmin(
        app,
        'get',
        `/api/admin/hierarchy/tree?universityId=${UUID}`
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('University not found');
    });
  });

  describe('Chapters', () => {
    const chapter = {
      id: OTHER_UUID,
      subjectId: UUID,
      title: 'Limits',
      position: 0,
      ...timestamps,
    };

    it('paginates the listing scoped to a subject', async () => {
      hierarchy.listChaptersPaginated.mockResolvedValue({
        items: [chapter],
        total: 1,
      });

      const response = await asAdmin(
        app,
        'get',
        `/api/admin/chapters?subjectId=${UUID}`
      );

      expect(response.status).toBe(200);
      expect(response.body.subjectId).toBe(UUID);
      expect(response.body.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(hierarchy.listChaptersPaginated).toHaveBeenCalledWith({
        subjectId: UUID,
        skip: 0,
        take: 20,
      });
    });

    it('answers 404 when the parent subject does not exist', async () => {
      hierarchy.subjectExists.mockResolvedValue(false);

      const response = await asAdmin(app, 'post', '/api/admin/chapters').send({
        subjectId: UUID,
        title: 'Limits',
      });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Subject not found');
      expect(hierarchy.createChapter).not.toHaveBeenCalled();
    });

    it('creates a chapter under an existing subject', async () => {
      hierarchy.subjectExists.mockResolvedValue(true);
      hierarchy.createChapter.mockResolvedValue(chapter);

      const response = await asAdmin(app, 'post', '/api/admin/chapters').send({
        subjectId: UUID,
        title: 'Limits',
        position: 0,
      });

      expect(response.status).toBe(201);
      expect(response.body.chapter.title).toBe('Limits');
      expect(hierarchy.createChapter).toHaveBeenCalledWith({
        subjectId: UUID,
        title: 'Limits',
        position: 0,
      });
    });

    it('rejects a create without a title', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/chapters').send({
        subjectId: UUID,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'title' });
      expect(hierarchy.subjectExists).not.toHaveBeenCalled();
    });

    it('rejects a negative position', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/chapters').send({
        subjectId: UUID,
        title: 'Limits',
        position: -1,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'position' });
    });

    it('returns 404 for a chapter that does not exist', async () => {
      hierarchy.getChapterById.mockResolvedValue(null);

      const response = await asAdmin(app, 'get', `/api/admin/chapters/${UUID}`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Chapter not found');
    });

    it('counts notes and resources before deleting', async () => {
      const callOrder: string[] = [];

      hierarchy.countChapterDescendants.mockImplementation(async () => {
        callOrder.push('count');
        return { notes: 7, resources: 2 };
      });
      hierarchy.deleteChapter.mockImplementation(async () => {
        callOrder.push('delete');
      });

      const response = await asAdmin(app, 'delete', `/api/admin/chapters/${UUID}`);

      expect(response.status).toBe(200);
      expect(callOrder).toEqual(['count', 'delete']);
      expect(response.body.deletedCounts).toEqual({ notes: 7, resources: 2 });
    });
  });

  describe('PATCH /api/admin/chapters/reorder', () => {
    it.each([
      ['an empty orderedIds array', { subjectId: UUID, orderedIds: [] }],
      ['a non-array orderedIds', { subjectId: UUID, orderedIds: UUID }],
      [
        'duplicate ids',
        { subjectId: UUID, orderedIds: [UUID, UUID] },
      ],
      [
        'a non-UUID entry',
        { subjectId: UUID, orderedIds: [UUID, 'not-a-uuid'] },
      ],
    ])('rejects %s', async (_label, payload) => {
      const response = await asAdmin(app, 'patch', '/api/admin/chapters/reorder').send(
        payload
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(hierarchy.reorderChapters).not.toHaveBeenCalled();
    });

    it('answers 404 when the subject does not exist', async () => {
      hierarchy.subjectExists.mockResolvedValue(false);

      const response = await asAdmin(app, 'patch', '/api/admin/chapters/reorder').send({
        subjectId: UUID,
        orderedIds: [OTHER_UUID],
      });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Subject not found');
      expect(hierarchy.reorderChapters).not.toHaveBeenCalled();
    });

    it('rejects ids that belong to another subject and reports them', async () => {
      hierarchy.subjectExists.mockResolvedValue(true);
      hierarchy.reorderChapters.mockResolvedValue({
        invalidIds: [THIRD_UUID],
        chapters: [],
      });

      const response = await asAdmin(app, 'patch', '/api/admin/chapters/reorder').send({
        subjectId: UUID,
        orderedIds: [OTHER_UUID, THIRD_UUID],
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({
        field: 'orderedIds',
        invalidIds: [THIRD_UUID],
      });
    });

    it('rewrites positions to match the order given', async () => {
      hierarchy.subjectExists.mockResolvedValue(true);
      hierarchy.reorderChapters.mockResolvedValue({
        invalidIds: [],
        chapters: [
          { id: THIRD_UUID, subjectId: UUID, title: 'B', position: 0, ...timestamps },
          { id: OTHER_UUID, subjectId: UUID, title: 'A', position: 1, ...timestamps },
        ],
      });

      const response = await asAdmin(app, 'patch', '/api/admin/chapters/reorder').send({
        subjectId: UUID,
        orderedIds: [THIRD_UUID, OTHER_UUID],
      });

      expect(response.status).toBe(200);
      expect(hierarchy.reorderChapters).toHaveBeenCalledWith({
        subjectId: UUID,
        orderedIds: [THIRD_UUID, OTHER_UUID],
      });
      expect(response.body.chapters.map((c: { id: string }) => c.id)).toEqual([
        THIRD_UUID,
        OTHER_UUID,
      ]);
      expect(response.body.chapters.map((c: { position: number }) => c.position)).toEqual(
        [0, 1]
      );
    });
  });
});
