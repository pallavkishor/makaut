# Database Setup Guide

## Overview

This document explains the database schema for the Educational Notes Platform and how to set it up.

## Database Schema

The application uses PostgreSQL with the following tables:

### Tables

1. **students** - Stores student account information
   - `id` (UUID, Primary Key)
   - `email` (VARCHAR(255), Unique, NOT NULL)
   - `password_hash` (VARCHAR(255), NOT NULL)
   - `registered_at` (TIMESTAMP, Default: now())

2. **administrators** - Stores administrator account information
   - `id` (UUID, Primary Key)
   - `email` (VARCHAR(255), Unique, NOT NULL)
   - `password_hash` (VARCHAR(255), NOT NULL)
   - `created_at` (TIMESTAMP, Default: now())

3. **registered_devices** - Tracks devices registered to student accounts (max 2 per student)
   - `id` (UUID, Primary Key)
   - `student_id` (UUID, Foreign Key → students.id, CASCADE DELETE)
   - `fingerprint` (VARCHAR(512), NOT NULL)
   - `registered_at` (TIMESTAMP, Default: now())
   - `last_accessed_at` (TIMESTAMP, Default: now())
   - Unique constraint on (student_id, fingerprint)
   - Index: `idx_devices_student` on student_id

4. **sessions** - Manages authentication sessions for both students and administrators
   - `id` (UUID, Primary Key)
   - `user_id` (UUID, NOT NULL)
   - `user_type` (VARCHAR(20), NOT NULL, CHECK: 'student' or 'admin')
   - `token` (VARCHAR(512), Unique, NOT NULL)
   - `device_id` (UUID, Foreign Key → registered_devices.id, CASCADE DELETE, Nullable)
   - `expires_at` (TIMESTAMP, NOT NULL)
   - `created_at` (TIMESTAMP, Default: now())
   - Indexes: `idx_sessions_token` on token, `idx_sessions_user` on (user_id, user_type)

5. **subjects** - Educational subject categories
   - `id` (UUID, Primary Key)
   - `name` (VARCHAR(255), NOT NULL)
   - `created_at` (TIMESTAMP, Default: now())
   - `updated_at` (TIMESTAMP, Default: now(), Auto-updated)

6. **notes** - Educational content within subjects
   - `id` (UUID, Primary Key)
   - `subject_id` (UUID, Foreign Key → subjects.id, CASCADE DELETE)
   - `title` (VARCHAR(500), NOT NULL)
   - `content` (TEXT, NOT NULL)
   - `created_at` (TIMESTAMP, Default: now())
   - `updated_at` (TIMESTAMP, Default: now(), Auto-updated)
   - Index: `idx_notes_subject` on subject_id

7. **subscriptions** - Time-based access grants to subjects
   - `id` (UUID, Primary Key)
   - `student_id` (UUID, Foreign Key → students.id, CASCADE DELETE)
   - `subject_id` (UUID, Foreign Key → subjects.id, CASCADE DELETE)
   - `start_date` (TIMESTAMP, NOT NULL)
   - `end_date` (TIMESTAMP, NOT NULL)
   - `created_at` (TIMESTAMP, Default: now())
   - CHECK constraint: end_date > start_date
   - Indexes: 
     - `idx_subscriptions_student` on student_id
     - `idx_subscriptions_subject` on subject_id
     - `idx_subscriptions_active` on (student_id, subject_id, start_date, end_date)

## Prerequisites

- PostgreSQL 12+ installed and running
- Node.js 18+ installed
- Database credentials configured in `.env` file

## Setup Instructions

### 1. Configure Database Connection

Edit the `.env` file in the `packages/backend` directory:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/educational_notes?schema=public"
```

Replace `user`, `password`, and `localhost:5432` with your PostgreSQL credentials and server details.

### 2. Start PostgreSQL

Make sure your PostgreSQL server is running:

```bash
# Windows (if using Windows Service)
net start postgresql

# Linux/Mac (if using systemd)
sudo systemctl start postgresql

# Using Docker
docker run --name educational-notes-db -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=educational_notes -p 5432:5432 -d postgres:15
```

### 3. Run Database Migrations

From the `packages/backend` directory:

```bash
# Generate Prisma Client (already done)
npm run prisma:generate

# Run migrations to create tables
npm run prisma:migrate
```

This will:
- Create all tables with proper schema
- Set up foreign key relationships
- Create indexes for performance
- Apply constraints

### 4. Verify Database Setup

You can verify the database schema using Prisma Studio:

```bash
npm run prisma:studio
```

This opens a web interface at http://localhost:5555 to browse your database.

## Database Design Highlights

### Foreign Key Relationships

- **CASCADE DELETE**: When a student is deleted, all related devices, subscriptions are automatically deleted
- **CASCADE DELETE**: When a subject is deleted, all related notes and subscriptions are automatically deleted
- **CASCADE DELETE**: When a device is revoked, all related sessions are terminated

### Performance Indexes

- **idx_devices_student**: Speeds up device lookups per student
- **idx_sessions_token**: Optimizes session validation
- **idx_sessions_user**: Optimizes user session queries
- **idx_notes_subject**: Speeds up note retrieval per subject
- **idx_subscriptions_student**: Optimizes subscription lookups per student
- **idx_subscriptions_subject**: Optimizes subscription lookups per subject
- **idx_subscriptions_active**: Composite index for efficient active subscription queries

### Data Integrity Constraints

- **Email uniqueness**: Prevents duplicate accounts
- **Device fingerprint uniqueness per student**: Ensures unique device registration
- **Session token uniqueness**: Prevents token collision
- **Valid date range**: Ensures subscription end_date > start_date
- **User type check**: Ensures session user_type is either 'student' or 'admin'

## Troubleshooting

### Connection Issues

If you see "Can't reach database server" error:

1. Verify PostgreSQL is running
2. Check DATABASE_URL in .env file
3. Ensure database user has proper permissions
4. Verify firewall allows connection to port 5432

### Migration Issues

If migrations fail:

1. Check PostgreSQL logs for specific errors
2. Ensure database user has CREATE TABLE permissions
3. Verify the database exists (create it manually if needed):
   ```sql
   CREATE DATABASE educational_notes;
   ```

### Reset Database

To completely reset the database:

```bash
# This will drop all tables and recreate them
npm run prisma:migrate -- reset
```

**WARNING**: This will delete all data!

## Next Steps

After database setup is complete:

1. Create initial administrator account (see seed script)
2. Test authentication endpoints
3. Verify foreign key relationships work correctly
4. Run integration tests

## Schema Version

- Initial Schema Version: 20240121000000
- Prisma Version: 5.7.0+
- PostgreSQL Version: 12+

## References

- Prisma Documentation: https://www.prisma.io/docs
- PostgreSQL Documentation: https://www.postgresql.org/docs
- Design Document: `/.kiro/specs/educational-notes-platform/design.md`
