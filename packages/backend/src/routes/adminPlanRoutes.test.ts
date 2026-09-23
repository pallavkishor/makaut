import request from 'supertest';
import express, { Express } from 'express';
import { BillingInterval } from '@prisma/client';
import { errorHandler } from '../middleware/errorHandler';
import { generateAdminToken, generateStudentToken } from '../utils/jwt';
import adminPlanRoutes from './adminPlanRoutes';

/**
 * Admin subscription plan route tests.
 *
 * The router is the unit under test: authorization, request validation, and the
 * translation of the plan service's refusals into the right status codes - in
 * particular that a duplicate code is a 409 with an explanation rather than a
 * unique-constraint 500, and that a plan in use is never hard-deleted.
 *
 * The database-touching plan helpers are substituted; the real validators and
 * error classes are kept, so the assertions are about real behaviour.
 *
 * Requirements: 5.4, 8.1, 8.2, 8.6, 8.7
 */

jest.mock('../services/session');

jest.mock('../services/plan', () => {
  const actual = jest.requireActual('../services/plan');

  return {
    ...actual,
    listPlansPaginated: jest.fn(),
    createPlan: jest.fn(),
    getPlan: jest.fn(),
    updatePlan: jest.fn(),
    deactivatePlan: jest.fn(),
    deletePlan: jest.fn(),
    countPlanSubscriptions: jest.fn(),
  };
});

import * as sessionService from '../services/session';
import {
  countPlanSubscriptions,
  createPlan,
  deactivatePlan,
  deletePlan,
  getPlan,
  listPlansPaginated,
  updatePlan,
  PlanCodeConflictError,
  PlanInUseError,
  PlanNotFoundError,
  type PlanData,
} from './../services/plan';

const sessions = sessionService as jest.Mocked<typeof sessionService>;

const mocked = {
  listPlansPaginated: listPlansPaginated as jest.Mock,
  createPlan: createPlan as jest.Mock,
  getPlan: getPlan as jest.Mock,
  updatePlan: updatePlan as jest.Mock,
  deactivatePlan: deactivatePlan as jest.Mock,
  deletePlan: deletePlan as jest.Mock,
  countPlanSubscriptions: countPlanSubscriptions as jest.Mock,
};

const UUID = '3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90';
const ADMIN_TOKEN = generateAdminToken(UUID, 'admin@example.com');
const STUDENT_TOKEN = generateStudentToken(UUID, 'student@example.com');

const timestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

const PLAN: PlanData = {
  id: UUID,
  name: 'Yearly',
  code: 'YEARLY',
  billingInterval: BillingInterval.YEARLY,
  priceAmount: 99900,
  currency: 'INR',
  durationDays: 365,
  isActive: true,
  razorpayPlanId: null,
  ...timestamps,
};

const VALID_BODY = {
  name: 'Yearly',
  code: 'YEARLY',
  billingInterval: 'YEARLY',
  priceAmount: 99900,
  durationDays: 365,
};

