# Middleware Documentation

## Authentication Rate Limiting

### Overview

The `authRateLimit.ts` module provides rate limiting middleware for authentication endpoints to prevent brute force attacks. It implements requirements 9.8 and 9.9 from the system requirements.

### Features

- **Login Rate Limiting**: 5 attempts per 15 minutes per email address
- **Registration Rate Limiting**: 10 attempts per 15 minutes (more lenient)
- **Email-based tracking**: Rate limits are applied per email address (normalized to lowercase)
- **IP fallback**: If no email is provided, rate limiting falls back to IP address
- **Standard headers**: Includes `RateLimit-*` headers in responses

### Usage

#### For Login Endpoints

```typescript
import { authRateLimiter } from './middleware/authRateLimit';

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  // Your login logic here
});

app.post('/api/admin/auth/login', authRateLimiter, async (req, res) => {
  // Your admin login logic here
});
```

#### For Registration Endpoints

```typescript
import { registrationRateLimiter } from './middleware/authRateLimit';

app.post('/api/auth/register', registrationRateLimiter, async (req, res) => {
  // Your registration logic here
});
```

### Rate Limit Configuration

| Middleware | Window | Max Attempts | Key |
|------------|--------|--------------|-----|
| `authRateLimiter` | 15 minutes | 5 | Email address (lowercase, trimmed) |
| `registrationRateLimiter` | 15 minutes | 10 | `register:` + email or IP |

### Response Format

When rate limit is exceeded (HTTP 429):

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many login attempts for user@example.com. Please try again in 15 minutes."
  }
}
```

### Response Headers

The middleware adds standard rate limit headers:

- `RateLimit-Limit`: Maximum number of requests allowed in the window
- `RateLimit-Remaining`: Number of requests remaining in the current window
- `RateLimit-Reset`: Unix timestamp when the rate limit window resets

### Production Considerations

#### Redis Integration

For production environments with multiple server instances, consider using Redis for distributed rate limiting:

```typescript
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:auth:',
  }),
  // ... other options
});
```

#### Monitoring

Monitor rate limit events in your logging system:

```typescript
export const authRateLimiter = rateLimit({
  // ... existing config
  onLimitReached: (req, res, options) => {
    logger.warn('Rate limit exceeded', {
      email: req.body?.email,
      ip: req.ip,
      endpoint: req.path,
    });
  },
});
```

### Testing

Run the test suite:

```bash
npm test -- authRateLimit.test.ts
```

The test suite covers:
- Basic rate limiting functionality
- Per-email rate limiting
- Email normalization (case-insensitive, trimmed)
- IP address fallback
- Separate limits for login vs registration
- Edge cases (empty emails, non-string values, etc.)

### Security Notes

1. **Email Normalization**: Emails are converted to lowercase and trimmed to prevent bypass attempts
2. **IP Fallback**: Requests without valid email addresses are rate-limited by IP
3. **Separate Keys**: Login and registration use different rate limit keys to prevent interference
4. **Memory Storage**: In-memory storage is used by default (suitable for single-instance development)
5. **Production**: Use Redis or another persistent store for production deployments with multiple instances

### Error Codes

The middleware uses the `RATE_LIMIT_EXCEEDED` error code from the `errorHandler` module, ensuring consistent error responses across the application.

## Request Logging and Error Responses

### Overview

`requestLogger.ts` and `errorHandler.ts` implement requirements 10.5–10.8. Together
they give every request a correlation id, one structured log line, and a client
response that never contains internal detail.

### Request logging

`requestLogger` is registered first in `createApp()` so every request — including
those rejected by Helmet, CORS, or the rate limiters — gets a `requestId`.

- generates a UUID per request (`crypto.randomUUID`) and attaches it as `req.requestId`
- returns it to the caller in the `X-Request-Id` response header
- logs one line when the response finishes: `method`, `path`, `status`, `durationMs`,
  `requestId`, and the authenticated `userId`/`userType` when present
- level follows the status: 5xx → ERROR, 4xx → WARN, otherwise INFO

Only metadata is logged. Headers, request bodies, and query strings are never
logged, because that is where credentials live. Paths are logged with the query
string stripped.

### Error responses

The envelope is unchanged; `requestId` is added so a user-reported failure can be
traced to its log line:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Note not found",
    "requestId": "8f14e45f-ceea-467a-9f0a-6ee0f34d9a1c"
  }
}
```

- every handled error is logged with its code, status, endpoint, and user
- 5xx logs at ERROR with the stack trace, 4xx logs at WARN without one
- unexpected errors return the generic message `An internal server error occurred`;
  the original message and stack go to the log only (the message is surfaced in
  the response in development to speed up debugging, the stack never is)

### Structured logging

See `src/lib/logger.ts`. Output matches design section 8.2:

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "ERROR",
  "message": "Database query failed",
  "context": { "requestId": "...", "endpoint": "/api/notes/456" }
}
```

- level comes from `LOG_LEVEL`; unset means `debug` in development, `info` in
  production, `silent` under Jest
- pretty-printed in development, raw JSON everywhere else
- **secrets are stripped before anything is written**: keys containing
  `password`, `token`, `authorization`, `fingerprint`, `secret`, `cookie`,
  `apikey`, or `credential` are replaced with `[REDACTED]` at any nesting depth,
  and every string is matched against JWT, `Bearer`/`Basic`, and bcrypt-hash
  shapes in case a credential is embedded in free text
