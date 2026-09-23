import request from 'supertest';
import { createApp } from './app';
import { Express } from 'express';

describe('Express Application', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('Health Check', () => {
    it('should return 200 OK for health check endpoint', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return valid timestamp in health check', async () => {
      const response = await request(app).get('/health');

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('Middleware Configuration', () => {
    it('should parse JSON request bodies', async () => {
      // This will hit 404 but should parse the body without error
      const response = await request(app)
        .post('/test-json')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404); // Route doesn't exist
      // If JSON parsing failed, we'd get 400 instead
    });

    it('should reject invalid JSON', async () => {
      const response = await request(app)
        .post('/test-json')
        .send('{"invalid": json}')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid JSON');
    });

    it('should have security headers from Helmet', async () => {
      const response = await request(app).get('/health');

      // Helmet sets various security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should have CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/nonexistent-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('Route not found');
    });

    it('should return consistent error format', async () => {
      const response = await request(app).get('/nonexistent-route');

      expect(response.body).toMatchObject({
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
      });
    });
  });

  describe('HTTP Methods', () => {
    it('should handle GET requests', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should handle POST requests', async () => {
      const response = await request(app).post('/nonexistent');
      expect(response.status).toBe(404); // Route doesn't exist but POST is processed
    });

    it('should handle PUT requests', async () => {
      const response = await request(app).put('/nonexistent');
      expect(response.status).toBe(404);
    });

    it('should handle DELETE requests', async () => {
      const response = await request(app).delete('/nonexistent');
      expect(response.status).toBe(404);
    });
  });
});
