import { BillingInterval, PrismaClient } from '@prisma/client';
import {
  countPlanSubscriptions,
  createPlan,
  deactivatePlan,
  deletePlan,
  listPlansPaginated,
  updatePlan,
  validatePlanInput,
  PlanCodeConflictError,
  PlanInUseError,
  PlanNotFoundError,
  PlanValidationError,
  setPrismaClient,
  resetPrismaClient,
  type PlanData,
} from './plan';

/**
 * Subscription plan service tests.
 *
 * `validatePlanInput` is pure, so its rules are exercised directly. The write
 * helpers are exercised against a stub client that stands in for the database
 * and records what the service asked of it, which is what makes the two
 * invariants assertable: a duplicate code never reaches the insert, and a plan
 * with subscriptions is never handed to `delete`.
 */

const PLAN_ID = '3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90';
const OTHER_PLAN_ID = '9c4d1b2e-7a6f-4e3d-8b51-1f2a3c4d5e6f';

const timestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

function plan(overrides: Partial<PlanData> = {}): PlanData {
  return {
    id: PLAN_ID,
    name: 'Yearly',
    code: 'YEARLY',
    billingInterval: BillingInterval.YEARLY,
    priceAmount: 99900,
    currency: 'INR',
    durationDays: 365,
    isActive: true,
    razorpayPlanId: null,
    ...timestamps,
    ...overrides,
  };
}

interface Stub {
  client: PrismaClient;
  planFindUnique: jest.Mock;
  planFindMany: jest.Mock;
  planCount: jest.Mock;
  planCreate: jest.Mock;
  planUpdate: jest.Mock;
  planDelete: jest.Mock;
  subscriptionCount: jest.Mock;
}

/** A stand-in Prisma client: only the calls the plan service makes. */
function stubClient(): Stub {
  const planFindUnique = jest.fn().mockResolvedValue(null);
  const planFindMany = jest.fn().mockResolvedValue([]);
  const planCount = jest.fn().mockResolvedValue(0);
  const planCreate = jest.fn().mockImplementation(async ({ data }) => plan(data));
  const planUpdate = jest.fn().mockImplementation(async ({ data }) => plan(data));
  const planDelete = jest.fn().mockResolvedValue(plan());
  const subscriptionCount = jest.fn().mockResolvedValue(0);

  return {
    planFindUnique,
    planFindMany,
    planCount,
    planCreate,
    planUpdate,
    planDelete,
    subscriptionCount,
    client: {
      subscriptionPlan: {
        findUnique: planFindUnique,
        findMany: planFindMany,
        count: planCount,
        create: planCreate,
        update: planUpdate,
        delete: planDelete,
      },
      subscription: {
        count: subscriptionCount,
      },
    } as unknown as PrismaClient,
  };
}

/** Builds the error object Prisma raises, as the service sees it. */
function prismaError(code: string, target?: string[]): Error & { code: string } {
  const error = new Error(`Prisma error ${code}`) as Error & {
    code: string;
    meta?: { target?: string[] };
  };
  error.code = code;

  if (target) {
    error.meta = { target };
  }

  return error;
}

const validInput = {
  name: 'Yearly',
  code: 'YEARLY',
  billingInterval: BillingInterval.YEARLY,
  priceAmount: 99900,
  durationDays: 365,
};

