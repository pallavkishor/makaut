import pino, { type Logger, type LoggerOptions } from 'pino';
import { config } from '../config';

/**
 * Structured application logger (design section 8.2).
 *
 * Every line is JSON shaped as:
 *
 * ```json
 * {
 *   "timestamp": "2024-01-15T10:30:00.123Z",
 *   "level": "ERROR",
 *   "message": "Database query failed",
 *   "context": { "userId": "...", "endpoint": "/api/notes/456" }
 * }
 * ```
 *
 * Call it with the context object first, message second — the pino convention:
 *
 * ```ts
 * logger.error({ userId, endpoint, error: err.message }, 'Database query failed');
 * ```
 *
 * Secrets never reach the output. Sensitive keys are scrubbed recursively
 * before pino sees them (see `scrubSecrets`) and pino's own `redact` config is
 * kept as a second layer, so a new call site cannot leak a token or password by
 * accident.
 */

/** Arbitrary structured data attached to a log line under `context`. */
export type LogContext = Record<string, unknown>;

export const REDACTED = '[REDACTED]';

/**
 * Key fragments that mark a value as secret. Matching is case-insensitive and
 * by substring, so `passwordHash`, `SEED_ADMIN_PASSWORD`, `accessToken` and
 * `refreshToken` are all covered by the base entries.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'token',
  'authorization',
  'fingerprint',
  'secret',
  'cookie',
  'apikey',
  'credential',
] as const;

/** True when a property name looks like it holds a credential. */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
}

/**
 * Credential shapes that are recognizable regardless of the key they sit under.
 *
 * Key-based redaction cannot catch a token embedded in free text (a message like
 * `Token rejected: eyJ...`, or a Prisma error quoting a header value), so any
 * string reaching the logger is also matched against these patterns.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  // JSON Web Token (three base64url segments, header always starts "eyJ")
  /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g,
  // "Bearer <token>" / "Basic <token>" authorization values
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // bcrypt hash
  /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{20,}/g,
];

/** Replaces anything that looks like a credential inside a string. */
export function scrubString(value: string): string {
  let result = value;
  for (const pattern of CREDENTIAL_PATTERNS) {
    // Reset lastIndex: the patterns are module-level and global
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

const MAX_SCRUB_DEPTH = 8;

/**
 * Returns a copy of `value` with every sensitive property replaced by
 * `[REDACTED]`, at any nesting depth.
 *
 * pino's `redact` option only understands fixed paths and single-level
 * wildcards; this closes the gap for objects whose shape we do not control
 * (Prisma payloads, request bodies, third-party errors).
 */
export function scrubSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_SCRUB_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrubSecrets(entry, depth + 1));
  }

  if (value instanceof Error) {
    // Errors are serialized by pino's std serializer; keep the instance intact
    // but drop any credential-bearing custom properties.
    return value;
  }

  if (typeof value === 'string') {
    return scrubString(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Non-plain objects (Date, Buffer, class instances) are left alone: copying
  // them would change how they serialize.
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : scrubSecrets(entry, depth + 1);
  }

  return result;
}

/**
 * Explicit pino redaction paths. `context` is the nested key used for the
 * structured payload, so paths are written relative to it as well as to the
 * root for bindings attached via `logger.child()`.
 */
const REDACT_PATHS = [
  'password',
  'passwordHash',
  'token',
  'authorization',
  'fingerprint',
  'SEED_ADMIN_PASSWORD',
  'headers.authorization',
  'headers.cookie',
  'context.password',
  'context.passwordHash',
  'context.token',
  'context.authorization',
  'context.fingerprint',
  'context.SEED_ADMIN_PASSWORD',
  'context.*.password',
  'context.*.passwordHash',
  'context.*.token',
  'context.*.authorization',
  'context.*.fingerprint',
  'context.headers.authorization',
  'context.headers.cookie',
];

/**
 * Resolves the active log level.
 *
 * `LOG_LEVEL` always wins when set. Otherwise: silent under Jest so logs do not
 * pollute test output, `debug` in development, `info` everywhere else.
 */
export function resolveLogLevel(): string {
  const configured = config.logLevel;
  if (configured) {
    return configured;
  }
  if (config.isTest) {
    return 'silent';
  }
  return config.isDevelopment ? 'debug' : 'info';
}

/**
 * Builds the pino options used by the application logger.
 *
 * Exported so tests can attach the exact production configuration to an
 * in-memory stream and assert on the emitted lines.
 */
export function buildLoggerOptions(): LoggerOptions {
  return {
    level: resolveLogLevel(),
    // `message` instead of pino's default `msg`
    messageKey: 'message',
    // Structured payloads are nested so the output matches design 8.2
    nestedKey: 'context',
    // ISO-8601 under a `timestamp` key instead of pino's epoch `time`
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      // ERROR / WARN / INFO / DEBUG instead of numeric levels
      level: (label: string) => ({ level: label.toUpperCase() }),
    },
    redact: { paths: REDACT_PATHS, censor: REDACTED, remove: false },
    // Strip pino's default pid/hostname bindings; they add noise and the
    // aggregator supplies them.
    base: undefined,
    hooks: {
      logMethod(args, method) {
        // Scrub every argument before pino sees it: the context object by key,
        // and any string (message or interpolation value) by credential shape.
        const scrubbed = args.map((arg) => {
          if (typeof arg === 'string') {
            return scrubString(arg);
          }
          if (arg !== null && typeof arg === 'object' && !(arg instanceof Error)) {
            return scrubSecrets(arg);
          }
          return arg;
        });

        return method.apply(this, scrubbed as Parameters<typeof method>);
      },
    },
  };
}

function createLogger(): Logger {
  const options = buildLoggerOptions();

  // Human-readable output while developing; raw JSON in production so log
  // aggregation can parse it. No transport in test — pino-pretty runs on a
  // worker thread, which would keep Jest's event loop alive.
  if (config.isDevelopment) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          messageKey: 'message',
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

export const logger: Logger = createLogger();

export default logger;
