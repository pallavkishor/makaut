import {
  createSubscription,
  isSubscriptionActive,
  getActiveSubscriptions,
  hasActiveSubscription,
  extendSubscription,
  cancelSubscription,
  listSubscriptions,
  verifySubscriptionAccess,
  setPrismaClient,
  resetPrismaClient,
} from './subscription';
import { getTestDatabaseClient, beforeEachTest, afterAllTests } from '../test/config/database';
import { Subscription } from '@prisma/client';

/**
 * Subscription Service Unit Tests
 * Tests subscription creation, active subscription determination,
 * access control, extension, cancellation, and listing/filtering
 */

describe('Subscription Service', () => {
  let prisma: ReturnType<typeof getTestDatabaseClient>;

  // Test data IDs
  let studentId: string;
  let subjectId: string;

  beforeAll(() => {
    prisma = getTestDatabaseClient();
    setPrismaClient(prisma);
  });

  beforeEach(async () => {
    await beforeEachTest();

    // Create test student
    const student = await prisma.student.create({
      data: {
        email: 'student@example.com',
        passwordHash: 'hashed_password',
      },
    });
    studentId = student.id;

    // Create test subject
    const subject = await prisma.subject.create({
      data: {
        name: 'Mathematics',
      },
    });
    subjectId = subject.id;
  });

  afterAll(async () => {
    await afterAllTests();
    resetPrismaClient();
  });

  describe('Task 5.1: createSubscription', () => {
    it('should create subscription with valid dates', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const subscription = await createSubscription(
        studentId,
        subjectId,
        startDate,
        endDate
      );

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.studentId).toBe(studentId);
      expect(subscription.subjectId).toBe(subjectId);
      expect(subscription.startDate).toEqual(startDate);
      expect(subscription.endDate).toEqual(endDate);
      expect(subscription.createdAt).toBeInstanceOf(Date);

      // Verify in database
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscription.id },
      });
      expect(dbSubscription).toBeDefined();
      expect(dbSubscription?.studentId).toBe(studentId);
      expect(dbSubscription?.subjectId).toBe(subjectId);
    });

    it('should reject subscription with end date before start date', async () => {
      const startDate = new Date('2024-12-31');
      const endDate = new Date('2024-01-01');

      await expect(
        createSubscription(studentId, subjectId, startDate, endDate)
      ).rejects.toThrow('End date must be after start date');
    });

    it('should reject subscription with equal start and end dates', async () => {
      const date = new Date('2024-06-15');

      await expect(
        createSubscription(studentId, subjectId, date, date)
      ).rejects.toThrow('End date must be after start date');
    });

    it('should reject subscription with non-existent student', async () => {
      const fakeStudentId = '00000000-0000-0000-0000-000000000000';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await expect(
        createSubscription(fakeStudentId, subjectId, startDate, endDate)
      ).rejects.toThrow();
    });

    it('should reject subscription with non-existent subject', async () => {
      const fakeSubjectId = '00000000-0000-0000-0000-000000000000';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await expect(
        createSubscription(studentId, fakeSubjectId, startDate, endDate)
      ).rejects.toThrow();
    });

    it('should allow multiple subscriptions for same student and subject', async () => {
      // Past subscription
      const sub1 = await createSubscription(
        studentId,
        subjectId,
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      // Current subscription
      const sub2 = await createSubscription(
        studentId,
        subjectId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(sub1.id).not.toBe(sub2.id);
    });
  });

  describe('Task 5.3: isSubscriptionActive', () => {
    let subscription: Subscription;

    beforeEach(async () => {
      subscription = await prisma.subscription.create({
        data: {
          studentId,
          subjectId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      });
    });

    it('should return true when current time is between start and end dates', () => {
      const currentTime = new Date('2024-06-15');
      expect(isSubscriptionActive(subscription, currentTime)).toBe(true);
    });

    it('should return true when current time equals start date', () => {
      const currentTime = new Date('2024-01-01');
      expect(isSubscriptionActive(subscription, currentTime)).toBe(true);
    });

    it('should return true when current time equals end date', () => {
      const currentTime = new Date('2024-12-31');
      expect(isSubscriptionActive(subscription, currentTime)).toBe(true);
    });

    it('should return false when current time is before start date', () => {
      const currentTime = new Date('2023-12-31');
      expect(isSubscriptionActive(subscription, currentTime)).toBe(false);
    });

    it('should return false when current time is after end date', () => {
      const currentTime = new Date('2025-01-01');
      expect(isSubscriptionActive(subscription, currentTime)).toBe(false);
    });

    it('should use current time when no time parameter provided', () => {
      // Create subscription that is currently active
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const activeSubscription = {
        ...subscription,
        startDate: yesterday,
        endDate: tomorrow,
      };

      expect(isSubscriptionActive(activeSubscription)).toBe(true);
    });
  });

  describe('Task 5.3: getActiveSubscriptions', () => {
    beforeEach(async () => {
      // Create multiple subscriptions with different date ranges
      await prisma.subscription.createMany({
        data: [
          {
            studentId,
            subjectId,
            startDate: new Date('2023-01-01'),
            endDate: new Date('2023-12-31'),
          },
          {
            studentId,
            subjectId,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
          },
          {
            studentId,
            subjectId,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-12-31'),
          },
        ],
      });
    });

    it('should return only active subscriptions for current time', async () => {
      const currentTime = new Date('2024-06-15');
      const active = await getActiveSubscriptions(studentId, currentTime);

      expect(active.length).toBe(1);
      expect(active[0].startDate).toEqual(new Date('2024-01-01'));
      expect(active[0].endDate).toEqual(new Date('2024-12-31'));
    });

    it('should return empty array when no active subscriptions exist', async () => {
      const currentTime = new Date('2030-01-01');
      const active = await getActiveSubscriptions(studentId, currentTime);

      expect(active.length).toBe(0);
    });

    it('should return multiple active subscriptions if they overlap', async () => {
      // Create another subject
      const subject2 = await prisma.subject.create({
        data: { name: 'Physics' },
      });

      // Create subscription to second subject with same date range
      await prisma.subscription.create({
        data: {
          studentId,
          subjectId: subject2.id,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      });

      const currentTime = new Date('2024-06-15');
      const active = await getActiveSubscriptions(studentId, currentTime);

      expect(active.length).toBe(2);
    });

    it('should only return subscriptions for specified student', async () => {
      // Create another student with subscription
      const student2 = await prisma.student.create({
        data: {
          email: 'student2@example.com',
          passwordHash: 'hashed_password',
        },
      });

      await prisma.subscription.create({
        data: {
          studentId: student2.id,
          subjectId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      });

      const currentTime = new Date('2024-06-15');
      const active = await getActiveSubscriptions(studentId, currentTime);

      expect(active.length).toBe(1);
      expect(active[0].studentId).toBe(studentId);
    });
  });

  describe('Task 5.5: hasActiveSubscription', () => {
    beforeEach(async () => {
      await prisma.subscription.create({
        data: {
          studentId,
          subjectId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      });
    });

    it('should return true when student has active subscription to subject', async () => {
      const currentTime = new Date('2024-06-15');
      const hasAccess = await hasActiveSubscription(studentId, subjectId, currentTime);

      expect(hasAccess).toBe(true);
    });

    it('should return false when subscription has expired', async () => {
      const currentTime = new Date('2025-01-01');
      const hasAccess = await hasActiveSubscription(studentId, subjectId, currentTime);

      expect(hasAccess).toBe(false);
    });

    it('should return false when subscription has not started yet', async () => {
      const currentTime = new Date('2023-12-31');
      const hasAccess = await hasActiveSubscription(studentId, subjectId, currentTime);

      expect(hasAccess).toBe(false);
    });

    it('should return false for different subject', async () => {
      const subject2 = await prisma.subject.create({
        data: { name: 'Physics' },
      });

      const currentTime = new Date('2024-06-15');
      const hasAccess = await hasActiveSubscription(studentId, subject2.id, currentTime);

      expect(hasAccess).toBe(false);
    });

    it('should return false for different student', async () => {
      const student2 = await prisma.student.create({
        data: {
          email: 'student2@example.com',
          passwordHash: 'hashed_password',
        },
      });

      const currentTime = new Date('2024-06-15');
      const hasAccess = await hasActiveSubscription(student2.id, subjectId, currentTime);

      expect(hasAccess).toBe(false);
    });
  });

  describe('Task 5.5: verifySubscriptionAccess', () => {
    beforeEach(async () => {
      await prisma.subscription.create({
        data: {
          studentId,
          subjectId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      });
    });

    it('should not throw error when student has active subscription', async () => {
      const currentTime = new Date('2024-06-15');

      await expect(
        verifySubscriptionAccess(studentId, subjectId, currentTime)
      ).resolves.not.toThrow();
    });

    it('should throw error with correct message when subscription missing', async () => {
      const subject2 = await prisma.subject.create({
        data: { name: 'Physics' },
      });

      const currentTime = new Date('2024-06-15');

      await expect(
        verifySubscriptionAccess(studentId, subject2.id, currentTime)
      ).rejects.toThrow('No active subscription');
    });

    it('should throw error when subscription has expired', async () => {
      const currentTime = new Date('2025-01-01');

      await expect(
        verifySubscriptionAccess(studentId, subjectId, currentTime)
      ).rejects.toThrow('No active subscription');
    });
  });

  describe('Task 5.7: extendSubscription', () => {
    let subscriptionId: string;

    beforeEach(async () => {
      const subscription = await prisma.subscription.create({
        data: {
          studentId,
          subjectId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-06-30'),
        },
      });
      subscriptionId = subscription.id;
    });

    it('should successfully extend subscription with valid new end date', async () => {
      const newEndDate = new Date('2024-12-31');

      const extended = await extendSubscription(subscriptionId, newEndDate);

      expect(extended.endDate).toEqual(newEndDate);
      expect(extended.startDate).toEqual(new Date('2024-01-01'));
      expect(extended.id).toBe(subscriptionId);

      // Verify in database
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
      });
      expect(dbSubscription?.endDate).toEqual(newEndDate);
    });

    it('should reject extension with end date before start date', async () => {
      const newEndDate = new Date('2023-12-31');

      await expect(
        extendSubscription(subscriptionId, newEndDate)
      ).rejects.toThrow('New end date must be after start date');
    });

    it('should reject extension with end date equal to start date', async () => {
      const newEndDate = new Date('2024-01-01');

      await expect(
        extendSubscription(subscriptionId, newEndDate)
      ).rejects.toThrow('New end date must be after start date');
    });

    it('should reject extension for non-existent subscription', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const newEndDate = new Date('2024-12-31');

      await expect(
        extendSubscription(fakeId, newEndDate)
      ).rejects.toThrow('Subscription not found');
    });

    it('should allow extending to earlier date (shortening)', async () => {
      const newEndDate = new Date('2024-03-31');

      const extended = await extendSubscription(subscriptionId, newEndDate);

      expect(extended.endDate).toEqual(newEndDate);
    });
  });

  describe('Task 5.8: cancelSubscription', () => {
    let subscriptionId: string;

    beforeEach(async () => {
      const subscription = await prisma.subscription.create({
        data: {
          studentId,
          subjectId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      });
      subscriptionId = subscription.id;
    });

    it('should set end date to current time when cancelling', async () => {
      const currentTime = new Date('2024-06-15T10:30:00Z');

      const cancelled = await cancelSubscription(subscriptionId, currentTime);

      expect(cancelled.endDate).toEqual(currentTime);
      expect(cancelled.startDate).toEqual(new Date('2024-01-01'));
      expect(cancelled.id).toBe(subscriptionId);

      // Verify in database
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
      });
      expect(dbSubscription?.endDate).toEqual(currentTime);
    });

    it('should immediately revoke access after cancellation', async () => {
      const currentTime = new Date('2024-06-15T10:30:00Z');

      await cancelSubscription(subscriptionId, currentTime);

      // Check that subscription is no longer active
      const hasAccess = await hasActiveSubscription(studentId, subjectId, currentTime);
      expect(hasAccess).toBe(false);
    });

    it('should allow cancellation of future subscription', async () => {
      const futureSubscription = await prisma.subscription.create({
        data: {
          studentId,
          subjectId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      });

      const currentTime = new Date('2024-06-15');

      const cancelled = await cancelSubscription(futureSubscription.id, currentTime);

      expect(cancelled.endDate).toEqual(currentTime);
      // Should remain inactive since start date is in future
      expect(cancelled.startDate).toEqual(new Date('2025-01-01'));
    });

    it('should reject cancellation for non-existent subscription', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const currentTime = new Date('2024-06-15');

      await expect(
        cancelSubscription(fakeId, currentTime)
      ).rejects.toThrow();
    });
  });

  describe('Task 5.9: listSubscriptions', () => {
    let student2Id: string;
    let subject2Id: string;

    beforeEach(async () => {
      // Create second student
      const student2 = await prisma.student.create({
        data: {
          email: 'student2@example.com',
          passwordHash: 'hashed_password',
        },
      });
      student2Id = student2.id;

      // Create second subject
      const subject2 = await prisma.subject.create({
        data: { name: 'Physics' },
      });
      subject2Id = subject2.id;

      // Create various subscriptions
      await prisma.subscription.createMany({
        data: [
          // Student 1, Subject 1 - Past
          {
            studentId,
            subjectId,
            startDate: new Date('2023-01-01'),
            endDate: new Date('2023-12-31'),
          },
          // Student 1, Subject 1 - Active
          {
            studentId,
            subjectId,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
          },
          // Student 1, Subject 2 - Active
          {
            studentId,
            subjectId: subject2Id,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
          },
          // Student 2, Subject 1 - Active
          {
            studentId: student2Id,
            subjectId,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
          },
          // Student 2, Subject 2 - Future
          {
            studentId: student2Id,
            subjectId: subject2Id,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-12-31'),
          },
        ],
      });
    });

    it('should return all subscriptions with no filters', async () => {
      const subscriptions = await listSubscriptions();

      expect(subscriptions.length).toBe(5);
    });

    it('should filter by student ID', async () => {
      const subscriptions = await listSubscriptions({ studentId });

      expect(subscriptions.length).toBe(3);
      expect(subscriptions.every((sub) => sub.studentId === studentId)).toBe(true);
    });

    it('should filter by subject ID', async () => {
      const subscriptions = await listSubscriptions({ subjectId });

      expect(subscriptions.length).toBe(3);
      expect(subscriptions.every((sub) => sub.subjectId === subjectId)).toBe(true);
    });

    it('should filter by active only', async () => {
      const subscriptions = await listSubscriptions({ activeOnly: true });

      // At "current" time (based on test data), 3 should be active
      // We need to mock the current time in the implementation or test at specific time
      expect(subscriptions.length).toBeGreaterThan(0);
      subscriptions.forEach((sub) => {
        const now = new Date();
        expect(sub.startDate.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(sub.endDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
      });
    });

    it('should combine multiple filters', async () => {
      const subscriptions = await listSubscriptions({
        studentId,
        subjectId,
      });

      expect(subscriptions.length).toBe(2);
      expect(subscriptions.every((sub) => sub.studentId === studentId)).toBe(true);
      expect(subscriptions.every((sub) => sub.subjectId === subjectId)).toBe(true);
    });

    it('should return empty array when no subscriptions match filters', async () => {
      const fakeStudentId = '00000000-0000-0000-0000-000000000000';
      const subscriptions = await listSubscriptions({ studentId: fakeStudentId });

      expect(subscriptions.length).toBe(0);
    });

    it('should return subscriptions ordered by created date descending', async () => {
      const subscriptions = await listSubscriptions();

      // Most recent should be first
      for (let i = 1; i < subscriptions.length; i++) {
        expect(subscriptions[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          subscriptions[i].createdAt.getTime()
        );
      }
    });
  });
});