describe('Plan service', () => {
  let stub: Stub;

  beforeEach(() => {
    stub = stubClient();
    setPrismaClient(stub.client);
  });

  afterEach(() => {
    resetPrismaClient();
  });

  describe('validatePlanInput', () => {
    it('accepts a complete, valid plan', () => {
      expect(validatePlanInput(validInput)).toBeNull();
    });

    it('accepts a free plan priced at zero', () => {
      expect(validatePlanInput({ priceAmount: 0 })).toBeNull();
    });

    it('rejects a negative price', () => {
      expect(validatePlanInput({ priceAmount: -1 })).toMatchObject({
        field: 'priceAmount',
      });
    });

    it('rejects a fractional price, because minor units are integers', () => {
      expect(validatePlanInput({ priceAmount: 999.5 })).toMatchObject({
        field: 'priceAmount',
      });
    });

    it('rejects a duration below one day', () => {
      expect(validatePlanInput({ durationDays: 0 })).toMatchObject({
        field: 'durationDays',
      });
      expect(validatePlanInput({ durationDays: -30 })).toMatchObject({
        field: 'durationDays',
      });
    });

    it('accepts a one-day duration', () => {
      expect(validatePlanInput({ durationDays: 1 })).toBeNull();
    });

    it('rejects a currency that is not a 3-letter code', () => {
      expect(validatePlanInput({ currency: 'RUPEE' })).toMatchObject({
        field: 'currency',
      });
    });

    it('rejects an unknown billing interval', () => {
      expect(
        validatePlanInput({
          billingInterval: 'WEEKLY' as unknown as BillingInterval,
        })
      ).toMatchObject({ field: 'billingInterval' });
    });

    it('rejects a blank name or code', () => {
      expect(validatePlanInput({ name: '   ' })).toMatchObject({ field: 'name' });
      expect(validatePlanInput({ code: '' })).toMatchObject({ field: 'code' });
    });

    it('ignores fields an update does not touch', () => {
      expect(validatePlanInput({ isActive: false })).toBeNull();
    });
  });

  describe('createPlan', () => {
    it('stores a valid plan, trimming the code and upper-casing the currency', async () => {
      await createPlan({ ...validInput, code: '  yearly-2025 ', currency: 'inr' });

      expect(stub.planCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'yearly-2025',
          currency: 'INR',
          priceAmount: 99900,
          durationDays: 365,
        }),
      });
    });

    it('leaves currency to the column default when it is not supplied', async () => {
      await createPlan(validInput);

      expect(stub.planCreate.mock.calls[0][0].data).not.toHaveProperty('currency');
    });

    it('accepts an optional razorpayPlanId', async () => {
      await createPlan({ ...validInput, razorpayPlanId: 'plan_ABC123' });

      expect(stub.planCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ razorpayPlanId: 'plan_ABC123' }),
      });
    });

    it('refuses a negative price before touching the database', async () => {
      await expect(
        createPlan({ ...validInput, priceAmount: -100 })
      ).rejects.toBeInstanceOf(PlanValidationError);

      expect(stub.planCreate).not.toHaveBeenCalled();
    });

    it('refuses a duration below one day before touching the database', async () => {
      await expect(
        createPlan({ ...validInput, durationDays: 0 })
      ).rejects.toBeInstanceOf(PlanValidationError);

      expect(stub.planCreate).not.toHaveBeenCalled();
    });

    it('reports a duplicate code as a conflict instead of inserting', async () => {
      stub.planFindUnique.mockResolvedValue(plan({ code: 'YEARLY' }));

      await expect(createPlan(validInput)).rejects.toBeInstanceOf(
        PlanCodeConflictError
      );
      expect(stub.planCreate).not.toHaveBeenCalled();
    });

    it('explains the duplicate code in the error message', async () => {
      stub.planFindUnique.mockResolvedValue(plan({ code: 'YEARLY' }));

      await expect(createPlan(validInput)).rejects.toThrow(/code "YEARLY"/);
      await expect(createPlan(validInput)).rejects.toThrow(/must be unique/i);
    });

    it('translates a unique violation raised by the insert itself', async () => {
      // The race: nothing found by the pre-check, the constraint fires anyway
      stub.planCreate.mockRejectedValue(prismaError('P2002', ['code']));

      const error = await createPlan(validInput).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanCodeConflictError);
      expect((error as PlanCodeConflictError).field).toBe('code');
    });

    it('attributes a razorpay unique violation to razorpayPlanId', async () => {
      stub.planCreate.mockRejectedValue(
        prismaError('P2002', ['razorpay_plan_id'])
      );

      const error = await createPlan({
        ...validInput,
        razorpayPlanId: 'plan_ABC123',
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanCodeConflictError);
      expect((error as PlanCodeConflictError).field).toBe('razorpayPlanId');
    });

    it('lets an unrecognized database failure through untouched', async () => {
      stub.planCreate.mockRejectedValue(prismaError('P1001'));

      await expect(createPlan(validInput)).rejects.toThrow('Prisma error P1001');
    });
  });

  describe('updatePlan', () => {
    it('touches only the supplied fields', async () => {
      await updatePlan(PLAN_ID, { priceAmount: 120000 });

      expect(stub.planUpdate).toHaveBeenCalledWith({
        where: { id: PLAN_ID },
        data: { priceAmount: 120000 },
      });
    });

    it('unlinks the Razorpay plan when razorpayPlanId is explicitly null', async () => {
      await updatePlan(PLAN_ID, { razorpayPlanId: null });

      expect(stub.planUpdate).toHaveBeenCalledWith({
        where: { id: PLAN_ID },
        data: { razorpayPlanId: null },
      });
    });

    it('rejects a code already held by another plan', async () => {
      stub.planFindUnique.mockResolvedValue(plan({ id: OTHER_PLAN_ID }));

      await expect(updatePlan(PLAN_ID, { code: 'YEARLY' })).rejects.toBeInstanceOf(
        PlanCodeConflictError
      );
      expect(stub.planUpdate).not.toHaveBeenCalled();
    });

    it('allows a plan to keep its own code', async () => {
      stub.planFindUnique.mockResolvedValue(plan({ id: PLAN_ID }));

      await updatePlan(PLAN_ID, { code: 'YEARLY' });

      expect(stub.planUpdate).toHaveBeenCalled();
    });

    it('rejects an invalid price without writing', async () => {
      await expect(
        updatePlan(PLAN_ID, { priceAmount: -5 })
      ).rejects.toBeInstanceOf(PlanValidationError);

      expect(stub.planUpdate).not.toHaveBeenCalled();
    });

    it('reports a missing plan as not found', async () => {
      stub.planUpdate.mockRejectedValue(prismaError('P2025'));

      await expect(updatePlan(PLAN_ID, { isActive: true })).rejects.toBeInstanceOf(
        PlanNotFoundError
      );
    });
  });

  describe('deactivatePlan', () => {
    it('clears isActive rather than removing anything', async () => {
      await deactivatePlan(PLAN_ID);

      expect(stub.planUpdate).toHaveBeenCalledWith({
        where: { id: PLAN_ID },
        data: { isActive: false },
      });
      expect(stub.planDelete).not.toHaveBeenCalled();
    });

    it('reports a missing plan as not found', async () => {
      stub.planUpdate.mockRejectedValue(prismaError('P2025'));

      await expect(deactivatePlan(PLAN_ID)).rejects.toBeInstanceOf(
        PlanNotFoundError
      );
    });
  });

  describe('deletePlan', () => {
    it('refuses to delete a plan that has subscriptions', async () => {
      stub.subscriptionCount.mockResolvedValue(3);

      const error = await deletePlan(PLAN_ID).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanInUseError);
      expect((error as PlanInUseError).subscriptionCount).toBe(3);
      expect(stub.planDelete).not.toHaveBeenCalled();
    });

    it('points the caller at deactivation in the refusal message', async () => {
      stub.subscriptionCount.mockResolvedValue(1);

      await expect(deletePlan(PLAN_ID)).rejects.toThrow(/deactivate/i);
    });

    it('deletes a plan nothing references', async () => {
      stub.subscriptionCount.mockResolvedValue(0);

      await deletePlan(PLAN_ID);

      expect(stub.planDelete).toHaveBeenCalledWith({ where: { id: PLAN_ID } });
    });

    it('translates the database restriction when a subscription appears mid-flight', async () => {
      stub.subscriptionCount.mockResolvedValue(0);
      stub.planDelete.mockRejectedValue(prismaError('P2003'));

      await expect(deletePlan(PLAN_ID)).rejects.toBeInstanceOf(PlanInUseError);
    });

    it('reports a missing plan as not found', async () => {
      stub.planDelete.mockRejectedValue(prismaError('P2025'));

      await expect(deletePlan(PLAN_ID)).rejects.toBeInstanceOf(PlanNotFoundError);
    });
  });

  describe('listPlansPaginated', () => {
    it('passes the window through and filters to active plans on request', async () => {
      stub.planFindMany.mockResolvedValue([plan()]);
      stub.planCount.mockResolvedValue(7);

      const result = await listPlansPaginated({
        activeOnly: true,
        skip: 20,
        take: 10,
      });

      expect(stub.planFindMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        skip: 20,
        take: 10,
      });
      expect(stub.planCount).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(result.total).toBe(7);
    });

    it('lists inactive plans too by default, so admins can see retired plans', async () => {
      await listPlansPaginated();

      expect(stub.planFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe('countPlanSubscriptions', () => {
    it('counts every subscription against the plan, whatever its status', async () => {
      stub.subscriptionCount.mockResolvedValue(4);

      await expect(countPlanSubscriptions(PLAN_ID)).resolves.toBe(4);
      expect(stub.subscriptionCount).toHaveBeenCalledWith({
        where: { planId: PLAN_ID },
      });
    });
  });
});
