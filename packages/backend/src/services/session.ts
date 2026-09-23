import { PrismaClient } from '@prisma/client';
import { getDatabaseClient } from '../config/database';

/**
 * Session Service
 * Persists issued session tokens so that sessions can be terminated
 * server-side (logout, device revocation) and validated on each request.
 *
 * Requirements: 1.6 (session creation), 2.8 (session termination on device
 * revocation - enforced via cascading delete on registered_devices)
 */

// Allow injecting a Prisma client for testing
let prismaClientOverride: PrismaClient | null = null;

export function setPrismaClient(client: PrismaClient): void {
  prismaClientOverride = client;
}

export function resetPrismaClient(): void {
  prismaClientOverride = null;
}

function getPrisma(): PrismaClient {
  return prismaClientOverride || getDatabaseClient();
}

export type SessionUserType = 'student' | 'admin';

export interface SessionRecord {
  id: string;
  userId: string;
  userType: string;
  token: string;
  deviceId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  userType: SessionUserType;
  token: string;
  expiresAt: Date;
  deviceId?: string | null;
}

/**
 * Creates (or refreshes) a persisted session for an issued token.
 * Uses an upsert because identical JWT payloads issued within the same second
 * produce identical tokens.
 *
 * @param input - Session data
 * @returns Promise resolving to the stored session
 */
export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const prisma = getPrisma();

  const session = await prisma.session.upsert({
    where: { token: input.token },
    update: {
      deviceId: input.deviceId ?? null,
      expiresAt: input.expiresAt,
    },
    create: {
      userId: input.userId,
      userType: input.userType,
      token: input.token,
      deviceId: input.deviceId ?? null,
      expiresAt: input.expiresAt,
    },
  });

  return session;
}

/**
 * Looks up a persisted session by its token.
 *
 * @param token - Session token
 * @returns Promise resolving to the session, or null when it no longer exists
 */
export async function getSessionByToken(token: string): Promise<SessionRecord | null> {
  const prisma = getPrisma();

  return prisma.session.findUnique({
    where: { token },
  });
}

/**
 * Deletes a persisted session, terminating it immediately.
 *
 * @param token - Session token
 * @returns Promise resolving to true when a session was deleted
 */
export async function deleteSessionByToken(token: string): Promise<boolean> {
  const prisma = getPrisma();

  const result = await prisma.session.deleteMany({
    where: { token },
  });

  return result.count > 0;
}

/**
 * Extends a persisted session's expiry, used to slide the admin inactivity
 * window forward on each authenticated request.
 *
 * Uses updateMany so a session that was already terminated is a no-op rather
 * than an error.
 *
 * @param token - Session token
 * @param expiresAt - New expiry timestamp
 * @returns Promise resolving to true when a session was updated
 *
 * Requirements: 5.5
 */
export async function refreshSessionExpiry(
  token: string,
  expiresAt: Date
): Promise<boolean> {
  const prisma = getPrisma();

  const result = await prisma.session.updateMany({
    where: { token },
    data: { expiresAt },
  });

  return result.count > 0;
}
