import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Application configuration loaded from environment variables
 */
export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Logging - empty means "derive from NODE_ENV" (see lib/logger.ts)
  logLevel: process.env.LOG_LEVEL || '',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // JWT configuration
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5', 10),

  // File upload
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB

  // Session timeouts
  sessionTimeoutStudent: parseInt(process.env.SESSION_TIMEOUT_STUDENT || '86400000', 10), // 24 hours
  sessionTimeoutAdmin: parseInt(process.env.SESSION_TIMEOUT_ADMIN || '1800000', 10), // 30 minutes

  // Environment checks
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
} as const;

/**
 * Validate required configuration variables
 */
export function validateConfig(): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && config.nodeEnv !== 'test') {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in the required values.'
    );
  }
}
