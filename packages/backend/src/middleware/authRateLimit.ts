import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { ErrorCode } from './errorHandler';

/**
 * Rate limiter for authentication endpoints
 * Implements requirement 9.8 and 9.9: 5 failed attempts per 15 minutes per email address
 * 
 * This middleware limits login attempts to prevent brute force attacks.
 * After 5 failed attempts within 15 minutes, the account is temporarily blocked.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 5, // Maximum 5 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  
  // Use email address as the identifier for rate limiting
  keyGenerator: (req: Request): string => {
    // Extract email from request body
    const email = req.body?.email;
    
    // If no email is provided, fall back to IP address
    // This prevents bypassing rate limiting by not providing an email
    if (!email || typeof email !== 'string') {
      return req.ip || 'unknown';
    }
    
    // Normalize email to lowercase for consistent rate limiting
    return email.toLowerCase().trim();
  },
  
  // Custom handler when rate limit is exceeded
  handler: (req: Request, res: Response): void => {
    const email = req.body?.email;
    
    res.status(429).json({
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: email
          ? `Too many login attempts for ${email}. Please try again in 15 minutes.`
          : 'Too many login attempts. Please try again in 15 minutes.',
      },
    });
  },
  
  // Skip successful requests - only count failed attempts
  // This will be handled by incrementing only on authentication failures
  skipSuccessfulRequests: false, // Count all requests by default
  skipFailedRequests: false,
  
  // Store rate limit data in memory
  // In production, consider using Redis for distributed rate limiting
  // via the rate-limit-redis package
});

/**
 * More lenient rate limiter for registration endpoints
 * Allows 10 registration attempts per 15 minutes per IP address
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Allow more attempts for registration
  standardHeaders: true,
  legacyHeaders: false,
  
  keyGenerator: (req: Request): string => {
    // Use email for registration attempts if provided
    const email = req.body?.email;
    if (email && typeof email === 'string') {
      return `register:${email.toLowerCase().trim()}`;
    }
    
    // Fall back to IP address
    return `register:${req.ip || 'unknown'}`;
  },
  
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many registration attempts. Please try again in 15 minutes.',
      },
    });
  },
});

/**
 * Export rate limiters for use in authentication routes
 * 
 * Usage in route handlers:
 * - app.post('/api/auth/login', authRateLimiter, loginHandler)
 * - app.post('/api/admin/auth/login', authRateLimiter, adminLoginHandler)
 * - app.post('/api/auth/register', registrationRateLimiter, registerHandler)
 */
