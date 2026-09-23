import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Request logging middleware.
 *
 * Assigns every request a `requestId`, echoes it back in the `X-Request-Id`
 * response header, and logs one line per completed request with the method,
 * path, status code and duration (design section 8.2).
 *
 * The id is also what the error handler puts in the error response body, so a
 * user-reported failure can be matched to its log line.
 */

// Extend Express Request with the per-request correlation id
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      /** High-resolution start time, used to compute request duration. */
      startTime?: number;
    }
  }
}

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Returns the request's correlation id, generating one if it is missing. */
export function getRequestId(req: Request): string {
  if (!req.requestId) {
    req.requestId = randomUUID();
  }
  return req.requestId;
}

/**
 * Chooses the log level for a completed request: server faults are errors,
 * client faults are warnings, everything else is informational.
 */
function levelForStatus(statusCode: number): 'error' | 'warn' | 'info' {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * Attaches a requestId and logs the request once the response is finished.
 *
 * Only non-sensitive request metadata is logged: no headers, no request body,
 * no query values. Those are the places credentials live.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = randomUUID();
  req.requestId = requestId;
  req.startTime = Date.now();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime ?? Date.now());
    const level = levelForStatus(res.statusCode);

    logger[level](
      {
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs,
        userId: req.user?.userId,
        userType: req.user?.userType,
      },
      `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${durationMs}ms`
    );
  });

  next();
}
