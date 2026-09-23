/**
 * Middleware exports for the backend application
 */

// Authentication middleware
export {
  authenticate,
  authenticateStudent,
  authenticateAdmin,
  extractTokenFromHeader,
} from './auth';

// Session validation middleware
export { requireActiveSession } from './sessionValidation';

// Authentication rate limiters
export { authRateLimiter, registrationRateLimiter } from './authRateLimit';

// Request logging
export { requestLogger, getRequestId, REQUEST_ID_HEADER } from './requestLogger';

// Error handling middleware
export { errorHandler } from './errorHandler';
export { notFoundHandler } from './notFoundHandler';
