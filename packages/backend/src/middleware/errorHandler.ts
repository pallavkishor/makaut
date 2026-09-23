import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../lib/logger';
import { getRequestId } from './requestLogger';

/**
 * Standard error codes used throughout the application
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  DEVICE_LIMIT_REACHED = 'DEVICE_LIMIT_REACHED',
  NO_ACTIVE_SUBSCRIPTION = 'NO_ACTIVE_SUBSCRIPTION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Format error response according to API specification
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    /** Correlation id, so a user-reported error can be found in the logs. */
    requestId?: string;
  };
}

/**
 * Generic message used for unexpected failures in production. Internal detail
 * (messages, stack traces) goes to the log only — never to the client
 * (Requirement 10.6).
 */
const GENERIC_INTERNAL_MESSAGE = 'An internal server error occurred';

/**
 * Writes one log line for a handled error.
 *
 * 5xx responses log at ERROR because they are application faults that need
 * alerting; 4xx log at WARN because they are expected client mistakes
 * (failed logins, validation failures) that still matter for monitoring.
 * Stack traces are attached for server faults only.
 */
function logHandledError(
  err: Error,
  req: Request,
  statusCode: number,
  code: string,
  requestId: string
): void {
  const context = {
    requestId,
    code,
    status: statusCode,
    method: req.method,
    endpoint: req.originalUrl.split('?')[0],
    userId: req.user?.userId,
    userType: req.user?.userType,
    errorName: err.name,
    errorMessage: err.message,
    ...(statusCode >= 500 ? { stack: err.stack } : {}),
  };

  if (statusCode >= 500) {
    logger.error(context, err.message || 'Unhandled application error');
  } else {
    logger.warn(context, err.message || 'Request failed');
  }
}

/**
 * Error handling middleware
 * Catches all errors and formats them consistently
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = getRequestId(req);

  // Handle AppError instances
  if (err instanceof AppError) {
    logHandledError(err, req, err.statusCode, err.code, requestId);

    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
        requestId,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError') {
    logHandledError(err, req, 400, ErrorCode.VALIDATION_ERROR, requestId);

    const response: ErrorResponse = {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: err.message,
        requestId,
      },
    };

    res.status(400).json(response);
    return;
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    logHandledError(err, req, 400, ErrorCode.VALIDATION_ERROR, requestId);

    const response: ErrorResponse = {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid JSON in request body',
        requestId,
      },
    };

    res.status(400).json(response);
    return;
  }

  // Unexpected error: log everything, tell the client nothing beyond the
  // request id. In development the message is surfaced to speed up debugging,
  // but the stack trace never leaves the log.
  logHandledError(err, req, 500, ErrorCode.INTERNAL_ERROR, requestId);

  const response: ErrorResponse = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: config.isDevelopment
        ? err.message || GENERIC_INTERNAL_MESSAGE
        : GENERIC_INTERNAL_MESSAGE,
      requestId,
    },
  };

  res.status(500).json(response);
}