function buildApp(): Express {
  const app = express();

  app.use(express.json());
  app.use('/api/admin/plans', adminPlanRoutes);
  app.use(errorHandler);

  return app;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

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

function asAdmin(app: Express, method: HttpMethod, path: string): request.Test {
  return call(app, method, path).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
}

const routes: Array<[HttpMethod, string]> = [
  ['get', '/api/admin/plans'],
  ['post', '/api/admin/plans'],
  ['get', `/api/admin/plans/${UUID}`],
  ['put', `/api/admin/plans/${UUID}`],
  ['delete', `/api/admin/plans/${UUID}`],
];

describe('Admin plan API routes', () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
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

    mocked.listPlansPaginated.mockResolvedValue({ plans: [PLAN], total: 1 });
    mocked.createPlan.mockResolvedValue(PLAN);
    mocked.getPlan.mockResolvedValue(PLAN);
    mocked.updatePlan.mockResolvedValue(PLAN);
    mocked.deactivatePlan.mockResolvedValue({ ...PLAN, isActive: false });
    mocked.deletePlan.mockResolvedValue(undefined);
    mocked.countPlanSubscriptions.mockResolvedValue(0);
  });

  describe('Authorization', () => {
    it.each(routes)('rejects %s %s without a token', async (method, path) => {
      const response = await call(app, method, path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it.each(routes)('rejects %s %s with a student token', async (method, path) => {
      const response = await call(app, method, path).set(
        'Authorization',
        `Bearer ${STUDENT_TOKEN}`
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a valid admin token whose session is gone', async () => {
      sessions.getSessionByToken.mockResolvedValue(null);

      const response = await asAdmin(app, 'get', '/api/admin/plans');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/plans', () => {
    it('paginates and reports the window', async () => {
      mocked.listPlansPaginated.mockResolvedValue({ plans: [PLAN], total: 12 });

      const response = await asAdmin(
        app,
        'get',
        '/api/admin/plans?page=2&pageSize=5'
      );

      expect(response.status).toBe(200);
      expect(mocked.listPlansPaginated).toHaveBeenCalledWith({
        activeOnly: false,
        skip: 5,
        take: 5,
      });
      expect(response.body.pagination).toEqual({
        page: 2,
        pageSize: 5,
        total: 12,
        totalPages: 3,
      });
    });

    it('passes activeOnly through', async () => {
      await asAdmin(app, 'get', '/api/admin/plans?activeOnly=true');

      expect(mocked.listPlansPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ activeOnly: true })
      );
    });

    it('returns the price as an integer in minor units', async () => {
      const response = await asAdmin(app, 'get', '/api/admin/plans');

      expect(response.body.plans[0].priceAmount).toBe(99900);
      expect(response.body.plans[0].currency).toBe('INR');
    });
  });

  describe('POST /api/admin/plans', () => {
    it('creates a plan', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send(
        VALID_BODY
      );

      expect(response.status).toBe(201);
      expect(response.body.plan.code).toBe('YEARLY');
      expect(mocked.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'YEARLY',
          billingInterval: 'YEARLY',
          priceAmount: 99900,
          durationDays: 365,
        })
      );
    });

    it('accepts a free plan priced at zero', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send({
        ...VALID_BODY,
        priceAmount: 0,
      });

      expect(response.status).toBe(201);
    });

    it('rejects a negative price', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send({
        ...VALID_BODY,
        priceAmount: -1,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toMatchObject({ field: 'priceAmount' });
      expect(mocked.createPlan).not.toHaveBeenCalled();
    });

    it('rejects a fractional price', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send({
        ...VALID_BODY,
        priceAmount: 99.5,
      });

      expect(response.status).toBe(400);
      expect(mocked.createPlan).not.toHaveBeenCalled();
    });

    it('rejects a duration below one day', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send({
        ...VALID_BODY,
        durationDays: 0,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'durationDays' });
      expect(mocked.createPlan).not.toHaveBeenCalled();
    });

    it('rejects an unknown billing interval', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send({
        ...VALID_BODY,
        billingInterval: 'WEEKLY',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({
        field: 'billingInterval',
      });
    });

    it('requires a code', async () => {
      const { code: _code, ...withoutCode } = VALID_BODY;

      const response = await asAdmin(app, 'post', '/api/admin/plans').send(
        withoutCode
      );

      expect(response.status).toBe(400);
      expect(response.body.error.details).toMatchObject({ field: 'code' });
    });

    it('answers a duplicate code with 409 and an explanation', async () => {
      mocked.createPlan.mockRejectedValue(
        new PlanCodeConflictError('code', 'YEARLY')
      );

      const response = await asAdmin(app, 'post', '/api/admin/plans').send(
        VALID_BODY
      );

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/code "YEARLY"/);
      expect(response.body.error.message).toMatch(/unique/i);
      expect(response.body.error.details).toMatchObject({ field: 'code' });
    });

    it('leaves razorpayPlanId optional', async () => {
      const response = await asAdmin(app, 'post', '/api/admin/plans').send(
        VALID_BODY
      );

      expect(response.status).toBe(201);
      expect(mocked.createPlan.mock.calls[0][0]).not.toHaveProperty(
        'razorpayPlanId'
      );
    });

    it('accepts a razorpayPlanId when one is supplied', async () => {
      await asAdmin(app, 'post', '/api/admin/plans').send({
        ...VALID_BODY,
        razorpayPlanId: 'plan_ABC123',
      });

      expect(mocked.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ razorpayPlanId: 'plan_ABC123' })
      );
    });
  });

  describe('GET /api/admin/plans/:id', () => {
    it('includes the subscription count that decides deletability', async () => {
      mocked.countPlanSubscriptions.mockResolvedValue(5);

      const response = await asAdmin(app, 'get', `/api/admin/plans/${UUID}`);

      expect(response.status).toBe(200);
      expect(response.body.plan.subscriptionCount).toBe(5);
    });

    it('returns 404 for a plan that does not exist', async () => {
      mocked.getPlan.mockResolvedValue(null);

      const response = await asAdmin(app, 'get', `/api/admin/plans/${UUID}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects a non-UUID id', async () => {
      const response = await asAdmin(app, 'get', '/api/admin/plans/not-a-uuid');

      expect(response.status).toBe(400);
      expect(mocked.getPlan).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/admin/plans/:id', () => {
    it('updates only the supplied fields', async () => {
      const response = await asAdmin(app, 'put', `/api/admin/plans/${UUID}`).send({
        priceAmount: 120000,
      });

      expect(response.status).toBe(200);
      expect(mocked.updatePlan).toHaveBeenCalledWith(UUID, {
        priceAmount: 120000,
      });
    });

    it('reactivates a plan through isActive', async () => {
      await asAdmin(app, 'put', `/api/admin/plans/${UUID}`).send({
        isActive: true,
      });

      expect(mocked.updatePlan).toHaveBeenCalledWith(UUID, { isActive: true });
    });

    it('rejects an empty update', async () => {
      const response = await asAdmin(app, 'put', `/api/admin/plans/${UUID}`).send(
        {}
      );

      expect(response.status).toBe(400);
      expect(mocked.updatePlan).not.toHaveBeenCalled();
    });

    it('rejects an invalid price', async () => {
      const response = await asAdmin(app, 'put', `/api/admin/plans/${UUID}`).send({
        priceAmount: -1,
      });

      expect(response.status).toBe(400);
      expect(mocked.updatePlan).not.toHaveBeenCalled();
    });

    it('answers a duplicate code with 409', async () => {
      mocked.updatePlan.mockRejectedValue(
        new PlanCodeConflictError('code', 'MONTHLY')
      );

      const response = await asAdmin(app, 'put', `/api/admin/plans/${UUID}`).send({
        code: 'MONTHLY',
      });

      expect(response.status).toBe(409);
      expect(response.body.error.details).toMatchObject({ field: 'code' });
    });

    it('answers a missing plan with 404', async () => {
      mocked.updatePlan.mockRejectedValue(new PlanNotFoundError());

      const response = await asAdmin(app, 'put', `/api/admin/plans/${UUID}`).send({
        isActive: false,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/plans/:id', () => {
    it('deactivates rather than deleting by default', async () => {
      const response = await asAdmin(app, 'delete', `/api/admin/plans/${UUID}`);

      expect(response.status).toBe(200);
      expect(mocked.deactivatePlan).toHaveBeenCalledWith(UUID);
      expect(mocked.deletePlan).not.toHaveBeenCalled();
      expect(response.body.plan.isActive).toBe(false);
      expect(response.body.message).toMatch(/deactivated/i);
    });

    it('hard-deletes a plan nothing references when asked', async () => {
      const response = await asAdmin(
        app,
        'delete',
        `/api/admin/plans/${UUID}?hard=true`
      );

      expect(response.status).toBe(200);
      expect(mocked.deletePlan).toHaveBeenCalledWith(UUID);
      expect(mocked.deactivatePlan).not.toHaveBeenCalled();
    });

    it('refuses a hard delete of a plan in use with 409 and points at deactivation', async () => {
      mocked.deletePlan.mockRejectedValue(new PlanInUseError(3));

      const response = await asAdmin(
        app,
        'delete',
        `/api/admin/plans/${UUID}?hard=true`
      );

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/3 existing subscription/);
      expect(response.body.error.message).toMatch(/deactivate/i);
      expect(response.body.error.details).toMatchObject({
        subscriptionCount: 3,
        resolution: 'deactivate',
      });
    });

    it('answers a missing plan with 404', async () => {
      mocked.deactivatePlan.mockRejectedValue(new PlanNotFoundError());

      const response = await asAdmin(app, 'delete', `/api/admin/plans/${UUID}`);

      expect(response.status).toBe(404);
    });
  });
});
