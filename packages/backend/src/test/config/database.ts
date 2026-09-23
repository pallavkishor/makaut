/**
 * Test database configuration
 * Provides utilities for managing test database connections and cleanup
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

/**
 * Get or create a Prisma client instance for testing
 * Uses a separate test database URL if provided
 */
export function getTestDatabaseClient(): PrismaClient {
  if (!prisma) {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for testing');
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: process.env.DEBUG_SQL === 'true' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  return prisma;
}

/**
 * Clean up all test data from the database
 * Deletes records in reverse order of dependencies
 */
export async function cleanupTestDatabase(): Promise<void> {
  const client = getTestDatabaseClient();

  try {
    // Delete in order to respect foreign key constraints
    await client.session.deleteMany({});
    await client.subscription.deleteMany({});
    await client.note.deleteMany({});
    await client.subject.deleteMany({});
    await client.registeredDevice.deleteMany({});
    await client.student.deleteMany({});
    await client.administrator.deleteMany({});
  } catch (error) {
    console.error('Error cleaning up test database:', error);
    throw error;
  }
}

/**
 * Disconnect from the test database
 * Should be called after all tests complete
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

/**
 * Setup function to run before each test
 * Cleans the database to ensure test isolation
 */
export async function beforeEachTest(): Promise<void> {
  await cleanupTestDatabase();
}

/**
 * Teardown function to run after all tests
 * Disconnects from the database
 */
export async function afterAllTests(): Promise<void> {
  await cleanupTestDatabase();
  await disconnectTestDatabase();
}
