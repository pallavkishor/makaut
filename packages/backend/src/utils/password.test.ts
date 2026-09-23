import { hashPassword, verifyPassword, validatePasswordLength } from './password';

describe('Password Utilities', () => {
  describe('validatePasswordLength', () => {
    it('should accept passwords with 8 or more characters', () => {
      expect(validatePasswordLength('12345678')).toBe(true);
      expect(validatePasswordLength('password123')).toBe(true);
      expect(validatePasswordLength('a'.repeat(100))).toBe(true);
    });

    it('should reject passwords with fewer than 8 characters', () => {
      expect(validatePasswordLength('')).toBe(false);
      expect(validatePasswordLength('1234567')).toBe(false);
      expect(validatePasswordLength('short')).toBe(false);
    });

    it('should handle edge case of exactly 8 characters', () => {
      expect(validatePasswordLength('12345678')).toBe(true);
      expect(validatePasswordLength('1234567')).toBe(false);
    });
  });

  describe('hashPassword', () => {
    it('should hash a valid password', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash format
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'samePassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      // Hashes should be different due to automatic salt generation
      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for passwords shorter than 8 characters', async () => {
      await expect(hashPassword('short')).rejects.toThrow('Password must be at least 8 characters long');
      await expect(hashPassword('1234567')).rejects.toThrow('Password must be at least 8 characters long');
      await expect(hashPassword('')).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should accept password with exactly 8 characters', async () => {
      const password = '12345678';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password against its hash', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should reject empty password against valid hash', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword('', hash);
      expect(isValid).toBe(false);
    });

    it('should handle case-sensitive verification', async () => {
      const password = 'CaseSensitive123';
      const hash = await hashPassword(password);
      
      expect(await verifyPassword('CaseSensitive123', hash)).toBe(true);
      expect(await verifyPassword('casesensitive123', hash)).toBe(false);
      expect(await verifyPassword('CASESENSITIVE123', hash)).toBe(false);
    });

    it('should verify password with special characters', async () => {
      const password = 'P@ssw0rd!#$%';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('Integration tests', () => {
    it('should handle complete hash-verify cycle', async () => {
      const testPasswords = [
        'simplePassword123',
        'C0mpl3x!P@ssw0rd',
        '12345678',
        'a'.repeat(100),
      ];

      for (const password of testPasswords) {
        const hash = await hashPassword(password);
        expect(await verifyPassword(password, hash)).toBe(true);
        expect(await verifyPassword('wrongPassword', hash)).toBe(false);
      }
    });
  });
});
