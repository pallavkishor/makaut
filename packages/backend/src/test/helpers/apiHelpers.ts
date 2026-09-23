/**
 * API testing helpers using supertest
 */

import request from 'supertest';
import { Express } from 'express';

/**
 * Helper to make authenticated API requests
 */
export class ApiTestHelper {
  private app: Express;
  private token?: string;

  constructor(app: Express, token?: string) {
    this.app = app;
    this.token = token;
  }

  /**
   * Set the authentication token for subsequent requests
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Make a GET request with optional authentication
   */
  async get(url: string, authenticated: boolean = true) {
    const req = request(this.app).get(url);
    
    if (authenticated && this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }
    
    return req;
  }

  /**
   * Make a POST request with optional authentication
   */
  async post(url: string, body?: any, authenticated: boolean = true) {
    const req = request(this.app).post(url).send(body);
    
    if (authenticated && this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }
    
    return req;
  }

  /**
   * Make a PUT request with optional authentication
   */
  async put(url: string, body?: any, authenticated: boolean = true) {
    const req = request(this.app).put(url).send(body);
    
    if (authenticated && this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }
    
    return req;
  }

  /**
   * Make a DELETE request with optional authentication
   */
  async delete(url: string, authenticated: boolean = true) {
    const req = request(this.app).delete(url);
    
    if (authenticated && this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }
    
    return req;
  }

  /**
   * Register a student and return the auth token
   */
  async registerStudent(email: string, password: string): Promise<string> {
    const response = await request(this.app)
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    
    const token = response.body?.session?.token;
    if (typeof token !== 'string') {
      throw new Error('Expected session token in response body');
    }
    this.token = token;
    return token;
  }

  /**
   * Login as a student and return the auth token
   */
  async loginStudent(email: string, password: string): Promise<string> {
    const response = await request(this.app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    
    const token = response.body?.session?.token;
    if (typeof token !== 'string') {
      throw new Error('Expected session token in response body');
    }
    this.token = token;
    return token;
  }

  /**
   * Login as an admin and return the auth token
   */
  async loginAdmin(email: string, password: string): Promise<string> {
    const response = await request(this.app)
      .post('/api/admin/auth/login')
      .send({ email, password })
      .expect(200);
    
    const token = response.body?.session?.token;
    if (typeof token !== 'string') {
      throw new Error('Expected session token in response body');
    }
    this.token = token;
    return token;
  }
}

/**
 * Create a new API test helper instance
 */
export function createApiHelper(app: Express, token?: string): ApiTestHelper {
  return new ApiTestHelper(app, token);
}
