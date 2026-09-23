import express, { Express } from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { errorHandler } from '../middleware/errorHandler';
import { generateAdminToken } from '../utils/jwt';
import { SignedUrlFailure, signResourceDownload } from '../lib/signedUrl';
import resourceRoutes from './resourceRoutes';

/**
 * Student resource route wiring and authorization tests.
 *
 * Like the other route tests, these cover everything that is decided before the
 * first database access: the gates on the listing and download-url endpoints,
 * and the token checks on the download endpoint. The routers are mounted on a
 * bare app because wiring them into the API router is a separate change.
 */

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

function buildApp(): Express {
  const app = express();

  app.use(express.json());
  app.use('/api/resources', resourceRoutes);
  app.use(errorHandler);

  return app;
}

/** Flips one character of the signature segment. */
function tamperSignature(token: string): string {
  const [payload, signature] = token.split('.');
  const replacement = signature[0] === 'A' ? 'B' : 'A';

  return `${payload}.${replacement}${signature.slice(1)}`;
}

describe('Student resource routes', () => {
  let app: Express;

  beforeAll(() => {
    process.env.RESOURCE_URL_SECRET = 'test-resource-url-secret';
    app = buildApp();
  });

  afterAll(() => {
    delete process.env.RESOURCE_URL_SECRET;
  });

  describe('Authentication required', () => {
    it('rejects the resource listing without a token', async () => {
      const response = await request(app).get('/api/resources');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a download-url request without a token', async () => {
      const response = await request(app).post(
        `/api/resources/${RESOURCE_ID}/download-url`
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an invalid token', async () => {
      const response = await request(app)
        .get('/api/resources')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an admin token on the student resource routes', async () => {
      const adminToken = generateAdminToken(randomUUID(), 'admin@example.com');

      const response = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    // A student token with no server-side session is rejected by
    // requireActiveSession, but asserting that needs a database, so it belongs
    // with the integration tests rather than here.
  });

  describe('GET /api/resources/download/:token', () => {
    it('rejects a token that was never signed here', async () => {
      const response = await request(app).get(
        '/api/resources/download/not-a-real-token'
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.details).toMatchObject({
        reason: SignedUrlFailure.MALFORMED,
      });
    });

    it('rejects a token whose signature has been tampered with', async () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_ID,
        studentId: STUDENT_ID,
      });

      const response = await request(app).get(
        `/api/resources/download/${tamperSignature(token)}`
      );

      expect(response.status).toBe(403);
      expect(response.body.error.details).toMatchObject({
        reason: SignedUrlFailure.INVALID_SIGNATURE,
      });
    });

    it('rejects an expired token with a distinct reason', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const { token } = signResourceDownload({
        resourceId: RESOURCE_ID,
        studentId: STUDENT_ID,
        ttlSeconds: 300,
        now: tenMinutesAgo,
      });

      const response = await request(app).get(`/api/resources/download/${token}`);

      // 410 Gone: the link was genuine, it is simply no longer usable
      expect(response.status).toBe(410);
      expect(response.body.error.details).toMatchObject({
        reason: SignedUrlFailure.EXPIRED,
      });
      expect(response.body.error.message).toMatch(/expired/i);
    });

    it('does not echo the rejected token back to the caller', async () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_ID,
        studentId: STUDENT_ID,
        ttlSeconds: 300,
        now: new Date(Date.now() - 600_000),
      });

      const response = await request(app).get(`/api/resources/download/${token}`);

      expect(JSON.stringify(response.body)).not.toContain(token);
    });
  });
});
