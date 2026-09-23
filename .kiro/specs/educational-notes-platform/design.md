# Design Document: Educational Notes Platform

## 1. System Overview

The Educational Notes Platform is a web-based subscription system for delivering educational content. It consists of two separate web applications:

1. **Student Platform**: A public-facing application where students register, subscribe to subjects, and access educational notes
2. **Admin Panel**: A management application where administrators create content, manage students, and control subscriptions

The system enforces device-based access control (maximum 2 devices per student) and time-based subscription access to prevent unauthorized sharing while maintaining legitimate multi-device usage.

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│                     │         │                     │
│  Student Platform   │         │   Admin Panel       │
│   (React/Next.js)   │         │   (React/Next.js)   │
│                     │         │                     │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │                               │
           └───────────┬───────────────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │                       │
           │   Backend API Server  │
           │   (Node.js/Express)   │
           │                       │
           └───────────┬───────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
    ┌─────────────┐       ┌──────────────┐
    │             │       │              │
    │  PostgreSQL │       │ File Storage │
    │  Database   │       │   (S3/local) │
    │             │       │              │
    └─────────────┘       └──────────────┘
```

### 2.2 Technology Stack

**Frontend (Both Applications)**
- React 18+ for UI components
- Next.js for server-side rendering and routing
- TypeScript for type safety
- TailwindCSS for styling
- React Query for server state management
- Zod for runtime validation

**Backend**
- Node.js with Express.js framework
- TypeScript for type safety
- Prisma ORM for database access
- PostgreSQL for data persistence
- bcrypt for password hashing
- jsonwebtoken for session management
- FingerprintJS for device identification
- Express Rate Limit for rate limiting

**File Storage**
- AWS S3 or local filesystem for images
- Multipart upload support

**Security**
- HTTPS/TLS for all communications
- CORS configuration for cross-origin requests
- Helmet.js for security headers
- Input sanitization middleware

## 3. Component Design

### 3.1 Authentication System

**Purpose**: Manages user identity verification and session management for both students and administrators.

**Responsibilities**:
- User registration and login
- Password hashing and verification
- Session token generation and validation
- Rate limiting on authentication attempts
- Separate authentication flows for students and administrators

**Key Interfaces**:

```typescript
interface AuthenticationSystem {
  // Student authentication
  registerStudent(email: string, password: string): Promise<Student>;
  authenticateStudent(email: string, password: string): Promise<SessionToken>;
  
  // Administrator authentication
  authenticateAdmin(email: string, password: string): Promise<SessionToken>;
  
  // Session management
  validateSession(token: string): Promise<User>;
  terminateSession(token: string): Promise<void>;
  
  // Security
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  checkRateLimit(identifier: string): Promise<boolean>;
}

interface SessionToken {
  token: string;
  userId: string;
  userType: 'student' | 'admin';
  expiresAt: Date;
}

interface Student {
  id: string;
  email: string;
  passwordHash: string;
  registeredAt: Date;
}
```

**Implementation Details**:
- Passwords hashed using bcrypt with automatic salt generation (cost factor: 12)
- Session tokens are JWTs with 24-hour expiration for students, 30-minute inactivity timeout for admins
- Rate limiting: 5 failed attempts per email address per 15-minute window results in temporary block
- Email validation using regex pattern matching RFC 5322 specification
- Password minimum length: 8 characters

### 3.2 Device Manager

**Purpose**: Tracks and enforces device limits per student account using device fingerprinting.

**Responsibilities**:
- Device identification via fingerprinting
- Device registration and storage
- Device limit enforcement (2 devices per account)
- Device revocation (manual or via session termination)
- Active session tracking per device

**Key Interfaces**:

```typescript
interface DeviceManager {
  identifyDevice(request: Request): string; // Returns device fingerprint
  registerDevice(studentId: string, fingerprint: string): Promise<RegisteredDevice>;
  getRegisteredDevices(studentId: string): Promise<RegisteredDevice[]>;
  revokeDevice(studentId: string, deviceId: string): Promise<void>;
  canLoginFromDevice(studentId: string, fingerprint: string): Promise<boolean>;
  terminateDeviceSessions(deviceId: string): Promise<void>;
}

