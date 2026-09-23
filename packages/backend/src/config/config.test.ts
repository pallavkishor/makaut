import { config, validateConfig } from './index';

describe('Configuration', () => {
  describe('Config Loading', () => {
    it('should load configuration from environment variables', () => {
      expect(config).toBeDefined();
      expect(config.port).toBeDefined();
      expect(config.nodeEnv).toBeDefined();
    });

    it('should have default port if not specified', () => {
      expect(config.port).toBe(3001);
    });

    it('should have CORS origin configured', () => {
      expect(config.corsOrigin).toBeDefined();
      expect(typeof config.corsOrigin).toBe('string');
    });

    it('should have rate limiting configuration', () => {
      expect(config.rateLimitWindowMs).toBeDefined();
      expect(config.rateLimitMaxRequests).toBeDefined();
      expect(typeof config.rateLimitWindowMs).toBe('number');
      expect(typeof config.rateLimitMaxRequests).toBe('number');
    });

    it('should have session timeout configuration', () => {
      expect(config.sessionTimeoutStudent).toBeDefined();
      expect(config.sessionTimeoutAdmin).toBeDefined();
      expect(config.sessionTimeoutStudent).toBe(86400000); // 24 hours
      expect(config.sessionTimeoutAdmin).toBe(1800000); // 30 minutes
    });

    it('should have file upload configuration', () => {
      expect(config.uploadDir).toBeDefined();
      expect(config.maxFileSize).toBeDefined();
      expect(typeof config.maxFileSize).toBe('number');
    });

    it('should have environment flags', () => {
      expect(typeof config.isDevelopment).toBe('boolean');
      expect(typeof config.isProduction).toBe('boolean');
      expect(typeof config.isTest).toBe('boolean');
    });
  });

  describe('Config Validation', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset process.env before each test
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    it('should not throw error when required variables are present', () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = 'postgresql://test';
      process.env.JWT_SECRET = 'test-secret';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should skip validation in test environment', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.DATABASE_URL;
      delete process.env.JWT_SECRET;

      expect(() => validateConfig()).not.toThrow();
    });
  });

  describe('Type Safety', () => {
    it('should parse numeric environment variables correctly', () => {
      expect(typeof config.port).toBe('number');
      expect(typeof config.rateLimitWindowMs).toBe('number');
      expect(typeof config.rateLimitMaxRequests).toBe('number');
      expect(typeof config.maxFileSize).toBe('number');
      expect(typeof config.sessionTimeoutStudent).toBe('number');
      expect(typeof config.sessionTimeoutAdmin).toBe('number');
    });

    it('should have correct timeout values', () => {
      // Student session: 24 hours in milliseconds
      expect(config.sessionTimeoutStudent).toBe(24 * 60 * 60 * 1000);
      
      // Admin session: 30 minutes in milliseconds
      expect(config.sessionTimeoutAdmin).toBe(30 * 60 * 1000);
    });

    it('should have correct rate limit window', () => {
      // 15 minutes in milliseconds
      expect(config.rateLimitWindowMs).toBe(15 * 60 * 1000);
    });
  });
});
