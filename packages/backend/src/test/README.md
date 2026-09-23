# Backend Testing Infrastructure

This directory contains the testing infrastructure for the Educational Notes Platform backend.

## Overview

The testing setup includes:
- **Jest** for test runner and assertions
- **ts-jest** for TypeScript support
- **Supertest** for API/integration testing
- **fast-check** for property-based testing
- **@faker-js/faker** for generating test data
- **Database helpers** for managing test database state

## Directory Structure

```
src/test/
├── config/
│   └── database.ts          # Test database configuration and helpers
├── helpers/
│   ├── testData.ts          # Test data generation with faker
│   ├── apiHelpers.ts        # Supertest API testing helpers
│   ├── propertyHelpers.ts   # fast-check property testing helpers
│   └── index.ts             # Centralized exports
├── examples/
│   ├── unit.test.ts         # Unit test examples
│   ├── property.test.ts     # Property-based test examples
│   └── integration.test.ts  # Integration test examples (template)
├── setup.ts                 # Global test setup
└── README.md                # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Database Setup

### Configuration

1. Copy `.env.example` to `.env.test`
2. Update `TEST_DATABASE_URL` to point to a separate test database
3. The test database should be isolated from development data

### Database Helpers

```typescript
import { 
  getTestDatabaseClient, 
  cleanupTestDatabase,
  beforeEachTest,
  afterAllTests 
} from './test/config/database';

describe('My Test Suite', () => {
  beforeEach(async () => {
    await beforeEachTest(); // Cleans database before each test
  });

  afterAll(async () => {
    await afterAllTests(); // Disconnects after all tests
  });

  it('should test something', async () => {
    const db = getTestDatabaseClient();
    // Use db for test operations
  });
});
```

## Writing Tests

### Unit Tests

Unit tests focus on individual functions or modules in isolation:

```typescript
import { generateTestEmail, hashPassword } from '../helpers';

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

Property-based tests verify that properties hold across many generated inputs:

```typescript
import * as fc from 'fast-check';
import { arbitraryEmail, runPropertyTest } from '../helpers';

describe('Email Validation Properties', () => {
  it('valid emails should always contain @', async () => {
    await runPropertyTest(
      arbitraryEmail(),
      (email) => email.includes('@')
    );
  });
});
```

**Note:** Property-based tests should include requirement validation comments:
```typescript
/**
 * **Validates: Requirements 1.2, 1.3**
 */
```

### Integration Tests

Integration tests verify API endpoints using supertest:

```typescript
import request from 'supertest';
import { createApiHelper, generateTestEmail } from '../helpers';

describe('Authentication API', () => {
  it('should register a new student', async () => {
    const email = generateTestEmail();
    const password = 'validPassword123';

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    expect(response.body.student.email).toBe(email);
  });
});
```

## Test Data Generation

The `testData` helper provides functions for generating realistic test data:

```typescript
import {
  generateTestEmail,
  generateTestPassword,
  generateStudentData,
  generateSubjectData,
  generateActiveSubscriptionDates,
} from '../helpers';

// Generate individual fields
const email = generateTestEmail();
const password = generateTestPassword();

// Generate complete objects
const studentData = generateStudentData();

// Generate date ranges
const { startDate, endDate } = generateActiveSubscriptionDates();
```

## Property-Based Testing Arbitraries

Custom arbitraries for domain-specific types:

```typescript
import {
  arbitraryEmail,
  arbitraryPassword,
  arbitraryInvalidEmail,
  arbitraryDateRange,
  arbitraryDeviceFingerprint,
} from '../helpers';

// Use in fast-check properties
await fc.assert(
  fc.asyncProperty(
    arbitraryEmail(),
    arbitraryPassword(),
    async (email, password) => {
      // Test logic here
      return true;
    }
  )
);
```

## API Testing Helpers

The `ApiTestHelper` class simplifies authenticated API testing:

```typescript
import { createApiHelper } from '../helpers';

const api = createApiHelper(app);

// Register and authenticate
await api.registerStudent('test@example.com', 'password123');

// Make authenticated requests
const response = await api.get('/api/students/me');

// The token is automatically included in requests
```

## Best Practices

### Test Isolation
- Each test should be independent and not rely on other tests
- Use `beforeEach` to clean up database state
- Avoid shared state between tests

### Test Naming
- Use descriptive test names that explain what is being tested
- Follow the pattern: "should [expected behavior] when [condition]"

### Assertions
- Make specific assertions about expected behavior
- Test both success and failure cases
- Verify error messages and codes

### Database Tests
- Always clean up test data after tests
- Use transactions when possible for faster cleanup
- Don't pollute the test database with stale data

### Property-Based Tests
- Start with simple properties
- Use appropriate number of test runs (default: 100)
- Consider edge cases in custom arbitraries
- Link tests to requirements using validation comments

### Coverage
- Aim for high coverage of business logic
- Don't focus solely on coverage percentage
- Prioritize testing critical paths and edge cases

## Configuration

### Jest Configuration

The Jest configuration is in `jest.config.js`:
- Uses `ts-jest` preset for TypeScript support
- Test files match `*.test.ts` or `*.spec.ts` patterns
- Setup file runs before all tests
- Coverage reports generated in `coverage/` directory

### Environment Variables

Test-specific environment variables in `.env.test`:
- `TEST_DATABASE_URL`: Separate database for testing
- `NODE_ENV=test`: Ensures test mode
- `JWT_SECRET`: Test JWT secret (not for production)
- `DEBUG_SQL`: Set to `true` to see SQL queries in test output

## Troubleshooting

### Tests Hanging
- Ensure database connections are properly closed
- Use `afterAll` to disconnect from database
- Check for open handles with `jest --detectOpenHandles`

### Database Errors
- Verify test database is running and accessible
- Check `TEST_DATABASE_URL` is correctly configured
- Ensure migrations are up to date
- Try manually cleaning the test database

### Import Errors
- Ensure all dependencies are installed: `npm install`
- Check TypeScript configuration in `tsconfig.json`
- Verify file paths in import statements

### Slow Tests
- Reduce number of property-based test runs
- Use database transactions for cleanup
- Consider using in-memory database for unit tests
- Profile tests with `jest --verbose`

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [fast-check Documentation](https://github.com/dubzzz/fast-check)
- [Faker.js Documentation](https://fakerjs.dev/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
