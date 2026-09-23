import { Request, Response, NextFunction } from 'express';
import { authenticate, authenticateStudent, authenticateAdmin } from './auth';
import { generateStudentToken, generateAdminToken } from '../utils/jwt';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  describe('authenticate', () => {
    it('should authenticate valid student token and attach user to request', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe('student-123');
      expect(mockRequest.user?.email).toBe('student@example.com');
      expect(mockRequest.user?.userType).toBe('student');
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should authenticate valid admin token and attach user to request', () => {
      const token = generateAdminToken('admin-456', 'admin@example.com');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe('admin-456');
      expect(mockRequest.user?.email).toBe('admin@example.com');
      expect(mockRequest.user?.userType).toBe('admin');
    });

    it('should return 401 when authorization header is missing', () => {
      mockRequest.headers = {}; // No authorization header

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is malformed (missing Bearer)', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      mockRequest.headers = {
        authorization: token, // Missing "Bearer " prefix
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header has wrong scheme', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      mockRequest.headers = {
        authorization: `Basic ${token}`, // Wrong scheme (should be Bearer)
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 for tampered token', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      
      mockRequest.headers = {
        authorization: `Bearer ${tamperedToken}`,
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle tokens with extra spaces in authorization header', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      mockRequest.headers = {
        authorization: `Bearer  ${token}`, // Extra space
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      // Should fail due to malformed header
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('authenticateStudent', () => {
    it('should allow access for valid student token', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticateStudent(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user?.userType).toBe('student');
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for admin token', () => {
      const token = generateAdminToken('admin-456', 'admin@example.com');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticateStudent(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Student access required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 for missing token', () => {
      mockRequest.headers = {};

      authenticateStudent(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticateStudent(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('authenticateAdmin', () => {
    it('should allow access for valid admin token', () => {
      const token = generateAdminToken('admin-456', 'admin@example.com');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user?.userType).toBe('admin');
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for student token', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Administrator access required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 for missing token', () => {
      mockRequest.headers = {};

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and security', () => {
    it('should not leak sensitive information in error messages', () => {
      mockRequest.headers = {
        authorization: 'Bearer malformed.jwt.token',
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalled();
      const errorResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];
      
      // Error message should be generic, not revealing internal details
      expect(errorResponse.error.message).not.toContain('secret');
      expect(errorResponse.error.message).not.toContain('key');
    });

    it('should handle case-sensitive Bearer scheme correctly', () => {
      const token = generateStudentToken('student-123', 'student@example.com');
      
      // Try with lowercase "bearer"
      mockRequest.headers = {
        authorization: `bearer ${token}`,
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      // Should fail because Bearer is case-sensitive in HTTP spec
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should not allow empty token after Bearer keyword', () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should not mutate request object on authentication failure', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toBeUndefined();
    });

    it('should properly attach decoded token data to request on success', () => {
      const userId = 'test-user-789';
      const email = 'test@example.com';
      const token = generateStudentToken(userId, email);
      
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe(userId);
      expect(mockRequest.user?.email).toBe(email);
      expect(mockRequest.user?.userType).toBe('student');
      expect(mockRequest.user?.exp).toBeDefined();
      expect(mockRequest.user?.iat).toBeDefined();
    });
  });
});
