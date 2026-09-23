import { PrismaClient } from '@prisma/client';
import { getDatabaseClient } from '../config/database';
import { hashPassword, verifyPassword } from '../utils/password';
import { validateEmail } from '../utils/email';
import { generateStudentToken, generateAdminToken } from '../utils/jwt';

/**
 * Authentication Service
 * Handles student registration, student login, and admin login
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

export interface RegisterStudentResult {
  student: {
    id: string;
    email: string;
    registeredAt: Date;
  };
  session: {
    token: string;
    expiresAt: Date;
  };
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    userType: 'student' | 'admin';
  };
  session: {
    token: string;
    expiresAt: Date;
  };
}

/**
 * Registers a new student account
 * Validates email format, checks for duplicates, hashes password, and creates account
 * 
 * @param email - Student's email address
 * @param password - Student's plain text password
 * @returns Promise resolving to student data and session token
 * @throws Error if email is invalid, already exists, or password is too short
 */
export async function registerStudent(
  email: string,
  password: string
): Promise<RegisterStudentResult> {
  const prisma = getPrisma();

  // Validate email format
  if (!validateEmail(email)) {
    throw new Error('Invalid email format');
  }

  // Check for duplicate email
  const existingStudent = await prisma.student.findUnique({
    where: { email },
  });

  if (existingStudent) {
    throw new Error('Email address already registered');
  }

  // Hash password (will throw if password is too short)
  const passwordHash = await hashPassword(password);

  // Create student account
  const student = await prisma.student.create({
    data: {
      email,
      passwordHash,
    },
  });

  // Generate session token (24-hour expiration for students)
  const token = generateStudentToken(student.id, student.email);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return {
    student: {
      id: student.id,
      email: student.email,
      registeredAt: student.registeredAt,
    },
    session: {
      token,
      expiresAt,
    },
  };
}

/**
 * Authenticates a student and creates a session
 * Validates credentials and generates session token
 * 
 * @param email - Student's email address
 * @param password - Student's plain text password
 * @returns Promise resolving to student data and session token
 * @throws Error if credentials are invalid
 */
export async function loginStudent(
  email: string,
  password: string
): Promise<LoginResult> {
  const prisma = getPrisma();

  // Find student by email
  const student = await prisma.student.findUnique({
    where: { email },
  });

  if (!student) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, student.passwordHash);

  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // Generate session token (24-hour expiration for students)
  const token = generateStudentToken(student.id, student.email);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return {
    user: {
      id: student.id,
      email: student.email,
      userType: 'student',
    },
    session: {
      token,
      expiresAt,
    },
  };
}

/**
 * Authenticates an administrator and creates a session
 * Validates credentials and generates session token with 30-minute expiration
 * 
 * @param email - Administrator's email address
 * @param password - Administrator's plain text password
 * @returns Promise resolving to admin data and session token
 * @throws Error if credentials are invalid
 */
export async function loginAdmin(
  email: string,
  password: string
): Promise<LoginResult> {
  const prisma = getPrisma();

  // Find administrator by email
  const admin = await prisma.administrator.findUnique({
    where: { email },
  });

  if (!admin) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, admin.passwordHash);

  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // Generate session token (30-minute expiration for admins)
  const token = generateAdminToken(admin.id, admin.email);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  return {
    user: {
      id: admin.id,
      email: admin.email,
      userType: 'admin',
    },
    session: {
      token,
      expiresAt,
    },
  };
}
