# Backend Testing Infrastructure Setup

This document provides a comprehensive overview of the testing infrastructure for the Educational Notes Platform backend.

## Overview

The backend testing infrastructure is fully configured with:

- ✅ **Jest** - Test runner and assertion library
- ✅ **ts-jest** - TypeScript support for Jest
- ✅ **Supertest** - HTTP assertion library for API testing
- ✅ **fast-check** - Property-based testing library
- ✅ **@faker-js/faker** - Test data generation
- ✅ **Prisma Test Database** - Isolated test database configuration

## Installed Dependencies

### Testing Libraries
```json
{
  "jest": "^29.7.0",
  "ts-jest": "^29.1.1",
  "@types/jest": "^29.5.10",
  "supertest": "^6.3.3",
  "@types/supertest": "^2.0.16",
  "fast-check": "^3.15.0",
  "@faker-js/faker": "^8.3.1"
}
```

## Configuration Files

### jest.config.js
Located at `packages/backend/jest.config.js`

Key configurations:
- Uses `ts-jest` preset for TypeScript support
- Test environment: Node.js
- Test match patterns: `**/*.test.ts` and `**/*.spec.ts`
- Setup file: `src/test/setup.ts` runs before all tests
- Test timeout: 30 seconds
- Coverage collection from all source files excluding tests

### tsconfig.json
Updated with `isolatedModules: true` for optimal Jest performance

### .env.test
Test-specific environment configuration:
- Separate test database URL
- Test JWT secrets
- Relaxed rate limiting for tests
- Debug flags for SQL queries

## Directory Structure

```
src/test/
├── config/
│   └── database.ts          # Test database utilities
├── helpers/
│   ├── testData.ts          # Faker-based test data generators
│   ├── apiHelpers.ts        # Supertest API helpers
│   ├── propertyHelpers.ts   # fast-check arbitraries
│   └── index.ts             # Centralized exports
├── examples/
│   ├── unit.test.ts         # Unit test examples
│   ├── property.test.ts     # Property-based test examples
│   └── integration.test.ts  # Integration test templates
├── setup.ts                 # Global test setup
└── README.md                # Comprehensive testing guide
```

## Key Features

### 1. Database Test Utilities
- `getTestDatabaseClient()` - Get Prisma client for testing
- `cleanupTestDatabase()` - Clean all test data
- `beforeEachTest()` - Setup hook for test isolation
- `afterAllTests()` - Teardown hook for cleanup

### 2. Test Data Generation
- `generateTestEmail()` - Valid email addresses
- `generateTestPassword()` - Valid passwords (8+ chars)
- `generateStudentData()` - Complete student objects
- `generateActiveSubscriptionDates()` - Date ranges for testing
- `hashPassword()` - Bcrypt password hashing

### 3. API Testing Helpers
- `ApiTestHelper` class for authenticated requests
- `registerStudent()` - Register and authenticate
- `loginStudent()` - Login and get token
- Automatic token management for authenticated endpoints

### 4. Property-Based Testing Arbitraries
- `arbitraryEmail()` - Valid email generators
- `arbitraryPassword()` - Password generators
- `arbitraryInvalidEmail()` - Invalid email generators
- `arbitraryDateRange()` - Date range generators
- `arbitraryDeviceFingerprint()` - Device fingerprint generators
- `runPropertyTest()` - Simplified property test execution

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

### With Coverage
```bash
npm run test:coverage
```

### Specific Test File
```bash
npm test -- --testPathPattern="config.test"
```

### Verbose Output
```bash
npm test -- --verbose
```

## Writing Tests

### Unit Tests
```typescript
import { generateTestEmail, hashPassword } from '../test/helpers';

describe('Password Hashing', () => {
  it('should hash passwords securely', async () => {
    const password = 'myPassword123';
    const hash = await hashPassword(password);
    
    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(20);
  });
});
```

### Property-Based Tests
```typescript
import * as fc from 'fast-check';
import { arbitraryEmail, runPropertyTest } from '../test/helpers';

/**
 * **Validates: Requirements 1.2**
 */
describe('Email Validation Properties', () => {
  it('valid emails should always contain @', async () => {
    await runPropertyTest(
      arbitraryEmail(),
      (email) => email.includes('@')
    );
  });
});
```

### Integration Tests
```typescript
import request from 'supertest';
import { app } from '../app';
import { generateTestEmail, generateTestPassword } from '../test/helpers';
import { beforeEachTest, afterAllTests } from '../test/config/database';

describe('Authentication API', () => {
  beforeEach(async () => {
    await beforeEachTest(); // Clean database
  });

  afterAll(async () => {
    await afterAllTests(); // Disconnect
  });

  it('should register a new student', async () => {
    const email = generateTestEmail();
    const password = generateTestPassword();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    expect(response.body.student.email).toBe(email);
  });
});
```

## Test Database Setup

1. **Configure Test Database**
   - Copy `.env.example` to `.env.test`
   - Update `TEST_DATABASE_URL` with separate test database
   - Ensure test database is isolated from development data

2. **Run Migrations**
   ```bash
   npm run prisma:migrate
   ```

3. **Generate Prisma Client**
   ```bash
   npm run prisma:generate
   ```

## Best Practices

### Test Isolation
- Each test should be independent
- Use `beforeEach` to clean database state
- Avoid shared state between tests

### Test Naming
- Use descriptive names: "should [expected behavior] when [condition]"
- Group related tests in `describe` blocks

### Property-Based Tests
- Link to requirements using validation comments
- Use appropriate number of test runs (default: 100)
- Consider edge cases in custom arbitraries

### Database Tests
- Always clean up test data
- Use transactions when possible
- Don't pollute test database

### Assertions
- Make specific assertions
- Test both success and failure cases
- Verify error messages and codes

## Troubleshooting

### Tests Hanging
- Ensure database connections are closed
- Use `afterAll` to disconnect
- Check with `jest --detectOpenHandles`

### Database Errors
- Verify test database is accessible
- Check `TEST_DATABASE_URL` configuration
- Ensure migrations are up to date

### Import Errors
- Run `npm install` to ensure all dependencies
- Check TypeScript configuration
- Verify import paths

### Slow Tests
- Reduce property-based test runs
- Use database transactions for cleanup
- Profile with `jest --verbose`

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:
- `coverage/lcov-report/index.html` - HTML coverage report
- `coverage/lcov.info` - LCOV format for CI/CD
- `coverage/coverage-final.json` - JSON format

Open HTML report:
```bash
open coverage/lcov-report/index.html
```

## Next Steps

The testing infrastructure is now ready for implementing:
- Authentication service tests (Task 2.x)
- Device management tests (Task 3.x)
- Subscription management tests (Task 5.x)
- Content management tests (Task 6.x)
- API endpoint tests (Tasks 7.x, 9.x)

Refer to the `src/test/README.md` for detailed usage examples and patterns.
