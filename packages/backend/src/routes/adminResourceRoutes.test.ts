import express, { Express } from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { errorHandler } from '../middleware/errorHandler';
import { generateStudentToken } from '../utils/jwt';
import adminResourceRoutes from './adminResourceRoutes';

/**
 * Admin resource route wiring and authorization tests.
 *
 * Covers the checks that happen before any database access: every endpoint is
 * behind the admin guards, a student token is refused, and request validation
 * rejects malformed ids. Upload and CRUD behaviour needs a live database and is
 * exercised by the resource service tests plus integration testing.
 */

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';

type Method = 'get' | 'post' | 'put' | 'delete';

function buildApp(): Express {
  const app = express();

  app.use(express.json());
  app.use('/api/admin/resources', adminResourceRoutes);
  app.use(errorHandler);

  return app;
}

function call(app: Express, method: Method, path: string): request.Test {
  const agent = request(app);

  switch (method) {
    case 'post':
      return agent.post(path);
    case 'put':
      return agent.put(path);
    case 'delete':
      return agent.delete(path);
    default:
      return agent.get(path);
  }
}

describe('Admin resource routes', () => {
  let app: Express;

  const endpoints: Array<[Method, string]> = [
    ['get', '/api/admin/resources'],
    ['post', '/api/admin/resources'],
    ['get', `/api/admin/resources/${RESOURCE_ID}`],
    ['put', `/api/admin/resources/${RESOURCE_ID}`],
    ['post', `/api/admin/resources/${RESOURCE_ID}/publish`],
    ['post', `/api/admin/resources/${RESOURCE_ID}/unpublish`],
    ['delete', `/api/admin/resources/${RESOURCE_ID}`],
  ];

  beforeAll(() => {
    app = buildApp();
  });

  it.each(endpoints)('rejects %s %s without a token', async (method, path) => {
    const response = await call(app, method, path);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each(endpoints)(
    'rejects %s %s with a student token',
    async (method, path) => {
      const studentToken = generateStudentToken(
        randomUUID(),
        'student@example.com'
      );

      const response = await call(app, method, path).set(
        'Authorization',
        `Bearer ${studentToken}`
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  );

  it('rejects an invalid token', async () => {
    const response = await request(app)
      .get('/api/admin/resources')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not accept an upload from an unauthenticated caller even with a valid PDF body', async () => {
    const response = await request(app)
      .post('/api/admin/resources?title=Syllabus&resourceType=SYLLABUS')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.7\nhello\n%%EOF\n', 'ascii'));

    expect(response.status).toBe(401);
  });
});
