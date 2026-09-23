import { registerStudent, loginStudent, loginAdmin, setPrismaClient, resetPrismaClient } from './auth';
import { getTestDatabaseClient, beforeEachTest, afterAllTests } from '../test/config/database';
import { hashPassword } from '../utils/password';

/**
 * Authentication Service Unit Tests
 * Tests student registration, student login, and admin login functionality
 */

describe('Authentication Service', () => {
  let prisma: ReturnType<typeof getTestDatabaseClient>;

  beforeAll(() => {
    prisma = getTestDatabaseClient();
    setPrismaClient(prisma);
  });

  beforeEach(async () => {
    await beforeEachTest();
  });

  afterAll(async () => {
    await afterAllTests();
    resetPrismaClient();
  });

  describe('registerStudent', () => {
    it('should successfully register a student with valid email and password', async () => {
      const email = 'student@example.com';
      const password = 'password123';

      const result = await registerStudent(email, password);

      expect(result.student).toBeDefined();
      expect(result.student.email).toBe(email);
      expect(result.student.id).toBeDefined();
      expect(result.student.registeredAt).toBeInstanceOf(Date);

      expect(result.session).toBeDefined();
      expect(result.session.token).toBeDefined();
      expect(result.session.expiresAt).toBeInstanceOf(Date);

      // Verify the student was created in the database
      const dbStudent = await prisma.student.findUnique({ where: { email } });
      expect(dbStudent).toBeDefined();
      expect(dbStudent?.email).toBe(email);
    });

    it('should reject registration with invalid email format', async () => {
      const invalidEmail = 'not-an-email';
      const password = 'password123';

      await expect(registerStudent(invalidEmail, password)).rejects.toThrow(
        'Invalid email format'
      );
    });

    it('should reject registration with duplicate email', async () => {
      const email = 'duplicate@example.com';
      const password = 'password123';

      // Create first student
      await registerStudent(email, password);

      // Attempt to create duplicate
      await expect(registerStudent(email, password)).rejects.toThrow(
        'Email address already registered'
      );
    });

    it('should reject registration with password shorter than 8 characters', async () => {
      const email = 'student@example.com';
      const shortPassword = 'pass123'; // Only 7 characters

      await expect(registerStudent(email, shortPassword)).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should hash the password before storing', async () => {
      const email = 'student@example.com';
      const password = 'password123';

      await registerStudent(email, password);

      const dbStudent = await prisma.student.findUnique({ where: { email } });
      expect(dbStudent?.passwordHash).toBeDefined();
      expect(dbStudent?.passwordHash).not.toBe(password);
      expect(dbStudent?.passwordHash.length).toBeGreaterThan(password.length);
    });

    it('should return a valid session token with 24-hour expiration', async () => {
      const email = 'student@example.com';
      const password = 'password123';

      const result = await registerStudent(email, password);

      const now = Date.now();
      const expiresAtTime = result.session.expiresAt.getTime();
      const expectedExpiry = now + 24 * 60 * 60 * 1000; // 24 hours

      // Allow 1 second tolerance for test execution time
      expect(expiresAtTime).toBeGreaterThan(now);
      expect(Math.abs(expiresAtTime - expectedExpiry)).toBeLessThan(1000);
    });
  });

  describe('loginStudent', () => {
    it('should successfully authenticate student with valid credentials', async () => {
      const email = 'student@example.com';
      const password = 'password123';

      // Register student first
      await registerStudent(email, password);

      // Attempt login
      const result = await loginStudent(email, password);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.userType).toBe('student');
      expect(result.user.id).toBeDefined();

      expect(result.session).toBeDefined();
      expect(result.session.token).toBeDefined();
      expect(result.session.expiresAt).toBeInstanceOf(Date);
    });

    it('should reject login with non-existent email', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      await expect(loginStudent(email, password)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should reject login with incorrect password', async () => {
      const email = 'student@example.com';
      const correctPassword = 'password123';
      const incorrectPassword = 'wrongpassword';

      // Register student
      await registerStudent(email, correctPassword);

      // Attempt login with wrong password
      await expect(loginStudent(email, incorrectPassword)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should return a valid session token with 24-hour expiration', async () => {
      const email = 'student@example.com';
      const password = 'password123';

      await registerStudent(email, password);
      const result = await loginStudent(email, password);

      const now = Date.now();
      const expiresAtTime = result.session.expiresAt.getTime();
      const expectedExpiry = now + 24 * 60 * 60 * 1000; // 24 hours

      // Allow 1 second tolerance for test execution time
      expect(expiresAtTime).toBeGreaterThan(now);
      expect(Math.abs(expiresAtTime - expectedExpiry)).toBeLessThan(1000);
    });

    it('should allow login multiple times with same credentials', async () => {
      const email = 'student@example.com';
      const password = 'password123';

      await registerStudent(email, password);

      const firstLogin = await loginStudent(email, password);
      const secondLogin = await loginStudent(email, password);

      expect(firstLogin.user.id).toBe(secondLogin.user.id);
      expect(firstLogin.session.token).not.toBe(secondLogin.session.token); // New token each time
    });
  });

  describe('loginAdmin', () => {
    beforeEach(async () => {
      // Create test admin account
      const adminEmail = 'admin@example.com';
      const adminPassword = 'adminpass123';
      const adminPasswordHash = await hashPassword(adminPassword);

      await prisma.administrator.create({
        data: {
          email: adminEmail,
          passwordHash: adminPasswordHash,
        },
      });
    });

    it('should successfully authenticate admin with valid credentials', async () => {
      const email = 'admin@example.com';
      const password = 'adminpass123';

      const result = await loginAdmin(email, password);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.userType).toBe('admin');
      expect(result.user.id).toBeDefined();

      expect(result.session).toBeDefined();
      expect(result.session.token).toBeDefined();
      expect(result.session.expiresAt).toBeInstanceOf(Date);
    });

    it('should reject login with non-existent admin email', async () => {
      const email = 'nonexistent@example.com';
      const password = 'adminpass123';

      await expect(loginAdmin(email, password)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should reject login with incorrect admin password', async () => {
      const email = 'admin@example.com';
      const incorrectPassword = 'wrongpassword';

      await expect(loginAdmin(email, incorrectPassword)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should return a session token with 30-minute expiration', async () => {
      const email = 'admin@example.com';
      const password = 'adminpass123';

      const result = await loginAdmin(email, password);

      const now = Date.now();
      const expiresAtTime = result.session.expiresAt.getTime();
      const expectedExpiry = now + 30 * 60 * 1000; // 30 minutes

      // Allow 1 second tolerance for test execution time
      expect(expiresAtTime).toBeGreaterThan(now);
      expect(Math.abs(expiresAtTime - expectedExpiry)).toBeLessThan(1000);
    });

    it('should differentiate admin and student accounts', async () => {
      const email = 'user@example.com';
      const password = 'password123';

      // Create both student and admin with same email (different tables)
      await registerStudent(email, password);

      const studentPasswordHash = await hashPassword('studentpass');
      await prisma.administrator.create({
        data: {
          email,
          passwordHash: studentPasswordHash,
        },
      });

      // Student login should work with student password
      const studentResult = await loginStudent(email, password);
      expect(studentResult.user.userType).toBe('student');

      // Admin login should work with admin password
      const adminResult = await loginAdmin(email, 'studentpass');
      expect(adminResult.user.userType).toBe('admin');

      // IDs should be different
      expect(studentResult.user.id).not.toBe(adminResult.user.id);
    });

    it('should allow admin login multiple times', async () => {
      const email = 'admin@example.com';
      const password = 'adminpass123';

      const firstLogin = await loginAdmin(email, password);
      const secondLogin = await loginAdmin(email, password);

      expect(firstLogin.user.id).toBe(secondLogin.user.id);
      expect(firstLogin.session.token).not.toBe(secondLogin.session.token); // New token each time
    });
  });

  describe('Edge Cases', () => {
    it('should handle email addresses with various valid formats', async () => {
      const validEmails = [
        'simple@example.com',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com',
        'other.email-with-hyphen@example.com',
        'x@example.com',
      ];

      for (const email of validEmails) {
        const password = 'password123';
        const result = await registerStudent(email, password);
        expect(result.student.email).toBe(email);
      }
    });

    it('should handle passwords at minimum length boundary (exactly 8 characters)', async () => {
      const email = 'boundary@example.com';
      const exactlyEightChars = '12345678';

      const result = await registerStudent(email, exactlyEightChars);
      expect(result.student.email).toBe(email);

      // Verify can login with this password
      const loginResult = await loginStudent(email, exactlyEightChars);
      expect(loginResult.user.email).toBe(email);
    });

    it('should handle long valid passwords', async () => {
      const email = 'longpass@example.com';
      const longPassword = 'a'.repeat(100); // 100 character password

      const result = await registerStudent(email, longPassword);
      expect(result.student.email).toBe(email);

      // Verify can login with this password
      const loginResult = await loginStudent(email, longPassword);
      expect(loginResult.user.email).toBe(email);
    });
  });
});
