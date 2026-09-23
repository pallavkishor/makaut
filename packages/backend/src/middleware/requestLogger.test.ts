import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import { AppError, ErrorCode, errorHandler } from './errorHandler';
import { getRequestId, REQUEST_ID_HEADER, requestLogger } from './requestLogger';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createTestApp(): Express {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());

  app.get('/ok', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.get('/echo-id', (req: Request, res: Response) => {
    res.status(200).json({ requestId: req.requestId });
  });

  app.get('/app-error', () => {
    throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', 404);
  });

  app.get('/boom', () => {
    throw new Error('Connection timeout to database at 10.0.0.5');
  });

  app.use(errorHandler);
  return app;
}

describe('requestLogger', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it('assigns a UUID requestId to every request', async () => {
    const response = await request(app).get('/echo-id');

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(UUID_PATTERN);
  });

  it('exposes the requestId on the response header', async () => {
    const response = await request(app).get('/ok');

    expect(response.headers[REQUEST_ID_HEADER.toLowerCase()]).toMatch(
      UUID_PATTERN
    );
  });

  it('issues a different requestId per request', async () => {
    const first = await request(app).get('/echo-id');
    const second = await request(app).get('/echo-id');

    expect(first.body.requestId).not.toBe(second.body.requestId);
  });

  describe('getRequestId', () => {
    it('returns the existing id when one is already attached', () => {
      const req = { requestId: 'existing-id' } as Request;
      expect(getRequestId(req)).toBe('existing-id');
    });

    it('generates an id when the middleware did not run', () => {
      const req = {} as Request;
      const id = getRequestId(req);

      expect(id).toMatch(UUID_PATTERN);
      // Stable across calls
      expect(getRequestId(req)).toBe(id);
    });
  });
});

describe('errorHandler request correlation', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it('keeps the existing error envelope shape', async () => {
    const response = await request(app).get('/app-error');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'Note not found',
      },
    });
  });

  it('includes the requestId in the error body, matching the response header', async () => {
    const response = await request(app).get('/app-error');

    expect(response.body.error.requestId).toMatch(UUID_PATTERN);
    expect(response.body.error.requestId).toBe(
      response.headers[REQUEST_ID_HEADER.toLowerCase()]
    );
  });

  it('returns a generic message with no stack trace for unexpected errors', async () => {
    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('An internal server error occurred');

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('Connection timeout');
    expect(serialized).not.toContain('at ');
    expect(response.body.error.details).toBeUndefined();
  });
});
