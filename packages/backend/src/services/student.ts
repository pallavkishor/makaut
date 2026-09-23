import { PrismaClient } from '@prisma/client';
import { getDatabaseClient } from '../config/database';

/**
 * Student Service
 * Read access to student profile data.
 * Password hashes are never included in the returned shape.
 *
 * Requirements: 3.4, 3.7
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

export interface StudentProfile {
  id: string;
  email: string;
  registeredAt: Date;
}

/**
 * Retrieves a student profile by ID.
 *
 * @param studentId - Student's UUID
 * @returns Promise resolving to the profile, or null when not found
 */
export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    // Explicit selection guarantees the password hash is never returned
    select: {
      id: true,
      email: true,
      registeredAt: true,
    },
  });

  return student;
}

/**
 * Task 9.2: Admin student listing and search
 *
 * Both helpers select an explicit field list so a password hash can never leak
 * into an admin response, and both return the unpaginated total so callers can
 * build pagination metadata.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

export interface StudentListOptions {
  skip?: number;
  take?: number;
}

export interface StudentListResult {
  students: StudentProfile[];
  total: number;
}

// Explicit selection guarantees the password hash is never returned
const STUDENT_PROFILE_SELECTION = {
  id: true,
  email: true,
  registeredAt: true,
} as const;

/**
 * Lists student accounts, newest registration first.
 *
 * @param options - Pagination window
 * @returns Promise resolving to the page of students plus the total count
 */
export async function listStudents(
  options: StudentListOptions = {}
): Promise<StudentListResult> {
  const prisma = getPrisma();

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      select: STUDENT_PROFILE_SELECTION,
      orderBy: { registeredAt: 'desc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.student.count(),
  ]);

  return { students, total };
}

/**
 * Finds students whose email contains the given fragment (case-insensitive).
 *
 * @param email - Email fragment to search for
 * @param options - Pagination window
 * @returns Promise resolving to the page of matches plus the total match count
 */
export async function searchStudentsByEmail(
  email: string,
  options: StudentListOptions = {}
): Promise<StudentListResult> {
  const prisma = getPrisma();

  const where = {
    email: {
      contains: email,
      mode: 'insensitive' as const,
    },
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: STUDENT_PROFILE_SELECTION,
      orderBy: { registeredAt: 'desc' },
      skip: options.skip,
      take: options.take,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total };
}
