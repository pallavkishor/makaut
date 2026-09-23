# Implementation Plan: Educational Notes Platform

## Overview

This implementation plan breaks down the Educational Notes Platform into incremental coding tasks. The system consists of a backend API server (Node.js/Express/TypeScript), a student-facing frontend (Next.js/React/TypeScript), and an admin panel frontend (Next.js/React/TypeScript). The implementation follows a bottom-up approach, starting with foundational infrastructure, then core business logic, followed by API endpoints, and finally the frontend applications.

## Tasks

- [x] 1. Set up project infrastructure and database schema
  - [x] 1.1 Initialize monorepo structure with backend, student-frontend, and admin-frontend packages
    - Create root package.json with workspaces configuration
    - Set up TypeScript configuration for each package
    - Configure ESLint and Prettier for code consistency
    - _Requirements: All requirements depend on proper project setup_

  - [x] 1.2 Set up backend API server structure
    - Initialize Express.js application with TypeScript
    - Configure middleware (CORS, Helmet, body-parser, express-validator)
    - Set up error handling middleware
    - Configure environment variables management (dotenv)
    - _Requirements: 9.4, 9.5, 9.6, 9.7_

  - [x] 1.3 Configure Prisma ORM and create database schema
    - Initialize Prisma with PostgreSQL connection
    - Define Prisma schema matching the design document (students, administrators, registered_devices, sessions, subjects, notes, subscriptions tables)
    - Create database migrations
    - _Requirements: 1.3, 2.7, 3.1, 6.2, 6.4_

  - [x] 1.4 Set up testing infrastructure for backend
    - Install Jest and testing utilities (supertest, @faker-js/faker)
    - Configure Jest for TypeScript
    - Install fast-check for property-based testing
    - Create test database configuration
    - _Requirements: 10.7, 10.8_

- [x] 2. Implement authentication system
  - [x] 2.1 Create password hashing and verification utilities
    - Implement password hashing with bcrypt (cost factor 12)
    - Implement password verification function
    - Implement password length validation (minimum 8 characters)
    - _Requirements: 1.8, 9.1, 9.2_

  - [ ]* 2.2 Write property tests for password utilities
    - **Property 6: Password Length Validation** - For any password string, the system accepts passwords with 8 or more characters and rejects shorter passwords
    - **Validates: Requirements 1.8**

  - [x] 2.3 Create email validation utility
    - Implement RFC 5322 email format validation using regex
    - _Requirements: 1.2_

  - [ ]* 2.4 Write property tests for email validation
    - **Property 1: Email Validation Consistency** - For any string input, email validation returns true if and only if the string matches valid email format
    - **Validates: Requirements 1.2**

  - [x] 2.5 Implement JWT session token generation and validation
    - Create JWT signing utility with 24-hour expiration for students
    - Create JWT signing utility with 30-minute expiration for admins
    - Implement token validation middleware
    - _Requirements: 9.3_

  - [x] 2.6 Implement rate limiting for authentication
    - Configure express-rate-limit for login endpoints
    - Set up 5 attempts per 15 minutes per email address
    - Store rate limit state in memory or Redis
    - _Requirements: 9.8, 9.9_

  - [x] 2.7 Create authentication service for student registration
    - Implement student registration logic (email validation, duplicate check, password hashing, account creation)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.8 Write property tests for student registration
    - **Property 2: Account Creation for Valid Emails** - For any valid email and password meeting requirements, registration creates a new account
    - **Property 3: Duplicate Email Rejection** - For any existing email, registration attempt is rejected with error
    - **Validates: Requirements 1.3, 1.4**

  - [x] 2.9 Create authentication service for student login
    - Implement student login logic (credential validation, session creation)
    - _Requirements: 1.5, 1.6, 1.7_

  - [ ]* 2.10 Write property tests for student login
    - **Property 4: Valid Credential Authentication** - For any registered student, correct credentials successfully authenticate
    - **Property 5: Invalid Credential Rejection** - For any registered student, incorrect password rejects authentication
    - **Validates: Requirements 1.6, 1.7**

  - [x] 2.11 Create authentication service for admin login
    - Implement admin login logic with 30-minute session timeout
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 2.12 Write property tests for admin authentication
    - **Property 23: Valid Admin Credential Authentication** - For any registered administrator, correct credentials successfully authenticate
    - **Validates: Requirements 5.2**

