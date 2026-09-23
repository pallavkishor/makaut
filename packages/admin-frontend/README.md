# Admin Frontend

Admin panel frontend application for the Educational Notes Platform built with Next.js, React, TypeScript, and Tailwind CSS.

## Prerequisites

- Node.js >= 18.0.0

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Update `.env.local` with your API URL

## Development

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) in your browser.

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
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

## Features

- Administrator authentication
- Student management
- Subject and note management
- Subscription management
- Rich text editor (TipTap) for note content
- Responsive design with Tailwind CSS
