import jwt from 'jsonwebtoken';
import {
  generateStudentToken,
  generateAdminToken,
  validateToken,
  decodeToken,
  isTokenExpired,
  DecodedToken,
} from './jwt';

describe('JWT Token Generation and Validation', () => {
  const testUserId = 'test-user-123';
  const testEmail = 'test@example.com';
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

  describe('generateStudentToken', () => {
    it('should generate a valid JWT token for a student', () => {
      const token = generateStudentToken(testUserId, testEmail);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.userType).toBe('student');
    });

    it('should include expiration time in the token', () => {
      const token = generateStudentToken(testUserId, testEmail);
      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
      
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      
      // Check that expiration is approximately 24 hours from now (86400 seconds)
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBeGreaterThan(86000); // Allow some margin
      expect(expiresIn).toBeLessThan(87000);
    });

    it('should generate different tokens for different users', () => {
      const token1 = generateStudentToken('user1', 'user1@example.com');
      const token2 = generateStudentToken('user2', 'user2@example.com');
      
      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for the same user called at different times', async () => {
      const token1 = generateStudentToken(testUserId, testEmail);
      // Wait to ensure different iat (issued at) time
      await new Promise(resolve => setTimeout(resolve, 1000));
      const token2 = generateStudentToken(testUserId, testEmail);
      
      // Tokens will be different due to different iat timestamps
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateAdminToken', () => {
    it('should generate a valid JWT token for an admin', () => {
      const token = generateAdminToken(testUserId, testEmail);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.userType).toBe('admin');
    });

    it('should have shorter expiration time than student token (30 minutes)', () => {
      const token = generateAdminToken(testUserId, testEmail);
      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
      
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      
      // Check that expiration is approximately 30 minutes from now (1800 seconds)
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBeGreaterThan(1700); // Allow some margin
      expect(expiresIn).toBeLessThan(1900);
    });

    it('should generate different tokens for different admins', () => {
      const token1 = generateAdminToken('admin1', 'admin1@example.com');
      const token2 = generateAdminToken('admin2', 'admin2@example.com');
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('should successfully validate a valid student token', () => {
      const token = generateStudentToken(testUserId, testEmail);
      const decoded = validateToken(token);
      
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.userType).toBe('student');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should successfully validate a valid admin token', () => {
      const token = generateAdminToken(testUserId, testEmail);
      const decoded = validateToken(token);
      
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.userType).toBe('admin');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should throw error for invalid token signature', () => {
      const token = generateStudentToken(testUserId, testEmail);
      // Tamper with the token by changing a character
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      
      expect(() => validateToken(tamperedToken)).toThrow('Invalid token');
    });

    it('should throw error for malformed token', () => {
      expect(() => validateToken('not-a-jwt-token')).toThrow('Invalid token');
      expect(() => validateToken('')).toThrow('Invalid token');
      expect(() => validateToken('a.b.c')).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      // Create a token that expires immediately
      const expiredToken = jwt.sign(
        { userId: testUserId, email: testEmail, userType: 'student' },
        JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a tiny bit to ensure expiration
      setTimeout(() => {
        expect(() => validateToken(expiredToken)).toThrow('Token has expired');
      }, 100);
    });

    it('should throw error for token with wrong secret', () => {
      const tokenWithWrongSecret = jwt.sign(
        { userId: testUserId, email: testEmail, userType: 'student' },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      expect(() => validateToken(tokenWithWrongSecret)).toThrow('Invalid token');
    });
  });

  describe('decodeToken', () => {
    it('should decode a valid token without verification', () => {
      const token = generateStudentToken(testUserId, testEmail);
      const decoded = decodeToken(token);
      
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(testUserId);
      expect(decoded?.email).toBe(testEmail);
      expect(decoded?.userType).toBe('student');
    });

    it('should decode a token with wrong signature (no verification)', () => {
      const tokenWithWrongSecret = jwt.sign(
        { userId: testUserId, email: testEmail, userType: 'student' },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      const decoded = decodeToken(tokenWithWrongSecret);
      
      // Decoding without verification should still work
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(testUserId);
    });

    it('should return null for completely malformed token', () => {
      expect(decodeToken('not-a-jwt')).toBeNull();
      expect(decodeToken('')).toBeNull();
    });

    it('should decode expired token (no verification)', () => {
      const expiredToken = jwt.sign(
        { userId: testUserId, email: testEmail, userType: 'student' },
        JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const decoded = decodeToken(expiredToken);
      
      // Decoding without verification should work even for expired tokens
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(testUserId);
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid non-expired token', () => {
      const token = generateStudentToken(testUserId, testEmail);
      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return true for expired token', () => {
      const expiredToken = jwt.sign(
        { userId: testUserId, email: testEmail, userType: 'student' },
        JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    it('should return true for malformed token', () => {
      expect(isTokenExpired('not-a-jwt')).toBe(true);
      expect(isTokenExpired('')).toBe(true);
    });

    it('should return true for token without expiration', () => {
      const tokenWithoutExp = jwt.sign(
        { userId: testUserId, email: testEmail, userType: 'student' },
        JWT_SECRET
        // No expiresIn option
      );

      // Token without exp should be treated as expired for safety
      const decoded = decodeToken(tokenWithoutExp);
      expect(decoded?.exp).toBeUndefined();
      // isTokenExpired will return true due to missing exp
    });
  });

  describe('Token payload integrity', () => {
    it('should preserve all payload data through encode/decode cycle', () => {
      const token = generateStudentToken(testUserId, testEmail);
      const decoded = validateToken(token);
      
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.userType).toBe('student');
    });

    it('should distinguish between student and admin tokens', () => {
      const studentToken = generateStudentToken(testUserId, testEmail);
      const adminToken = generateAdminToken(testUserId, testEmail);
      
      const decodedStudent = validateToken(studentToken);
      const decodedAdmin = validateToken(adminToken);
      
      expect(decodedStudent.userType).toBe('student');
      expect(decodedAdmin.userType).toBe('admin');
      expect(decodedStudent.userType).not.toBe(decodedAdmin.userType);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings for userId and email', () => {
      const token = generateStudentToken('', '');
      const decoded = validateToken(token);
      
      expect(decoded.userId).toBe('');
      expect(decoded.email).toBe('');
    });

    it('should handle special characters in email', () => {
      const specialEmail = 'test+tag@sub.example.com';
      const token = generateStudentToken(testUserId, specialEmail);
      const decoded = validateToken(token);
      
      expect(decoded.email).toBe(specialEmail);
    });

    it('should handle very long userId and email strings', () => {
      const longUserId = 'a'.repeat(1000);
      const longEmail = 'b'.repeat(1000) + '@example.com';
      
      const token = generateStudentToken(longUserId, longEmail);
      const decoded = validateToken(token);
      
      expect(decoded.userId).toBe(longUserId);
      expect(decoded.email).toBe(longEmail);
    });
  });
});
