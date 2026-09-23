/**
 * Example unit test
 * Demonstrates basic unit testing patterns with Jest
 */

import { generateTestEmail, generateTestPassword, hashPassword } from '../helpers';

describe('Unit Test Example', () => {
  describe('Test Data Helpers', () => {
    it('should generate valid email addresses', () => {
      const email = generateTestEmail();
      
      expect(email).toBeTruthy();
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should generate passwords with minimum length', () => {
      const password = generateTestPassword();
      
      expect(password).toBeTruthy();
      expect(password.length).toBeGreaterThanOrEqual(8);
    });

    it('should hash passwords using bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });
  });

  describe('String Validation', () => {
    it('should validate email format correctly', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.com',
      ];

      const invalidEmails = [
        'notanemail',
        '@example.com',
        'test@',
        'test..test@example.com',
      ];

      validEmails.forEach((email) => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      invalidEmails.forEach((email) => {
        expect(email).not.toMatch(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
      });
    });

    it('should validate password length', () => {
      const validPasswords = ['password1', '12345678', 'a'.repeat(8)];
      const invalidPasswords = ['pass', '1234567', 'a'.repeat(7)];

      validPasswords.forEach((password) => {
        expect(password.length).toBeGreaterThanOrEqual(8);
      });

      invalidPasswords.forEach((password) => {
        expect(password.length).toBeLessThan(8);
      });
    });
  });

  describe('Date Calculations', () => {
    it('should correctly calculate if date is in range', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Active subscription
      expect(now >= yesterday && now <= nextWeek).toBe(true);
      
      // Expired subscription
      expect(now >= yesterday && now <= yesterday).toBe(false);
      
      // Future subscription
      expect(now >= tomorrow && now <= nextWeek).toBe(false);
    });
  });
});
