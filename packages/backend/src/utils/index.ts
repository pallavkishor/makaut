/**
 * Utility functions for the backend application
 */

// Password utilities
export {
  hashPassword,
  verifyPassword,
  validatePasswordLength,
} from './password';

// JWT utilities
export {
  generateStudentToken,
  generateAdminToken,
  validateToken,
  decodeToken,
  isTokenExpired,
  type TokenPayload,
  type DecodedToken,
} from './jwt';
