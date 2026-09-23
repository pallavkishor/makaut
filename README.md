# Educational Notes Platform

A comprehensive subscription-based educational content delivery system with student and admin portals.

## Project Structure

This is a monorepo containing three packages:

```
educational-notes-platform/
├── packages/
│   ├── backend/              # Node.js/Express API server
│   ├── student-frontend/     # Next.js student platform
│   └── admin-frontend/       # Next.js admin panel
├── package.json              # Root workspace configuration
├── tsconfig.json            # Shared TypeScript config
├── .eslintrc.json           # Shared ESLint config
└── .prettierrc              # Shared Prettier config
```

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **Testing**: Jest, Supertest, fast-check

### Frontend (Both Apps)
- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Query
- **Validation**: Zod
- **Rich Text Editor**: TipTap (admin only)

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 14

## Quick Start

### 1. Install Dependencies

From the root directory:

```bash
npm install
```

This will install dependencies for all packages in the workspace.

### 2. Set Up Environment Variables

Each package needs its own environment file:

```bash
# Backend
cp packages/backend/.env.example packages/backend/.env

# Student Frontend
cp packages/student-frontend/.env.example packages/student-frontend/.env.local

# Admin Frontend
cp packages/admin-frontend/.env.example packages/admin-frontend/.env.local
```

Update each `.env` file with your specific configuration.

### 3. Set Up Database

```bash
cd packages/backend
npm run prisma:generate
npm run prisma:migrate
```

### 4. Run Development Servers

Open three terminal windows:

**Terminal 1 - Backend API (port 3001):**
```bash
cd packages/backend
npm run dev
```

**Terminal 2 - Student Frontend (port 3000):**
```bash
cd packages/student-frontend
npm run dev
```

**Terminal 3 - Admin Frontend (port 3002):**
```bash
cd packages/admin-frontend
npm run dev
```

## Available Scripts

### Root Level

- `npm run dev` - Start all packages in development mode
- `npm run build` - Build all packages
- `npm run test` - Run tests for all packages
- `npm run lint` - Lint all packages
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run clean` - Remove all node_modules and build artifacts

### Package Level

Navigate to any package directory and run:

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run tests
- `npm run lint` - Lint code

## Development Workflow

1. **Make changes** to any package
2. **Lint and format** your code:
   ```bash
   npm run lint
   npm run format
   ```
3. **Run tests** to ensure everything works:
   ```bash
   npm run test
   ```
4. **Commit** your changes

## Project Features

### Student Platform
- User registration and authentication
- Subject browsing and note access
- Subscription management
- Device tracking (max 2 devices per account)
- Search functionality

### Admin Panel
- Separate admin authentication
- Student management
- Subject and note creation/editing
- Subscription management
- Rich text editor for content
- Image uploads

### Backend API
- RESTful API endpoints
- JWT-based authentication
- Device fingerprinting
- Rate limiting
- Input validation
- Error handling
- Database migrations with Prisma

## Testing

Each package includes its own test suite:

```bash
# Run all tests
npm run test

# Run tests for a specific package
cd packages/backend
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Building for Production

```bash
# Build all packages
npm run build

# Build specific package
cd packages/backend
npm run build
```

## Documentation

- [Backend API Documentation](./packages/backend/README.md)
- [Student Frontend Documentation](./packages/student-frontend/README.md)
- [Admin Frontend Documentation](./packages/admin-frontend/README.md)

## Architecture

The platform consists of three separate applications:

1. **Backend API** - Handles all business logic, authentication, and database operations
2. **Student Frontend** - Public-facing application for students to access educational content
3. **Admin Frontend** - Separate management application for administrators

This separation ensures:
- Clear security boundaries
- Independent scaling
- Separate deployment pipelines
- Better maintainability

## Contributing

1. Follow the TypeScript, ESLint, and Prettier configurations
2. Write tests for new features
3. Ensure all tests pass before committing
4. Use meaningful commit messages

## License

Private - All rights reserved