- [x] 3. Implement device management system
  - [x] 3.1 Create device fingerprinting utility
    - Implement FingerprintJS integration or custom fingerprinting from User-Agent, IP, and other headers
    - Generate one-way hash of device characteristics
    - _Requirements: 2.1_

  - [x] 3.2 Implement device registration service
    - Create logic to check device count per student
    - Implement automatic device registration when under limit
    - Implement device limit enforcement (2 devices maximum)
    - _Requirements: 2.2, 2.3_

  - [ ]* 3.3 Write property tests for device registration
    - **Property 7: Device Registration Under Limit** - For any student with fewer than 2 devices, login from new device automatically registers it
    - **Property 8: Device Limit Enforcement** - For any student with 2 devices, login from third device is blocked
    - **Validates: Requirements 2.2, 2.3**

  - [x] 3.4 Implement device revocation service
    - Create logic to remove device from registered devices
    - Implement session termination for revoked devices
    - _Requirements: 2.6, 2.7, 2.8, 7.7, 7.8_

  - [ ]* 3.5 Write property tests for device revocation
    - **Property 9: Device Revocation Removes Device** - For any registered device, revocation removes it from the account
    - **Property 10: Device Revocation Terminates Sessions** - For any device with active sessions, revocation terminates all sessions
    - **Validates: Requirements 2.7, 2.8, 7.8**

  - [x] 3.6 Implement device tracking in login flow
    - Integrate device fingerprinting with student login
    - Update last_accessed_at timestamp on device access
    - _Requirements: 2.1, 2.2, 2.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement subscription management system
  - [x] 5.1 Create subscription service for creation and storage
    - Implement subscription creation with date validation (end date after start date)
    - Store subscription with student ID, subject ID, start date, and end date
    - _Requirements: 3.1, 3.2, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 5.2 Write property tests for subscription creation
    - **Property 11: Subscription Data Integrity** - For any subscription, it is associated with exactly one student and one subject with both dates stored
    - **Validates: Requirements 3.1, 3.2**

  - [x] 5.3 Implement active subscription determination logic
    - Create function to check if current time falls within subscription period
    - Implement subscription filtering for active subscriptions only
    - _Requirements: 3.3_

  - [ ]* 5.4 Write property tests for active subscription logic
    - **Property 12: Active Subscription Classification** - For any subscription and timestamp, subscription is active if and only if timestamp falls between start and end dates
    - **Validates: Requirements 3.3**

  - [x] 5.5 Implement subscription access control service
    - Create middleware to verify active subscription before content access
    - Return appropriate error when subscription is missing or expired
    - _Requirements: 3.5, 3.6, 3.8_

  - [ ]* 5.6 Write property tests for subscription access control
    - **Property 14: Active Subscription Grants Access** - For any student with active subscription, access to subject is granted
    - **Property 15: No Subscription Denies Access** - For any student without active subscription, access to subject is denied
    - **Property 17: Automatic Access Revocation on Expiration** - Once subscription end date passes, access is revoked
    - **Validates: Requirements 3.5, 3.6, 3.8**

  - [x] 5.7 Implement subscription extension service
    - Create logic to update subscription end date
    - _Requirements: 8.8, 8.9_

  - [x] 5.8 Implement subscription cancellation service
    - Create logic to set end date to current timestamp
    - _Requirements: 8.10, 8.11_

  - [x] 5.9 Implement subscription listing and filtering
    - Create service to retrieve subscriptions with optional filters (student ID, subject ID, active only)
    - _Requirements: 8.6, 8.7_