interface RegisteredDevice {
  id: string;
  studentId: string;
  fingerprint: string;
  registeredAt: Date;
  lastAccessedAt: Date;
}
```

**Implementation Details**:
- Device fingerprinting using FingerprintJS or custom implementation combining:
  - User-Agent string
  - Screen resolution
  - Timezone
  - Canvas fingerprint
  - WebGL fingerprint
- Automatic registration on first login if under limit
- Hard limit of 2 devices enforced at login time
- Device revocation immediately terminates all sessions for that device

### 3.3 Subscription Manager

**Purpose**: Manages time-based access grants to subjects for students.

**Responsibilities**:
- Subscription creation and storage
- Active subscription determination based on current time
- Access control validation
- Subscription expiration handling
- Subscription extension and cancellation

**Key Interfaces**:

```typescript
interface SubscriptionManager {
  createSubscription(
    studentId: string,
    subjectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Subscription>;
  
  getActiveSubscriptions(studentId: string): Promise<Subscription[]>;
  hasActiveSubscription(studentId: string, subjectId: string): Promise<boolean>;
  extendSubscription(subscriptionId: string, newEndDate: Date): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  listAllSubscriptions(filters?: SubscriptionFilters): Promise<Subscription[]>;
}

interface Subscription {
  id: string;
  studentId: string;
  subjectId: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

interface SubscriptionFilters {
  studentId?: string;
  subjectId?: string;
  activeOnly?: boolean;
}
```

**Implementation Details**:
- Active subscription defined as: `currentDateTime >= startDate AND currentDateTime <= endDate`
- Date validation: `endDate` must be after `startDate`
- Cancellation sets `endDate` to current timestamp
- No automatic notification system (future enhancement)
- Database index on `studentId` and `subjectId` for query performance

### 3.4 Content Management System

**Purpose**: Handles creation, storage, organization, and retrieval of educational content.

**Responsibilities**:
- Subject creation and management
- Note creation, editing, and deletion
- Rich text content storage
- Image upload and storage
- Hierarchical content organization
- Content search functionality

**Key Interfaces**:

```typescript
interface ContentManagementSystem {
  // Subject management
  createSubject(name: string): Promise<Subject>;
  getSubject(id: string): Promise<Subject>;
  updateSubject(id: string, name: string): Promise<Subject>;
  deleteSubject(id: string): Promise<void>;
  listSubjects(): Promise<Subject[]>;
  
  // Note management
  createNote(subjectId: string, title: string, content: string): Promise<Note>;
  getNote(id: string): Promise<Note>;
  updateNote(id: string, title: string, content: string): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  getNotesForSubject(subjectId: string): Promise<Note[]>;
  
  // Search
  searchNotes(subjectId: string, query: string): Promise<Note[]>;
  
