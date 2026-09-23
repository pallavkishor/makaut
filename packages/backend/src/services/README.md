# Authentication Service

## Overview

The authentication service provides three core functions for the Educational Notes Platform:

1. **Student Registration** - Creates new student accounts with email validation and password hashing
2. **Student Login** - Authenticates students and generates 24-hour session tokens
3. **Admin Login** - Authenticates administrators and generates 30-minute session tokens

## Files Created

### Core Service
- **`auth.ts`** - Main authentication service implementation
  - `registerStudent(email, password)` - Registers new students
  - `loginStudent(email, password)` - Authenticates students  
  - `loginAdmin(email, password)` - Authenticates administrators
  - Dependency injection support via `setPrismaClient()` for testing

### Database Configuration
- **`../config/database.ts`** - Database client singleton for production use
  - `getDatabaseClient()` - Returns Prisma client instance
  - `disconnectDatabase()` - Cleanup function

### Tests
- **`auth.test.ts`** - Comprehensive unit tests covering:
  - Registration success cases
  - Registration validation (email format, duplicates, password length)
  - Login success cases  
  - Login failure cases (wrong password, non-existent user)
  - Token expiration verification
  - Admin/student separation
  - Edge cases

### Exports
- **`index.ts`** - Service module exports

## Implementation Details

### Task 2.7: Student Registration
✅ **Implemented**

The `registerStudent` function:
- Validates email format using the existing `validateEmail()` utility
- Checks for duplicate emails in the database
- Hashes passwords using bcrypt (cost factor 12) via `hashPassword()` utility
- Creates student account in database
- Generates 24-hour JWT session token
- Returns student data and session information

**Requirements Satisfied:** 1.1, 1.2, 1.3, 1.4

### Task 2.9: Student Login  
✅ **Implemented**

The `loginStudent` function:
- Validates credentials against database
- Uses constant-time password comparison via `verifyPassword()` utility
- Generates new 24-hour JWT session token on each login
- Returns user data and session information
- Uses generic error messages to prevent user enumeration

**Requirements Satisfied:** 1.5, 1.6, 1.7

### Task 2.11: Admin Login
✅ **Implemented**

The `loginAdmin` function:
- Authenticates against separate `administrators` table
- Uses same secure password verification as student login
- Generates 30-minute JWT session token (different from student timeout)
- Returns user data with `userType: 'admin'`
- Maintains separation from student authentication

**Requirements Satisfied:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

## Security Features

✅ **Password Hashing**: bcrypt with salt rounds = 12  
✅ **Email Validation**: RFC 5322 compliant regex  
✅ **Duplicate Prevention**: Database unique constraint + application check  
✅ **User Enumeration Protection**: Generic error messages  
✅ **Token Security**: JWT with user type embedded  
✅ **Session Timeout**: 24h for students, 30m for admins  

## Dependencies Used

All dependencies were already implemented:

- `../config/database` - Database client management
- `../utils/password` - Password hashing/verification (bcrypt)
- `../utils/email` - Email validation
- `../utils/jwt` - JWT token generation/validation
- `@prisma/client` - Database ORM

## Testing

### Test Configuration
Tests use the test database setup from `../test/config/database`:
- Separate test database connection
- Automatic cleanup between tests
- Dependency injection pattern for testability

### Running Tests

```bash
# Requires PostgreSQL running with test database configured
npm test -- auth.test.ts
```

### Test Coverage
- ✅ 21 test cases written
- ✅ All success paths covered
- ✅ All validation failures covered
- ✅ Edge cases and boundary conditions tested
- ⚠️ Requires database to run (currently not available)

### Test Status
Tests are **complete and ready to run** but require database setup:
1. Start PostgreSQL server
2. Configure TEST_DATABASE_URL in `.env.test`
3. Run migrations: `npm run prisma:migrate`
4. Run tests: `npm test -- auth.test.ts`

## API Usage Examples

### Register New Student
```typescript
import { registerStudent } from './services/auth';

const result = await registerStudent(
  'student@example.com',
  'password123'
);

console.log(result.student.id);      // UUID
console.log(result.student.email);   // 'student@example.com'
console.log(result.session.token);   // JWT token
console.log(result.session.expiresAt); // Date (24h from now)
```

### Student Login
```typescript
import { loginStudent } from './services/auth';

const result = await loginStudent(
  'student@example.com',
  'password123'
);

console.log(result.user.userType);   // 'student'
console.log(result.session.token);   // JWT token
```

### Admin Login
```typescript
import { loginAdmin } from './services/auth';

const result = await loginAdmin(
  'admin@example.com',
  'adminpass'
);

console.log(result.user.userType);   // 'admin'
console.log(result.session.expiresAt); // Date (30min from now)
```

## Error Handling

All functions throw descriptive errors:

```typescript
// Invalid email format
throw new Error('Invalid email format');

// Duplicate registration
throw new Error('Email address already registered');

// Password too short (from hashPassword utility)
throw new Error('Password must be at least 8 characters long');

// Invalid credentials (generic message for security)
throw new Error('Invalid email or password');
```

## Next Steps

To complete the authentication flow:

1. **Database Setup**: Ensure PostgreSQL is running and migrations are applied
2. **Run Tests**: Verify all 21 tests pass with database connection
3. **API Endpoints**: Create Express routes that call these service functions (Task 7.1)
4. **Rate Limiting**: Integrate with existing rate limiter middleware (already implemented)
5. **Session Storage**: Optionally store sessions in database using the sessions table

## Architecture Notes

### Dependency Injection Pattern
The service uses dependency injection to allow testing with a test database:

```typescript
// In tests
setPrismaClient(testDbClient);

// In production
// Uses getDatabaseClient() automatically
```

### Separation of Concerns
- **Service Layer**: Business logic (this file)
- **Utilities**: Reusable functions (password, email, JWT)
- **Database**: Data access (Prisma)
- **API Layer**: HTTP endpoints (to be implemented)

This separation ensures the service is testable and reusable across different contexts.
