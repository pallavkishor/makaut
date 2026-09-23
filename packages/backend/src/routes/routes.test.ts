import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';
import { generateAdminToken } from '../utils/jwt';

/**
 * Route wiring and authorization tests.
 *
 * These cover the checks that happen before any database access: routers are
 * mounted, protected routes reject unauthenticated/incorrect-role callers, and
 * request validation rejects malformed input.
 */
type HttpMethod = 'get' | 'post' | 'delete';

function call(app: Express, method: HttpMethod, path: string): request.Test {
  const agent = request(app);

  switch (method) {
    case 'post':
      return agent.post(path);
    case 'delete':
      return agent.delete(path);
    default:
      return agent.get(path);
  }
}

describe('Student-facing API routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('Authentication required', () => {
    const protectedRoutes: Array<[HttpMethod, string]> = [
      ['get', '/api/auth/session'],
      ['post', '/api/auth/logout'],
      ['get', '/api/students/me'],
      ['get', '/api/students/me/subscriptions'],
      ['get', '/api/students/me/devices'],
      ['delete', '/api/students/me/devices/3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90'],
      ['get', '/api/subjects'],
      ['get', '/api/subjects/3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90'],
      ['get', '/api/subjects/3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90/notes'],
      ['get', '/api/subjects/3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90/search?q=test'],
      ['get', '/api/notes/3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90'],
    ];

    it.each(protectedRoutes)(
      'rejects %s %s without a token',
      async (method, path) => {
        const response = await call(app, method, path);

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    );

    it.each(protectedRoutes)(
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

    it('rejects admin tokens on student routes', async () => {
      const adminToken = generateAdminToken(
        '3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90',
        'admin@example.com'
      );

      const response = await request(app)
        .get('/api/students/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/auth/register validation', () => {
    it('rejects a malformed email address', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'securepassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'email' });
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'short-password@example.com', password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'password' });
    });

    it('rejects a missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'missing-password@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login validation', () => {
    it('rejects a missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'securepassword123' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
