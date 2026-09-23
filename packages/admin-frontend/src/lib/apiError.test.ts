import { ApiError, apiErrorFromBody, toErrorMessage } from './apiError';

describe('apiErrorFromBody', () => {
  it('reads the standard error envelope', () => {
    const error = apiErrorFromBody(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email address is invalid',
        details: { field: 'email' },
      },
    });

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Email address is invalid');
    expect(error.details?.field).toBe('email');
    expect(error.status).toBe(400);
  });

  it('flags 401 responses as session errors', () => {
    const error = apiErrorFromBody(401, {
      error: { code: 'AUTHENTICATION_FAILED', message: 'Invalid email or password' },
    });

    expect(error.isSessionError).toBe(true);
  });

  it('falls back to a friendly message for a non-envelope body', () => {
    const error = apiErrorFromBody(502, '<html>Bad Gateway</html>');

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).not.toContain('<html>');
    expect(error.isRetryable).toBe(true);
  });

  it('does not treat a 4xx as retryable', () => {
    const error = apiErrorFromBody(404, {
      error: { code: 'NOT_FOUND', message: 'Subject not found' },
    });

    expect(error.isRetryable).toBe(false);
  });
});

describe('toErrorMessage', () => {
  it('prefers the API message', () => {
    expect(toErrorMessage(new ApiError('NOT_FOUND', 'Note not found', 404))).toBe(
      'Note not found'
    );
  });

  it('returns a generic message for unknown throwables', () => {
    expect(toErrorMessage({ weird: true })).toBe(
      'An unexpected error occurred. Please try again.'
    );
  });
});
