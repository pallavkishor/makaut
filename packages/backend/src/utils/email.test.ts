import { validateEmail } from './email';

describe('Email Validation', () => {
  describe('validateEmail', () => {
    describe('valid emails', () => {
      it('should accept standard email format', () => {
        expect(validateEmail('user@example.com')).toBe(true);
        expect(validateEmail('test.user@example.com')).toBe(true);
        expect(validateEmail('test_user@example.com')).toBe(true);
      });

      it('should accept email with plus sign', () => {
        expect(validateEmail('user+tag@example.com')).toBe(true);
      });

      it('should accept email with subdomain', () => {
        expect(validateEmail('user@mail.example.com')).toBe(true);
        expect(validateEmail('user@sub.mail.example.com')).toBe(true);
      });

      it('should accept email with numbers', () => {
        expect(validateEmail('user123@example.com')).toBe(true);
        expect(validateEmail('123user@example.com')).toBe(true);
      });

      it('should accept email with special characters in local part', () => {
        expect(validateEmail('user.name@example.com')).toBe(true);
        expect(validateEmail('user_name@example.com')).toBe(true);
        expect(validateEmail('user-name@example.com')).toBe(true);
      });

      it('should accept email with hyphen in domain', () => {
        expect(validateEmail('user@my-domain.com')).toBe(true);
      });
    });

    describe('invalid emails', () => {
      it('should reject email without @ symbol', () => {
        expect(validateEmail('userexample.com')).toBe(false);
        expect(validateEmail('user.example.com')).toBe(false);
      });

      it('should reject email with multiple @ symbols', () => {
        expect(validateEmail('user@@example.com')).toBe(false);
        expect(validateEmail('user@domain@example.com')).toBe(false);
      });

      it('should reject email without domain', () => {
        expect(validateEmail('user@')).toBe(false);
      });

      it('should reject email without local part', () => {
        expect(validateEmail('@example.com')).toBe(false);
      });

      it('should reject email without TLD', () => {
        expect(validateEmail('user@domain')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(validateEmail('')).toBe(false);
      });

      it('should reject email with spaces', () => {
        expect(validateEmail('user @example.com')).toBe(false);
        expect(validateEmail('user@ example.com')).toBe(false);
        expect(validateEmail('user@example .com')).toBe(false);
      });

      it('should reject email with consecutive dots', () => {
        expect(validateEmail('user..name@example.com')).toBe(false);
      });

      it('should reject email starting with dot', () => {
        expect(validateEmail('.user@example.com')).toBe(false);
      });

      it('should reject email ending with dot in local part', () => {
        expect(validateEmail('user.@example.com')).toBe(false);
      });

      it('should reject email with invalid characters', () => {
        expect(validateEmail('user name@example.com')).toBe(false);
        expect(validateEmail('user@exam ple.com')).toBe(false);
      });

      it('should reject local part longer than 64 characters', () => {
        const longLocalPart = 'a'.repeat(65) + '@example.com';
        expect(validateEmail(longLocalPart)).toBe(false);
      });

      it('should reject email longer than 254 characters', () => {
        const longEmail = 'user@' + 'a'.repeat(250) + '.com';
        expect(validateEmail(longEmail)).toBe(false);
      });

      it('should reject non-string input', () => {
        expect(validateEmail(null as any)).toBe(false);
        expect(validateEmail(undefined as any)).toBe(false);
        expect(validateEmail(123 as any)).toBe(false);
        expect(validateEmail({} as any)).toBe(false);
        expect(validateEmail([] as any)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should accept email at maximum local part length (64 characters)', () => {
        const maxLocalPart = 'a'.repeat(64) + '@example.com';
        expect(validateEmail(maxLocalPart)).toBe(true);
      });

      it('should accept email at maximum total length (254 characters)', () => {
        // Create an email that is exactly 254 characters
        // Format: localpart@subdomain.example.com
        // We need: local (64) + @ (1) + domain (189) = 254
        const localPart = 'a'.repeat(64);
        // Domain needs to be valid: labels separated by dots, each label <= 63 chars
        // Structure: label1.label2.label3.com = 60 + 1 + 60 + 1 + 60 + 1 + 6 = 189
        const domain = 'b'.repeat(60) + '.' + 'c'.repeat(60) + '.' + 'd'.repeat(60) + '.co.com'; // 60+1+60+1+60+1+6 = 189
        const maxEmail = localPart + '@' + domain;
        expect(maxEmail.length).toBe(254);
        expect(validateEmail(maxEmail)).toBe(true);
      });

      it('should accept single character local part and domain label', () => {
        expect(validateEmail('a@b.c')).toBe(true);
      });

      it('should accept RFC 5322 special characters in local part', () => {
        expect(validateEmail('user!name@example.com')).toBe(true);
        expect(validateEmail('user#name@example.com')).toBe(true);
        expect(validateEmail('user$name@example.com')).toBe(true);
        expect(validateEmail('user%name@example.com')).toBe(true);
      });
    });
  });
});
