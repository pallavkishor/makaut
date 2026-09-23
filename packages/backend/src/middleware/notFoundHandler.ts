import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from './errorHandler';

/**
 * 404 Not Found handler
 * Catches all requests that don't match any route
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const error = new AppError(
    ErrorCode.NOT_FOUND,
    `Route not found: ${req.method} ${req.path}`,
    404
  );
  next(error);
}