- [x] 6. Implement content management system
  - [x] 6.1 Create subject management service
    - Implement subject creation with name and unique ID
    - Implement subject retrieval, update, and deletion
    - Implement cascading deletion for associated notes
    - _Requirements: 6.1, 6.2, 6.8, 6.9, 6.10_

  - [x] 6.2 Create note management service
    - Implement note creation with subject association
    - Implement note content storage with HTML sanitization (DOMPurify)
    - Implement note retrieval, update, and deletion
    - _Requirements: 6.3, 6.4, 6.5, 6.8, 6.9_

  - [ ]* 6.3 Write property tests for content formatting preservation
    - **Property 20: Text Formatting Preservation** - For any note with formatting, storing and retrieving preserves all formatting elements
    - **Validates: Requirements 4.5, 6.6**

  - [x] 6.3 Implement image upload service
    - Create multipart upload handler for images
    - Store images in S3 or local filesystem
    - Return image URL for embedding in note content
    - _Requirements: 4.6, 6.7_

  - [ ]* 6.4 Write property tests for image handling
    - **Property 21: Image Handling Preservation** - For any note with images, uploading, storing, and retrieving preserves all images
    - **Validates: Requirements 4.6, 6.7**

  - [x] 6.5 Implement note search service
    - Create full-text search using PostgreSQL text search or Elasticsearch
    - Return notes matching search query in title or content
    - _Requirements: 4.7, 4.8_

  - [ ]* 6.6 Write property tests for note search
    - **Property 22: Search Returns Matching Notes** - For any search query, system returns all notes whose title or content contains query terms
    - **Validates: Requirements 4.8**

- [x] 7. Implement student-facing API endpoints
  - [x] 7.1 Create student authentication endpoints
    - POST /api/auth/register - Student registration
    - POST /api/auth/login - Student login with device tracking
    - POST /api/auth/logout - Session termination
    - GET /api/auth/session - Session validation
    - _Requirements: 1.1, 1.5, 1.6, 1.7_

  - [x] 7.2 Create student device management endpoints
    - GET /api/students/me/devices - List registered devices
    - DELETE /api/students/me/devices/:deviceId - Revoke device
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 7.3 Create student profile endpoints
    - GET /api/students/me - Retrieve student profile
    - GET /api/students/me/subscriptions - List active subscriptions with expiration dates
    - _Requirements: 3.4, 3.7_

  - [x] 7.4 Create student subject access endpoints
    - GET /api/subjects - List subjects with active subscriptions only
    - GET /api/subjects/:id - Retrieve subject details (requires active subscription)
    - GET /api/subjects/:id/notes - List notes for subject (requires active subscription)
    - GET /api/subjects/:id/search?q=... - Search notes within subject
    - _Requirements: 3.4, 3.5, 4.1, 4.2, 4.7, 4.8_

  - [ ]* 7.5 Write integration tests for student subject access
    - **Property 13: Active Subscription Filtering** - When viewing subjects, only subjects with active subscriptions are displayed
    - **Property 18: All Notes Displayed for Authorized Access** - For any subject with active subscription, accessing subject displays all notes
    - **Validates: Requirements 3.4, 4.2**

  - [x] 7.6 Create student note access endpoints
    - GET /api/notes/:id - Retrieve note content (requires active subscription to subject)
    - _Requirements: 4.3, 4.4_

  - [ ]* 7.7 Write integration tests for note access
    - **Property 19: Note Content Display** - For any note with appropriate access, system displays complete note content
    - **Validates: Requirements 4.4**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement admin API endpoints
  - [x] 9.1 Create admin authentication endpoints
    - POST /api/admin/auth/login - Admin login
    - POST /api/admin/auth/logout - Admin logout
    - Implement 30-minute inactivity timeout middleware
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 9.2 Create admin student management endpoints
    - GET /api/admin/students - List all students
    - GET /api/admin/students/:id - Retrieve student details
    - GET /api/admin/students/search?email=... - Search students by email
    - GET /api/admin/students/:id/devices - List student's registered devices
    - DELETE /api/admin/students/:id/devices/:deviceId - Revoke student device
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8_

  - [x] 9.3 Create admin subject management endpoints
    - GET /api/admin/subjects - List all subjects
    - POST /api/admin/subjects - Create new subject
    - GET /api/admin/subjects/:id - Retrieve subject details
    - PUT /api/admin/subjects/:id - Update subject name
    - DELETE /api/admin/subjects/:id - Delete subject with cascading note deletion
    - _Requirements: 6.1, 6.2, 6.8, 6.9, 6.10_

  - [x] 9.4 Create admin note management endpoints
    - GET /api/admin/notes - List all notes
    - POST /api/admin/notes - Create new note
    - GET /api/admin/notes/:id - Retrieve note details
    - PUT /api/admin/notes/:id - Update note content
    - DELETE /api/admin/notes/:id - Delete note
    - POST /api/admin/notes/images - Upload image for note content
    - _Requirements: 6.3, 6.4, 6.5, 6.7, 6.8, 6.9_

  - [x] 9.5 Create admin subscription management endpoints
    - GET /api/admin/subscriptions?studentId=...&subjectId=... - List subscriptions with filters
    - POST /api/admin/subscriptions - Create new subscription
    - GET /api/admin/subscriptions/:id - Retrieve subscription details
    - PUT /api/admin/subscriptions/:id - Extend subscription end date
    - DELETE /api/admin/subscriptions/:id - Cancel subscription immediately
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_

  - [ ]* 9.6 Write integration tests for subscription administration
    - **Property 16: Expiration Date Display** - For any active subscription, system shows correct end date
    - **Validates: Requirements 3.7**

