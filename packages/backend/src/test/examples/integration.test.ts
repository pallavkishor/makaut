/**
 * Example integration test
 * Demonstrates API testing with supertest
 * 
 * Note: This test is a template and will need to be updated
 * once the Express app is implemented.
 * 
 * **Validates: Requirements 10.8**
 */

import request from 'supertest';
import { Express } from 'express';
import { generateTestEmail, generateTestPassword } from '../helpers';

/**
 * This is a template for integration tests.
 * Uncomment and update once the Express app is available.
 */
describe.skip('Integration Test Example (Template)', () => {
  let app: Express;

  beforeAll(() => {
    // Initialize Express app
    // app = createApp();
  });

  describe('Authentication API', () => {
    it('should register a new student with valid credentials', async () => {
      const email = generateTestEmail();
      const password = generateTestPassword();

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('student');
      expect(response.body.student).toHaveProperty('id');
      expect(response.body.student.email).toBe(email);
      expect(response.body).toHaveProperty('session');
      expect(response.body.session).toHaveProperty('token');
    });

    it('should reject registration with duplicate email', async () => {
      const email = generateTestEmail();
      const password = generateTestPassword();

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with invalid email', async () => {
      const password = generateTestPassword();

      const invalidEmails = ['notanemail', '@example.com', 'test@'];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ email, password })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject registration with short password', async () => {
      const email = generateTestEmail();
      const password = '1234567'; // 7 characters - too short

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should login with valid credentials', async () => {
      const email = generateTestEmail();
      const password = generateTestPassword();

      // Register first
      await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);

      // Login
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);

      expect(response.body).toHaveProperty('session');
      expect(response.body.session).toHaveProperty('token');
    });

    it('should reject login with invalid credentials', async () => {
      const email = generateTestEmail();
      const password = generateTestPassword();

      // Register
      await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);

      // Login with wrong password
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  describe('Protected Routes', () => {
    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/students/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept requests with valid token', async () => {
      const email = generateTestEmail();
      const password = generateTestPassword();

      // Register and get token
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);

      const token = registerResponse.body.session.token;

      // Access protected route
      const response = await request(app)
        .get('/api/students/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('student');
      expect(response.body.student.email).toBe(email);
    });
  });
});

/**
 * Helper function to demonstrate database test setup
 */
describe('Database Test Setup Example', () => {
  // This demonstrates how to use database helpers in integration tests
  
  it('should demonstrate database cleanup', async () => {
    // Import database helpers
    // const { getTestDatabaseClient, cleanupTestDatabase } = require('../config/database');
    
    // Get database client
    // const db = getTestDatabaseClient();
    
    // Create test data
    // await db.student.create({ data: { email: 'test@example.com', passwordHash: 'hash' } });
    
    // Clean up
    // await cleanupTestDatabase();
    
    // Verify cleanup
    // const count = await db.student.count();
    // expect(count).toBe(0);
    
    expect(true).toBe(true); // Placeholder
  });
});
