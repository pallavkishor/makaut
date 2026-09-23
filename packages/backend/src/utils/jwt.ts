import jwt from 'jsonwebtoken';

/**
 * JWT session token generation and validation utilities
 * 
 * Token expiration:
 * - Students: 24 hours
 * - Admins: 30 minutes
 */

// JWT secret should be loaded from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';

// Token expiration times
const STUDENT_TOKEN_EXPIRY = '24h';
const ADMIN_TOKEN_EXPIRY = '30m';

export interface TokenPayload {
  userId: string;
  userType: 'student' | 'admin';
  email: string;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

/**
 * Generates a JWT token for a student user with 24-hour expiration
 * @param userId - The student's unique identifier
 * @param email - The student's email address
 * @returns Signed JWT token string
 */
export function generateStudentToken(userId: string, email: string): string {
  const payload: TokenPayload = {
    userId,
    userType: 'student',
    email,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: STUDENT_TOKEN_EXPIRY,
  });
}

/**
 * Generates a JWT token for an admin user with 30-minute expiration
 * @param userId - The admin's unique identifier
 * @param email - The admin's email address
 * @returns Signed JWT token string
 */
export function generateAdminToken(userId: string, email: string): string {
  const payload: TokenPayload = {
    userId,
    userType: 'admin',
    email,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_EXPIRY,
  });
}

/**
 * Validates a JWT token and returns the decoded payload
 * @param token - The JWT token to validate
 * @returns Decoded token payload if valid
 * @throws Error if token is invalid, expired, or malformed
 */
export function validateToken(token: string): DecodedToken {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token validation failed');
    }
  }
}

/**
 * Decodes a JWT token without verifying its signature (for inspection purposes)
 * WARNING: Use validateToken() for actual authentication
 * @param token - The JWT token to decode
 * @returns Decoded token payload or null if invalid format
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.decode(token) as DecodedToken;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Checks if a token is expired without throwing an error
 * @param token - The JWT token to check
 * @returns true if token is expired, false if still valid
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
}