  // Media management
  uploadImage(file: Buffer, filename: string): Promise<string>; // Returns URL
}

interface Subject {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Note {
  id: string;
  subjectId: string;
  title: string;
  content: string; // HTML or Markdown
  createdAt: Date;
  updatedAt: Date;
}
```

**Implementation Details**:
- Note content stored as HTML with sanitization to prevent XSS
- Rich text editor: TipTap or Quill for consistent formatting
- Supported formatting: headings (h1-h6), bold, italic, underline, lists (ordered/unordered), links, images
- Images stored in separate storage layer with URLs embedded in content
- Cascading deletion: deleting a subject deletes all associated notes
- Search implementation: PostgreSQL full-text search or dedicated search service (Elasticsearch)
- Content sanitization using DOMPurify on server-side before storage

### 3.5 Student Platform Frontend

**Purpose**: Public-facing web application for students to access educational content.

**Key Pages and Features**:

1. **Registration Page** (`/register`)
   - Email and password input fields
   - Client-side validation (email format, password length)
   - Error display for registration failures

2. **Login Page** (`/login`)
   - Email and password input fields
   - Error display for authentication failures and device limit blocks

3. **Dashboard** (`/dashboard`)
   - List of subjects with active subscriptions
   - Subscription expiration dates
   - Quick access to recently viewed notes

4. **Subject View** (`/subject/:id`)
   - Hierarchical note navigation
   - Search functionality within subject
   - Note list with titles

5. **Note View** (`/note/:id`)
   - Rendered note content with formatting
   - Image display
   - Navigation to previous/next note

6. **Account Settings** (`/settings`)
   - Registered devices list with registration dates
   - Device revocation controls

**State Management**:
- React Context for authentication state
- React Query for server data (subjects, notes, subscriptions)
- Local storage for session token persistence

**Protected Routes**:
- All routes except `/register` and `/login` require authentication
- Subject and note routes require active subscription verification

### 3.6 Admin Panel Frontend

**Purpose**: Administrative web application for content and user management.

**Key Pages and Features**:

1. **Admin Login** (`/admin/login`)
   - Separate authentication from student platform
   - 30-minute session timeout with redirect

2. **Student Management** (`/admin/students`)
   - Paginated student list
   - Email search functionality
   - Student detail view with:
     - Registration information
     - Active subscriptions
     - Registered devices with revocation controls

3. **Subject Management** (`/admin/subjects`)
   - Subject list with creation controls
   - Subject editing interface
   - Subject deletion with confirmation

4. **Note Editor** (`/admin/notes`)
   - Rich text editor (TipTap)
   - Subject association selector
   - Image upload functionality
   - Note deletion with confirmation

5. **Subscription Management** (`/admin/subscriptions`)
   - Subscription creation form (student selector, subject selector, date pickers)
   - Subscription list with filtering by student/subject
   - Subscription extension interface
   - Immediate cancellation control

**State Management**:
- React Context for admin authentication state
- React Query for server data with automatic revalidation
- Session timeout handler with warning modal at 25 minutes

## 4. Data Models

### 4.1 Database Schema

```sql
-- Students table
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Administrators table
CREATE TABLE administrators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Registered devices table
CREATE TABLE registered_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fingerprint VARCHAR(512) NOT NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, fingerprint)
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('student', 'admin')),
  token VARCHAR(512) UNIQUE NOT NULL,
  device_id UUID REFERENCES registered_devices(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Subjects table
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notes table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- Indexes for performance
CREATE INDEX idx_devices_student ON registered_devices(student_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id, user_type);
CREATE INDEX idx_notes_subject ON notes(subject_id);
CREATE INDEX idx_subscriptions_student ON subscriptions(student_id);
CREATE INDEX idx_subscriptions_subject ON subscriptions(subject_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(student_id, subject_id, start_date, end_date);
```

### 4.2 Data Validation Rules

**Students**:
- Email: Must match email format regex, maximum 255 characters
- Password: Minimum 8 characters (enforced at application layer)
- Email uniqueness enforced at database level

**Registered Devices**:
- Maximum 2 devices per student (enforced at application layer)
- Fingerprint stored as string, maximum 512 characters
- Unique constraint on (student_id, fingerprint) pair

**Subscriptions**:
- End date must be after start date (enforced at database level)
- Student and subject must exist (foreign key constraints)
- One student can have multiple subscriptions to same subject (different time periods)

**Subjects and Notes**:
- Subject names required, maximum 255 characters
- Note titles required, maximum 500 characters
- Note content stored as TEXT (no hard limit, but application should warn for very large content)

## 5. API Design

### 5.1 RESTful Endpoints

**Authentication Endpoints**

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
POST   /api/admin/auth/login
POST   /api/admin/auth/logout
```

**Student Endpoints** (Requires student authentication)

```
GET    /api/students/me
GET    /api/students/me/subscriptions
GET    /api/students/me/devices
DELETE /api/students/me/devices/:deviceId
```

**Subject Endpoints** (Student access)

```
GET    /api/subjects                    # Returns only subjects with active subscriptions
GET    /api/subjects/:id                # Requires active subscription
GET    /api/subjects/:id/notes          # Requires active subscription
GET    /api/subjects/:id/search?q=...   # Requires active subscription
```

**Note Endpoints** (Student access)

```
GET    /api/notes/:id                   # Requires active subscription to note's subject
```

**Admin Student Management**

```
GET    /api/admin/students
GET    /api/admin/students/:id
GET    /api/admin/students/search?email=...
GET    /api/admin/students/:id/devices
DELETE /api/admin/students/:id/devices/:deviceId
```

**Admin Subject Management**

```
GET    /api/admin/subjects
POST   /api/admin/subjects
GET    /api/admin/subjects/:id
PUT    /api/admin/subjects/:id
DELETE /api/admin/subjects/:id
```

**Admin Note Management**

```
GET    /api/admin/notes
POST   /api/admin/notes
GET    /api/admin/notes/:id
PUT    /api/admin/notes/:id
DELETE /api/admin/notes/:id
POST   /api/admin/notes/images          # Image upload
```

**Admin Subscription Management**

```
GET    /api/admin/subscriptions?studentId=...&subjectId=...
POST   /api/admin/subscriptions
GET    /api/admin/subscriptions/:id
PUT    /api/admin/subscriptions/:id     # For extending end date
DELETE /api/admin/subscriptions/:id     # For cancellation
```

### 5.2 Example Request/Response

**POST /api/auth/register**

Request:
```json
{
  "email": "student@example.com",
  "password": "securepassword123"
}
```

Response (201 Created):
```json
{
  "student": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "student@example.com",
    "registeredAt": "2024-01-15T10:30:00Z"
  },
  "session": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2024-01-16T10:30:00Z"
  }
}
```

**POST /api/admin/subscriptions**

Request:
```json
{
  "studentId": "123e4567-e89b-12d3-a456-426614174000",
  "subjectId": "987fcdeb-51a2-43f1-b789-123456789abc",
  "startDate": "2024-01-15T00:00:00Z",
  "endDate": "2024-07-15T23:59:59Z"
}
```

Response (201 Created):
```json
{
  "subscription": {
    "id": "456e7890-e12b-34d5-c678-901234567def",
    "studentId": "123e4567-e89b-12d3-a456-426614174000",
    "subjectId": "987fcdeb-51a2-43f1-b789-123456789abc",
    "startDate": "2024-01-15T00:00:00Z",
    "endDate": "2024-07-15T23:59:59Z",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### 5.3 Error Response Format

All errors follow consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is invalid",
    "details": {
      "field": "email",
      "value": "invalid-email"
    }
  }
}
```

Common error codes:
- `VALIDATION_ERROR`: Invalid input data
- `AUTHENTICATION_FAILED`: Invalid credentials
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource does not exist
- `DEVICE_LIMIT_REACHED`: Cannot register more devices
- `NO_ACTIVE_SUBSCRIPTION`: Access denied due to expired/missing subscription
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

## 6. Security Considerations

### 6.1 Authentication Security

- Passwords hashed with bcrypt (cost factor 12) with automatic salting
- Session tokens are cryptographically random JWTs
- Rate limiting: 5 failed attempts per 15 minutes triggers 15-minute account lockout
- No password reset functionality in initial version (manual admin intervention)

### 6.2 Authorization

- Student routes validate active subscriptions before serving content
- Admin routes require separate admin authentication
- Session tokens include user type to prevent privilege escalation
- Device-based access control limits account sharing

### 6.3 Data Protection

- All communications over HTTPS/TLS
- Input sanitization on all endpoints using express-validator
- SQL injection prevention via parameterized queries (Prisma ORM)
- XSS prevention via content sanitization (DOMPurify) before storage and output encoding
- CORS configured to allow only trusted frontend domains
- Security headers via Helmet.js (CSP, HSTS, X-Frame-Options, etc.)

### 6.4 Device Fingerprinting Privacy

- Device fingerprints are one-way hashes, not reversible to original browser data
- No personally identifiable information stored in fingerprints
- Fingerprints used solely for access control, not tracking

## 7. Performance Considerations

### 7.1 Database Optimization

- Indexes on frequently queried columns (student_id, subject_id, subscription dates)
- Composite index on subscriptions for active subscription queries
- Connection pooling for database connections
- Query optimization for N+1 problems using Prisma's eager loading

### 7.2 Caching Strategy

- Subject and note content cached in Redis with 15-minute TTL
- Active subscription status cached per user with 5-minute TTL
- Cache invalidation on content updates
- Session data stored in Redis for fast validation

### 7.3 Content Delivery

- Images served via CDN (CloudFront or similar)
- Static assets (CSS, JS) cached with long TTL
- Server-side rendering for initial page load
- Lazy loading for images in note content

### 7.4 Performance Targets

- Note display: < 2 seconds (meets requirement 10.1)
- Search results: < 3 seconds (meets requirement 10.2)
- Note save persistence: < 2 seconds (meets requirement 10.3)
- API response time (non-search): < 500ms for 95th percentile

## 8. Error Handling and Logging

### 8.1 Error Handling Strategy

- All errors caught and wrapped in consistent error response format
- User-friendly messages displayed in UI (no stack traces or technical details)
- Validation errors provide specific field information
- Network errors handled with retry logic (3 attempts with exponential backoff)

### 8.2 Logging

**Log Levels**:
- ERROR: Application errors, unhandled exceptions
- WARN: Authentication failures, rate limit triggers
- INFO: Successful authentication, subscription changes
- DEBUG: Detailed request/response data (development only)

**Log Format**:
```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "ERROR",
  "message": "Database query failed",
  "context": {
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "endpoint": "/api/notes/456",
    "error": "Connection timeout"
  }
}
```

**Logging Infrastructure**:
- Structured JSON logging via Winston or Pino
- Log aggregation via CloudWatch, Datadog, or similar
- Error alerting for ERROR level logs
- Log retention: 30 days for ERROR/WARN, 7 days for INFO/DEBUG

## 9. Deployment Architecture

### 9.1 Infrastructure

**Development Environment**:
- Local development with Docker Compose
- PostgreSQL container
- Redis container
- Local file storage for images

**Production Environment**:
- AWS ECS or similar container orchestration
- AWS RDS PostgreSQL (Multi-AZ for high availability)
- AWS ElastiCache Redis
- AWS S3 for image storage
- AWS CloudFront CDN for static assets
- Application Load Balancer for traffic distribution
- Auto-scaling based on CPU/memory utilization

### 9.2 Deployment Pipeline

1. Code commit triggers CI/CD pipeline (GitHub Actions or similar)
2. Run automated tests (unit, integration, E2E)
3. Build Docker images for frontend and backend
4. Push images to container registry (ECR)
5. Deploy to staging environment
6. Run smoke tests
7. Manual approval gate for production
8. Blue-green deployment to production
9. Monitor error rates and rollback if necessary

### 9.3 Monitoring and Observability

- Application performance monitoring (APM) via Datadog or New Relic
- Uptime monitoring via Pingdom or similar (target: 99.5% availability)
- Custom metrics: active users, subscription expirations, device registrations
- Dashboards for key metrics and SLA tracking
- Alerting on error rates, response time degradation, database connection issues

## 10. Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Email Validation Consistency

*For any* string input to the email validation function, the function SHALL return true if and only if the string matches valid email format according to RFC 5322, and SHALL return false otherwise.

**Validates: Requirements 1.2**

### Property 2: Account Creation for Valid Emails

*For any* valid email address and password meeting minimum requirements, registration SHALL create a new account with the provided email and a hashed version of the password.

**Validates: Requirements 1.3**

### Property 3: Duplicate Email Rejection

*For any* email address that already exists in the system, attempting to register a new account with that email SHALL be rejected with an appropriate error message.

**Validates: Requirements 1.4**

### Property 4: Valid Credential Authentication

*For any* registered student account, submitting the correct email and password combination SHALL successfully authenticate the student and create a valid session token.

**Validates: Requirements 1.6**

### Property 5: Invalid Credential Rejection

*For any* registered student account, submitting the correct email with an incorrect password SHALL reject the authentication attempt.

**Validates: Requirements 1.7**

### Property 6: Password Length Validation

*For any* password string, the authentication system SHALL accept passwords with 8 or more characters and SHALL reject passwords with fewer than 8 characters.

**Validates: Requirements 1.8**

### Property 7: Device Registration Under Limit

*For any* student account with fewer than 2 registered devices and any unrecognized device fingerprint, login SHALL automatically register the new device.

**Validates: Requirements 2.2**

### Property 8: Device Limit Enforcement

*For any* student account with exactly 2 registered devices, attempting to login from a third unrecognized device SHALL be blocked.

**Validates: Requirements 2.3**

### Property 9: Device Revocation Removes Device

*For any* registered device associated with a student account, revoking that device SHALL remove it from the account's registered devices list, regardless of whether revocation is initiated by the student or an administrator.

**Validates: Requirements 2.7, 7.8**

### Property 10: Device Revocation Terminates Sessions

*For any* registered device with active sessions, revoking that device SHALL terminate all active sessions associated with that device.

**Validates: Requirements 2.8**

### Property 11: Subscription Data Integrity

*For any* subscription created in the system, the subscription SHALL be associated with exactly one student, exactly one subject, and SHALL have both a start date and an end date stored.

**Validates: Requirements 3.1, 3.2**

### Property 12: Active Subscription Classification

*For any* subscription and any given current timestamp, the subscription SHALL be classified as active if and only if the current timestamp falls between the subscription's start date (inclusive) and end date (inclusive).

**Validates: Requirements 3.3**

### Property 13: Active Subscription Filtering

*For any* student account, when viewing available subjects, only subjects for which the student has an active subscription SHALL be displayed.

**Validates: Requirements 3.4**

### Property 14: Active Subscription Grants Access

*For any* student with an active subscription to a subject, attempting to access that subject SHALL grant access and display the subject content.

**Validates: Requirements 3.5**

### Property 15: No Subscription Denies Access

*For any* student without an active subscription to a subject, attempting to access that subject SHALL deny access and display an appropriate error message.

**Validates: Requirements 3.6**

### Property 16: Expiration Date Display

*For any* active subscription, when displayed to the student, the system SHALL show the subscription's end date correctly.

**Validates: Requirements 3.7**

### Property 17: Automatic Access Revocation on Expiration

*For any* subscription, once the current time passes the subscription's end date, the subscription SHALL no longer grant access to the associated subject.

**Validates: Requirements 3.8**

### Property 18: All Notes Displayed for Authorized Access

*For any* subject and any student with an active subscription to that subject, accessing the subject SHALL display all notes belonging to that subject.

**Validates: Requirements 4.2**

### Property 19: Note Content Display

*For any* note, when selected by a student with appropriate access, the system SHALL display the complete note content.

**Validates: Requirements 4.4**

### Property 20: Text Formatting Preservation

*For any* note content containing text formatting (headings, bold, italic, lists), storing and retrieving the note SHALL preserve all formatting elements correctly.

**Validates: Requirements 4.5, 6.6**

### Property 21: Image Handling Preservation

*For any* note content containing embedded images, uploading, storing, and retrieving the note SHALL preserve all images and display them correctly.

**Validates: Requirements 4.6, 6.7**

### Property 22: Search Returns Matching Notes

*For any* search query within a subject, the system SHALL return all notes whose title or content contains the search query terms.

**Validates: Requirements 4.8**

### Property 23: Valid Admin Credential Authentication

*For any* registered administrator account, submitting the correct credentials SHALL successfully authenticate the administrator and create a valid admin session.

**Validates: Requirements 5.2**

### Property 24: Invalid Admin Credential Rejection

*For any* registered administrator account, submitting incorrect credentials SHALL reject the authentication attempt.

**Validates: Requirements 5.3**

### Property 25: Subject Creation with Unique Identifier

*For any* valid subject name, creating a subject SHALL store the subject with a unique identifier that distinguishes it from all other subjects.

**Validates: Requirements 6.2**

### Property 26: Note-Subject Association

*For any* note created by an administrator, the note SHALL be correctly associated with its specified subject and retrievable as part of that subject's notes.

**Validates: Requirements 6.4**

### Property 27: Cascading Subject Deletion

*For any* subject with associated notes, deleting the subject SHALL also delete all notes associated with that subject.

**Validates: Requirements 6.10**

### Property 28: Student Information Display

*For any* student account, when viewed in the admin panel, the system SHALL display the student's email address and registration date.

**Validates: Requirements 7.2**

### Property 29: Student Search Returns Matches

*For any* student search query by email address, the system SHALL return all student accounts whose email addresses contain the search query.

**Validates: Requirements 7.4**

### Property 30: Date Range Validation for Subscriptions

*For any* subscription creation attempt where the end date is before the start date, the system SHALL reject the subscription and display an error message.

**Validates: Requirements 8.4**

### Property 31: Valid Subscription Creation

*For any* valid subscription data (existing student, existing subject, valid date range), creating a subscription SHALL successfully store the subscription in the system.

**Validates: Requirements 8.5**

### Property 32: Subscription List Displays Required Information

*For any* subscription displayed in the admin panel, the display SHALL include the student name, subject name, start date, end date, and current status.

**Validates: Requirements 8.6**

### Property 33: Subscription Extension Updates End Date

*For any* existing subscription and any valid new end date, extending the subscription SHALL update the subscription's end date to the new value.

**Validates: Requirements 8.9**

### Property 34: Subscription Cancellation Sets End Date to Now

*For any* active subscription, canceling the subscription SHALL set the subscription's end date to the current date and time.

**Validates: Requirements 8.11**

### Property 35: Salted Password Hashing

*For any* password submitted for storage, the system SHALL hash the password using a salted hashing algorithm such that the same password hashed multiple times produces different hash values (proving salt usage).

**Validates: Requirements 9.1, 9.2**

### Property 36: Unique Session Token Generation

*For any* session created in the system, the session token SHALL be unique and not duplicate any existing session token.

**Validates: Requirements 9.3**

### Property 37: Injection Attack Prevention (Student Platform)

*For any* user input submitted to the student platform, including malicious injection payloads (SQL injection, XSS, command injection), the system SHALL sanitize or reject the input to prevent execution of malicious code.

**Validates: Requirements 9.6**

### Property 38: Injection Attack Prevention (Admin Panel)

*For any* user input submitted to the admin panel, including malicious injection payloads, the system SHALL sanitize or reject the input to prevent execution of malicious code.

**Validates: Requirements 9.7**

### Property 39: User-Friendly Error Messages (Student Platform)

*For any* error that occurs in the student platform, the system SHALL display a user-friendly error message to the user rather than technical details or stack traces.

**Validates: Requirements 10.5**

### Property 40: User-Friendly Error Messages (Admin Panel)

*For any* error that occurs in the admin panel, the system SHALL display a user-friendly error message to the administrator rather than technical details or stack traces.

**Validates: Requirements 10.6**

### Property 41: Error Logging with Context (Student Platform)

*For any* error that occurs in the student platform, the system SHALL log the error with a timestamp and error details to the logging system.

**Validates: Requirements 10.7**

### Property 42: Error Logging with Context (Admin Panel)

*For any* error that occurs in the admin panel, the system SHALL log the error with a timestamp and error details to the logging system.

**Validates: Requirements 10.8**

## 11. Testing Strategy

### 11.1 Testing Approach

The system will use a dual testing approach combining property-based testing and example-based testing:

**Property-Based Testing**: Used for universal properties that should hold across all valid inputs. Properties will be tested with a minimum of 100 iterations using random input generation to verify correctness across a wide range of scenarios.

**Example-Based Testing**: Used for specific scenarios, edge cases, and integration points that require concrete examples rather than universal quantification.

**Integration Testing**: Used for infrastructure components, external service interactions, and performance requirements with 1-3 representative examples.

### 11.2 Property Test Implementation

Each correctness property will be implemented as a property-based test with:

- Random input generators for relevant data types (emails, passwords, dates, user data, content)
- Minimum 100 test iterations per property
- Clear test names matching the property title
- Tags referencing the design property: `Feature: educational-notes-platform, Property {number}: {property_text}`

**Example Property Test Structure** (TypeScript with fast-check):

```typescript
import fc from 'fast-check';

describe('Property 3: Duplicate Email Rejection', () => {
  it('should reject registration attempts with existing emails', () => {
    fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 8, maxLength: 50 }),
        async (email, password) => {
          // Register first account
          await authSystem.registerStudent(email, password);
          
          // Attempt to register duplicate
          const result = await authSystem.registerStudent(email, password);
          
          // Should be rejected
          expect(result.success).toBe(false);
          expect(result.error).toContain('already exists');
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### 11.3 Example-Based Test Cases

**Authentication Edge Cases**:
- Empty email and password
- Email with special characters
- Password exactly 8 characters
- Multiple rapid login attempts (rate limiting)

**Device Management Edge Cases**:
- Simultaneous logins from 2 new devices
- Revoking all devices then attempting login

**Subscription Edge Cases**:
- Subscription starting in future
- Subscription ending in past
- Overlapping subscriptions to same subject

**Content Edge Cases**:
- Notes with very large content (performance)
- Subject deletion with many notes
- Empty search queries

### 11.4 Integration Tests

**Infrastructure Integration**:
- Database connection and query execution
- File upload to S3 or local storage
- Device fingerprinting functionality
- HTTPS enforcement

**Performance Tests**:
- Note display within 2 seconds
- Search results within 3 seconds
- Note save persistence within 2 seconds

**End-to-End Tests**:
- Complete user registration and login flow
- Complete subscription creation and content access flow
- Complete note creation and publication flow

### 11.5 Test Coverage Goals

- Unit test coverage: > 80% for business logic
- Property test coverage: All 42 correctness properties
- Integration test coverage: All critical user flows
- E2E test coverage: Top 10 user journeys

## 12. Future Enhancements

Features intentionally excluded from initial version but considered for future iterations:

1. **Email Notifications**: Subscription expiration reminders, new content notifications
2. **Password Reset**: Self-service password reset via email
3. **Multi-factor Authentication**: Enhanced security for both students and administrators
4. **Mobile Applications**: Native iOS and Android apps
5. **Offline Access**: Download notes for offline viewing
6. **Content Versioning**: Track changes to notes over time
7. **Analytics Dashboard**: Usage statistics, popular subjects, engagement metrics
8. **Bulk Operations**: Batch subscription creation, bulk student imports
9. **Payment Integration**: Automated subscription purchase flow
10. **Discussion Forums**: Student collaboration and Q&A within subjects
11. **Progress Tracking**: Completion status for notes and subjects
12. **Advanced Search**: Full-text search across all subjects, filters, relevance ranking
13. **Content Export**: PDF generation from notes
14. **Role-Based Admin Access**: Different admin permission levels

## 13. Glossary

Refer to Requirements Document glossary for complete term definitions.

## 14. Appendices

### Appendix A: Environment Variables

```
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secret
JWT_SECRET=your-secret-key-here

# File Storage
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Application
NODE_ENV=production
PORT=3000
STUDENT_PLATFORM_URL=https://student.example.com
ADMIN_PANEL_URL=https://admin.example.com

# Security
BCRYPT_ROUNDS=12
SESSION_EXPIRY_HOURS=24
ADMIN_SESSION_TIMEOUT_MINUTES=30
RATE_LIMIT_MAX_ATTEMPTS=5
RATE_LIMIT_WINDOW_MINUTES=15
```

### Appendix B: Database Migrations

Database schema will be managed using Prisma Migrate with version-controlled migration files. Initial migration creates all tables, indexes, and constraints. Subsequent migrations will be created for schema changes with rollback capability.

### Appendix C: API Rate Limiting

**Student Platform**:
- Authentication endpoints: 5 requests per 15 minutes per IP
- Content endpoints: 100 requests per minute per user
- Search endpoints: 20 requests per minute per user

**Admin Panel**:
- Authentication endpoints: 5 requests per 15 minutes per IP
- Content management: 200 requests per minute per admin
- Bulk operations: 10 requests per minute per admin
