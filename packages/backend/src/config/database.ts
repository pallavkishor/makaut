import { PrismaClient } from '@prisma/client';

/**
 * Global Prisma Client instance for database operations
 * Follows the singleton pattern to prevent multiple instances
 */

let prisma: PrismaClient | null = null;

/**
 * Gets or creates the Prisma Client instance
 * @returns PrismaClient instance
 */
export function getDatabaseClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

/**
 * Disconnects the Prisma Client
 * Should be called on application shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