- [x] 10. Implement student platform frontend
  - [x] 10.1 Set up Next.js project structure for student platform
    - Initialize Next.js with TypeScript and TailwindCSS
    - Configure React Query for data fetching
    - Set up authentication context with local storage persistence
    - Configure protected route wrapper component
    - _Requirements: 1.1, 1.5_

  - [x] 10.2 Create registration and login pages
    - Build /register page with email and password form
    - Build /login page with email and password form
    - Implement client-side validation
    - Implement error display for authentication failures
    - Store session token in local storage
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.7, 2.4_

  - [x] 10.3 Create student dashboard page
    - Build /dashboard page showing subscribed subjects
    - Display subscription expiration dates
    - Implement protected route (requires authentication)
    - _Requirements: 3.4, 3.7_

  - [x] 10.4 Create subject view page
    - Build /subject/:id page with note list
    - Implement hierarchical note navigation
    - Add search functionality within subject
    - Implement subscription check and access denial message
    - _Requirements: 3.5, 3.6, 4.1, 4.2, 4.3, 4.7_

  - [x] 10.5 Create note view page
    - Build /note/:id page displaying note content
    - Render HTML content with formatting preservation
    - Display embedded images
    - Implement previous/next note navigation
    - _Requirements: 4.4, 4.5, 4.6_

  - [x] 10.6 Create account settings page
    - Build /settings page showing registered devices
    - Display registration dates for each device
    - Implement device revocation controls
    - _Requirements: 2.5, 2.6, 2.7_

  - [ ]* 10.7 Write end-to-end tests for student platform
    - Test registration and login flow
    - Test subject and note access with subscription validation
    - Test device management functionality

- [x] 11. Implement admin panel frontend
  - [x] 11.1 Set up Next.js project structure for admin panel
    - Initialize Next.js with TypeScript and TailwindCSS
    - Configure React Query for data fetching
    - Set up admin authentication context
    - Implement 30-minute session timeout with warning modal at 25 minutes
    - Configure protected route wrapper for all admin routes
    - _Requirements: 5.1, 5.4, 5.5, 5.6_

  - [x] 11.2 Create admin login page
    - Build /admin/login page with credentials form
    - Implement authentication error display
    - Separate from student authentication flow
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.3 Create student management interface
    - Build /admin/students page with paginated student list
    - Implement email search functionality
    - Create student detail view showing registration info, subscriptions, and devices
    - Implement device revocation controls for administrators
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 11.4 Create subject management interface
    - Build /admin/subjects page with subject list
    - Implement subject creation form
    - Implement subject editing interface
    - Implement subject deletion with confirmation modal
    - _Requirements: 6.1, 6.2, 6.8, 6.9, 6.10_

  - [x] 11.5 Create note editor interface
    - Build /admin/notes page with note list
    - Integrate TipTap rich text editor
    - Implement subject association selector
    - Implement image upload functionality
    - Implement note deletion with confirmation modal
    - Support formatting: headings, bold, italic, lists, links, images
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 11.6 Create subscription management interface
    - Build /admin/subscriptions page with subscription list
    - Implement subscription creation form with student selector, subject selector, and date pickers
    - Implement date validation (end date after start date)
    - Implement filtering by student and subject
    - Implement subscription extension interface
    - Implement immediate cancellation control
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_

  - [ ]* 11.7 Write end-to-end tests for admin panel
    - Test admin authentication with session timeout
    - Test student management features
    - Test content creation and editing workflow
    - Test subscription management workflow

