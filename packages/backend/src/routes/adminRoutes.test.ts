import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';
import { generateStudentToken } from '../utils/jwt';

/**
 * Admin route wiring and authorization tests.
 *
 * These assert the checks that run before any database access: every
 * /api/admin/* route is behind admin authentication, a missing token is a 401,
 * and a valid *student* token is a 403. No database connection is required.
 *
 * Requirements: 5.4, 6.9 (route wiring), 7.1, 8.6
 */
type HttpMethod = 'get' | 'post' | 'put' | 'delete';

const UUID = '3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90';

function call(app: Express, method: HttpMethod, path: string): request.Test {
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

/** Every admin route except the public login endpoint. */
const protectedAdminRoutes: Array<[HttpMethod, string]> = [
  ['post', '/api/admin/auth/logout'],
  ['get', '/api/admin/auth/session'],

  ['get', '/api/admin/students'],
  ['get', '/api/admin/students/search?email=student@example.com'],
  ['get', `/api/admin/students/${UUID}`],
  ['get', `/api/admin/students/${UUID}/devices`],
  ['delete', `/api/admin/students/${UUID}/devices/${UUID}`],

  ['get', '/api/admin/subjects'],
  ['post', '/api/admin/subjects'],
  ['get', `/api/admin/subjects/${UUID}`],
  ['put', `/api/admin/subjects/${UUID}`],
  ['delete', `/api/admin/subjects/${UUID}`],

  ['get', '/api/admin/notes'],
  ['post', '/api/admin/notes'],
  ['post', '/api/admin/notes/images'],
  ['get', `/api/admin/notes/${UUID}`],
  ['put', `/api/admin/notes/${UUID}`],
  ['delete', `/api/admin/notes/${UUID}`],

  ['get', '/api/admin/subscriptions'],
  ['post', '/api/admin/subscriptions'],
  ['get', `/api/admin/subscriptions/${UUID}`],
  ['put', `/api/admin/subscriptions/${UUID}`],
  ['delete', `/api/admin/subscriptions/${UUID}`],
];

describe('Admin API routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('Authentication required', () => {
    it.each(protectedAdminRoutes)(
      'rejects %s %s without a token',
      async (method, path) => {
        const response = await call(app, method, path);

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    );

    it.each(protectedAdminRoutes)(
      'rejects %s %s with an invalid token',
      async (method, path) => {
        const response = await call(app, method, path).set(
          'Authorization',
          'Bearer not-a-real-token'
        );

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    );
  });

  describe('Student tokens are rejected on the admin surface', () => {
    const studentToken = generateStudentToken(UUID, 'student@example.com');

    it.each(protectedAdminRoutes)(
      'rejects %s %s with a student token',
      async (method, path) => {
        const response = await call(app, method, path).set(
          'Authorization',
          `Bearer ${studentToken}`
        );

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }
    );
  });

  describe('POST /api/admin/auth/login validation', () => {
    it('rejects a missing email', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({ password: 'securepassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'email' });
    });

    it('rejects a malformed email', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'not-an-email', password: 'securepassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing password', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'password' });
    });
  });
});
