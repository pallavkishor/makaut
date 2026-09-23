import pino from 'pino';
import fc from 'fast-check';
import {
  buildLoggerOptions,
  isSensitiveKey,
  logger,
  REDACTED,
  resolveLogLevel,
  scrubSecrets,
} from './logger';

/**
 * Captures log lines emitted with the real production pino configuration.
 */
function createCapturingLogger(): {
  log: pino.Logger;
  lines: () => Record<string, any>[];
  raw: () => string;
} {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string): void {
      chunks.push(chunk);
    },
  };

  const log = pino(
    { ...buildLoggerOptions(), level: 'debug' },
    stream as pino.DestinationStream
  );

  return {
    log,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line)),
    raw: () => chunks.join(''),
  };
}

describe('logger', () => {
  describe('log shape (design 8.2)', () => {
    it('emits timestamp, level, message and context keys', () => {
      const { log, lines } = createCapturingLogger();

      log.error(
        { userId: '123e4567-e89b-12d3-a456-426614174000', endpoint: '/api/notes/456' },
        'Database query failed'
      );

      const [line] = lines();
      expect(line).toMatchObject({
        level: 'ERROR',
        message: 'Database query failed',
        context: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          endpoint: '/api/notes/456',
        },
      });
      expect(typeof line.timestamp).toBe('string');
      expect(new Date(line.timestamp).toISOString()).toBe(line.timestamp);
    });

    it('uses uppercase level labels for ERROR, WARN, INFO and DEBUG', () => {
      const { log, lines } = createCapturingLogger();

      log.error('a');
      log.warn('b');
      log.info('c');
      log.debug('d');

      expect(lines().map((line) => line.level)).toEqual([
        'ERROR',
        'WARN',
        'INFO',
        'DEBUG',
      ]);
    });

    it('emits valid JSON per line', () => {
      const { log, raw } = createCapturingLogger();

      log.info({ a: 1 }, 'first');
      log.info({ b: 2 }, 'second');

      const parsed = raw()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(parsed).toHaveLength(2);
    });
  });

  describe('secret redaction', () => {
    const secret = 'super-secret-value-9f3a';

    it.each([
      'password',
      'passwordHash',
      'token',
      'authorization',
      'fingerprint',
      'SEED_ADMIN_PASSWORD',
    ])('redacts a top-level %s field', (key) => {
      const { log, raw, lines } = createCapturingLogger();

      log.info({ [key]: secret }, 'credential handling');

      expect(raw()).not.toContain(secret);
      expect(lines()[0].context[key]).toBe(REDACTED);
    });

    it('redacts sensitive fields nested several levels deep', () => {
      const { log, raw } = createCapturingLogger();

      log.error(
        {
          request: {
            body: { email: 'a@b.com', password: secret },
            headers: { authorization: `Bearer ${secret}` },
          },
          device: { list: [{ fingerprint: secret }] },
        },
        'nested payload'
      );

      expect(raw()).not.toContain(secret);
    });

    it('keeps non-sensitive values intact', () => {
      const { log, lines } = createCapturingLogger();

      log.info({ email: 'student@example.com', status: 200 }, 'ok');

      expect(lines()[0].context).toMatchObject({
        email: 'student@example.com',
        status: 200,
      });
    });

    it('redacts a JWT embedded in the log message itself', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYmMifQ.s1gnatureV4lue';
      const { log, raw } = createCapturingLogger();

      log.warn({ endpoint: '/api/auth/login' }, `Token rejected: ${jwt}`);

      expect(raw()).not.toContain(jwt);
      expect(raw()).toContain(REDACTED);
    });

    it('redacts a JWT stored under a harmless-looking key', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYmMifQ.s1gnatureV4lue';
      const { log, raw } = createCapturingLogger();

      log.error({ detail: `Authorization: Bearer ${jwt}` }, 'upstream rejected');

      expect(raw()).not.toContain(jwt);
    });

    it('redacts a bcrypt hash appearing in free text', () => {
      const hash =
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const { log, raw } = createCapturingLogger();

      log.error({ errorMessage: `compare failed for ${hash}` }, 'hash compare');

      expect(raw()).not.toContain(hash);
    });

    it('redacts case and separator variants of sensitive keys', () => {
      const { log, raw } = createCapturingLogger();

      log.info(
        {
          Password: secret,
          ACCESS_TOKEN: secret,
          'refresh-token': secret,
          deviceFingerprint: secret,
        },
        'variants'
      );

      expect(raw()).not.toContain(secret);
    });

    /**
     * Property: no matter where a sensitive key appears in the context object,
     * its value never reaches the log output.
     */
    it('never emits a value stored under a sensitive key (property)', () => {
      const sensitiveKey = fc.constantFrom(
        'password',
        'passwordHash',
        'token',
        'authorization',
        'fingerprint',
        'SEED_ADMIN_PASSWORD'
      );
      const marker = fc
        .hexaString({ minLength: 12, maxLength: 24 })
        .map((value) => `SECRET-${value}`);

      fc.assert(
        fc.property(
          sensitiveKey,
          marker,
          fc.nat({ max: 5 }),
          (key, value, depth) => {
            // Bury { [key]: value } `depth` levels down
            let payload: Record<string, unknown> = { [key]: value };
            for (let i = 0; i < depth; i += 1) {
              payload = { [`level${i}`]: payload };
            }

            const { log, raw } = createCapturingLogger();
            log.error(payload, 'property check');

            return !raw().includes(value);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('scrubSecrets', () => {
    it('replaces sensitive values and preserves structure', () => {
      expect(
        scrubSecrets({ email: 'a@b.com', password: 'pw', nested: { token: 't' } })
      ).toEqual({
        email: 'a@b.com',
        password: REDACTED,
        nested: { token: REDACTED },
      });
    });

    it('walks arrays', () => {
      expect(scrubSecrets([{ token: 'a' }, { id: 1 }])).toEqual([
        { token: REDACTED },
        { id: 1 },
      ]);
    });

    it('leaves primitives, null and Dates untouched', () => {
      const date = new Date('2024-01-15T10:30:00.123Z');
      expect(scrubSecrets('plain')).toBe('plain');
      expect(scrubSecrets(42)).toBe(42);
      expect(scrubSecrets(null)).toBeNull();
      expect(scrubSecrets(date)).toBe(date);
    });
  });

  describe('isSensitiveKey', () => {
    it.each(['password', 'passwordHash', 'TOKEN', 'Authorization', 'fingerprint', 'SEED_ADMIN_PASSWORD', 'refresh_token'])(
      'flags %s',
      (key) => {
        expect(isSensitiveKey(key)).toBe(true);
      }
    );

    it.each(['email', 'userId', 'status', 'durationMs', 'method'])(
      'does not flag %s',
      (key) => {
        expect(isSensitiveKey(key)).toBe(false);
      }
    );
  });

  describe('level configuration', () => {
    it('is silent under the test environment so Jest output stays clean', () => {
      // src/test/setup.ts sets NODE_ENV=test and clears any inherited LOG_LEVEL
      expect(process.env.LOG_LEVEL).toBeUndefined();
      expect(resolveLogLevel()).toBe('silent');
      expect(logger.level).toBe('silent');
    });
  });
});