- [x] 12. Implement error handling and logging
  - [x] 12.1 Configure structured logging for backend
    - Set up Winston or Pino for JSON logging
    - Implement log levels (ERROR, WARN, INFO, DEBUG)
    - Configure log aggregation for production
    - _Requirements: 10.7, 10.8_

  - [x] 12.2 Implement consistent error response formatting
    - Create error handler middleware for all API endpoints
    - Implement error codes (VALIDATION_ERROR, AUTHENTICATION_FAILED, etc.)
    - Ensure user-friendly error messages without technical details
    - _Requirements: 10.5, 10.6_

  - [x] 12.3 Implement error display in frontends
    - Create reusable error display components
    - Implement network retry logic with exponential backoff
    - _Requirements: 10.5, 10.6_

- [x] 13. Final integration and deployment preparation
  - [x] 13.1 Set up Docker Compose for local development
    - Create Dockerfile for backend API
    - Create Dockerfile for student frontend
    - Create Dockerfile for admin frontend
    - Create docker-compose.yml with PostgreSQL, Redis, and all services

  - [x] 13.2 Create database seed script for initial admin user
    - Generate initial administrator account with hashed password
    - Provide instructions for first-time setup

  - [x] 13.3 Write deployment documentation
    - Document environment variables required for each service
    - Document database migration process
    - Document production deployment steps

  - [ ]* 13.4 Write performance tests
    - Test note display response time (target: < 2 seconds)
    - Test search response time (target: < 3 seconds)
    - Test note save persistence (target: < 2 seconds)
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property-based tests validate universal correctness properties from the design document
- Unit tests and integration tests validate specific examples and edge cases
- The implementation follows a bottom-up approach: infrastructure → business logic → API → frontends
- All code should use TypeScript for type safety
- Security best practices (HTTPS, input validation, password hashing) are integrated throughout
- Performance targets are tested in optional performance test tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5", "2.6"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.7", "2.9", "2.11"] },
    { "id": 4, "tasks": ["2.8", "2.10", "2.12", "3.1"] },
    { "id": 5, "tasks": ["3.2", "3.4"] },
    { "id": 6, "tasks": ["3.3", "3.5", "3.6"] },
    { "id": 7, "tasks": ["5.1", "5.3"] },
    { "id": 8, "tasks": ["5.2", "5.4", "5.5", "5.7", "5.8", "5.9"] },
    { "id": 9, "tasks": ["5.6", "6.1", "6.2", "6.3"] },
    { "id": 10, "tasks": ["6.3", "6.4", "6.5"] },
    { "id": 11, "tasks": ["6.6", "7.1", "7.2", "7.3"] },
    { "id": 12, "tasks": ["7.4", "7.6"] },
    { "id": 13, "tasks": ["7.5", "7.7", "9.1", "9.2", "9.3"] },
    { "id": 14, "tasks": ["9.4", "9.5"] },
    { "id": 15, "tasks": ["9.6", "10.1", "11.1"] },
    { "id": 16, "tasks": ["10.2", "11.2"] },
    { "id": 17, "tasks": ["10.3", "10.4", "11.3", "11.4"] },
    { "id": 18, "tasks": ["10.5", "10.6", "11.5"] },
    { "id": 19, "tasks": ["10.7", "11.6"] },
    { "id": 20, "tasks": ["11.7", "12.1", "12.2"] },
    { "id": 21, "tasks": ["12.3", "13.1", "13.2"] },
    { "id": 22, "tasks": ["13.3", "13.4"] }
  ]
}
```
