/**
 * Global test setup file
 * This file is run before all tests via Jest's setupFilesAfterEnv configuration
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';

// Drop any LOG_LEVEL inherited from the developer's shell so the logger falls
// back to its test default (silent) and test output stays deterministic.
delete process.env.LOG_LEVEL;

// Increase timeout for database operations in tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging test failures
  error: console.error,
};
