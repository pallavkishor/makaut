# Backend API Server

Backend API server for the Educational Notes Platform built with Node.js, Express, TypeScript, and Prisma.

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your database credentials and configuration

4. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

5. Run database migrations:
   ```bash
   npm run prisma:migrate
   ```

## Development

Start the development server:
```bash
npm run dev
```

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

## Building

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## Database Management

Open Prisma Studio:
```bash
npm run prisma:studio
```

## API Documentation

API documentation will be available at `/api/docs` when the server is running (to be implemented).
