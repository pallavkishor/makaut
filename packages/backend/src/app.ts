import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestLogger } from './middleware/requestLogger';
import apiRoutes from './routes';

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Request logging - first so every request gets a requestId, including ones
  // rejected by the middleware below
  app.use(requestLogger);

  // Security middleware - Helmet for security headers
  app.use(helmet());

  // CORS configuration
  const corsOrigins = config.corsOrigin.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api', apiRoutes);

  // 404 handler - must be after all routes
  app.use(notFoundHandler);

  // Error handling middleware - must be last
  app.use(errorHandler);

  return app;
}
