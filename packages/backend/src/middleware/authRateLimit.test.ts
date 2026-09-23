import request from 'supertest';
import express, { Express } from 'express';
import { authRateLimiter, registrationRateLimiter } from './authRateLimit';
import { ErrorCode } from './errorHandler';

/**
 * Test suite for authentication rate limiting middleware
 * Validates requirements 9.8 and 9.9
 */
describe('Authentication Rate Limiting', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
  });

  describe('authRateLimiter', () => {
    beforeEach(() => {
      // Set up a test login endpoint with rate limiting
      app.post('/api/auth/login', authRateLimiter, (req, res) => {
        // Simulate successful login
        res.status(200).json({ success: true });
      });
    });

    it('should allow requests under the rate limit', async () => {
      const email = 'test@example.com';

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'password123' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('should block requests after exceeding the rate limit', async () => {
      const email = 'blocked@example.com';

      // Make 5 requests - these should succeed
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'password123' });
      }

      // The 6th request should be blocked
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(response.body.error.message).toContain('Too many login attempts');
      expect(response.body.error.message).toContain(email);
    });

    it('should apply rate limiting per email address', async () => {
      const email1 = 'user1@example.com';
      const email2 = 'user2@example.com';

      // Make 5 requests for email1
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ email: email1, password: 'password123' });
        expect(response.status).toBe(200);
      }

      // 6th request for email1 should be blocked
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({ email: email1, password: 'password123' });
      expect(response1.status).toBe(429);

      // But email2 should still be able to make requests
      const response2 = await request(app)
        .post('/api/auth/login')
        .send({ email: email2, password: 'password123' });
      expect(response2.status).toBe(200);
    });

    it('should normalize email addresses for consistent rate limiting', async () => {
      const email = 'Test@Example.com';
      const normalizedEmail = 'test@example.com';

      // Make 3 requests with uppercase email
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: email.toUpperCase(), password: 'password123' });
      }

      // Make 2 requests with lowercase email
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: normalizedEmail, password: 'password123' });
      }

      // The 6th request should be blocked (regardless of case)
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: normalizedEmail, password: 'password123' });

      expect(response.status).toBe(429);
    });

    it('should handle requests without email by using IP address', async () => {
      // Make 5 requests without email
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ password: 'password123' });
        expect(response.status).toBe(200);
      }

      // 6th request should be blocked
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.error.message).not.toContain('@');
    });

    it('should include rate limit headers in responses', async () => {
      const email = 'headers@example.com';

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });
  });

  describe('registrationRateLimiter', () => {
    beforeEach(() => {
      // Set up a test registration endpoint with rate limiting
      app.post('/api/auth/register', registrationRateLimiter, (req, res) => {
        res.status(201).json({ success: true });
      });
    });

    it('should allow more attempts than login rate limiter', async () => {
      const email = 'newuser@example.com';

      // Make 10 requests - all should succeed (more lenient than login)
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ email, password: 'password123' });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      }
    });

    it('should block registration after exceeding the limit', async () => {
      const email = 'spammer@example.com';

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/auth/register')
          .send({ email, password: 'password123' });
      }

      // 11th request should be blocked
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email, password: 'password123' });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(response.body.error.message).toContain('registration');
    });

    it('should use different rate limit keys for registration vs login', async () => {
      // This test ensures registration and login limits are independent
      const email = 'independent@example.com';

      // Set up both endpoints
      app.post('/api/auth/login', authRateLimiter, (req, res) => {
        res.status(200).json({ success: true });
      });

      // Exhaust login rate limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'password123' });
      }

      // Login should be blocked
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });
      expect(loginResponse.status).toBe(429);

      // But registration should still work (different key prefix)
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({ email, password: 'password123' });
      expect(registerResponse.status).toBe(201);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      app.post('/api/auth/login', authRateLimiter, (req, res) => {
        res.status(200).json({ success: true });
      });
    });

    it('should handle empty email strings', async () => {
      // Make 5 requests with empty email
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: '', password: 'password123' });
      }

      // 6th request should be blocked (falls back to IP)
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: '', password: 'password123' });

      expect(response.status).toBe(429);
    });

    it('should handle non-string email values', async () => {
      // Make 5 requests with numeric "email"
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 12345, password: 'password123' });
      }

      // 6th request should be blocked (falls back to IP)
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 12345, password: 'password123' });

      expect(response.status).toBe(429);
    });

    it('should trim whitespace from email addresses', async () => {
      const email = '  test@example.com  ';
      const trimmedEmail = 'test@example.com';

      // Make requests with whitespace
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'password123' });
      }

      // Make requests with trimmed email
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: trimmedEmail, password: 'password123' });
      }

      // Should be treated as same email - 6th request blocked
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: trimmedEmail, password: 'password123' });

      expect(response.status).toBe(429);
    });
  });
});
