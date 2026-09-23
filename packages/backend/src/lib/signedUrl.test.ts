import { createHmac } from 'crypto';
import fc from 'fast-check';
import {
  DEFAULT_DOWNLOAD_TTL_SECONDS,
  MAX_DOWNLOAD_TTL_SECONDS,
  SignedUrlError,
  SignedUrlFailure,
  buildSignedDownloadUrl,
  resolveDefaultTtlSeconds,
  resetSignedUrlWarnings,
  signResourceDownload,
  signedDownloadPath,
  verifyResourceDownloadToken,
} from './signedUrl';

/**
 * Signed download URL tests.
 *
 * These cover the security properties the resource download path depends on:
 * a tampered token is rejected, an expired token is rejected with a
 * distinguishable reason, and a token minted for one student cannot be redeemed
 * by another.
 */

const RESOURCE_A = '11111111-1111-4111-8111-111111111111';
const RESOURCE_B = '22222222-2222-4222-8222-222222222222';
const STUDENT_A = '33333333-3333-4333-8333-333333333333';
const STUDENT_B = '44444444-4444-4444-8444-444444444444';

const uuidArb = fc.uuid();

function expectFailure(run: () => unknown, reason: SignedUrlFailure): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SignedUrlError);
    expect((error as SignedUrlError).reason).toBe(reason);
    return;
  }

  throw new Error(`Expected a ${reason} rejection but the token was accepted`);
}

/** Flips one character of the signature segment, leaving the payload intact. */
function tamperSignature(token: string): string {
  const [payload, signature] = token.split('.');
  const firstChar = signature[0];
  const replacement = firstChar === 'A' ? 'B' : 'A';

  return `${payload}.${replacement}${signature.slice(1)}`;
}

describe('signed resource download URLs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RESOURCE_URL_SECRET = 'test-resource-url-secret';
    delete process.env.RESOURCE_URL_TTL_SECONDS;
    delete process.env.RESOURCE_DOWNLOAD_BASE_URL;
    delete process.env.PUBLIC_API_BASE_URL;
    resetSignedUrlWarnings();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('signing and round trip', () => {
    it('verifies a freshly issued token for the issuing student', () => {
      const signed = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      const verified = verifyResourceDownloadToken(signed.token, {
        expectedStudentId: STUDENT_A,
      });

      expect(verified.resourceId).toBe(RESOURCE_A);
      expect(verified.studentId).toBe(STUDENT_A);
      expect(verified.expiresAt.getTime()).toBe(signed.expiresAt.getTime());
    });

    it('defaults to a 5 minute lifetime', () => {
      const now = new Date('2024-01-15T10:00:00.000Z');

      const signed = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
        now,
      });

      expect(signed.expiresInSeconds).toBe(DEFAULT_DOWNLOAD_TTL_SECONDS);
      expect(signed.expiresAt.getTime()).toBe(now.getTime() + 300_000);
    });

    it('clamps a requested lifetime to the maximum', () => {
      const signed = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
        ttlSeconds: MAX_DOWNLOAD_TTL_SECONDS * 10,
      });

      expect(signed.expiresInSeconds).toBe(MAX_DOWNLOAD_TTL_SECONDS);
    });

    it('rejects non-UUID inputs at signing time', () => {
      expect(() =>
        signResourceDownload({ resourceId: 'not-a-uuid', studentId: STUDENT_A })
      ).toThrow(/resourceId must be a UUID/);

      expect(() =>
        signResourceDownload({ resourceId: RESOURCE_A, studentId: 'nope' })
      ).toThrow(/studentId must be a UUID/);
    });
  });

  describe('tampering', () => {
    it('rejects a token whose signature has been altered', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      expectFailure(
        () => verifyResourceDownloadToken(tamperSignature(token)),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });

    it('rejects a payload swapped for a different resource under the old signature', () => {
      const original = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });
      const other = signResourceDownload({
        resourceId: RESOURCE_B,
        studentId: STUDENT_A,
      });

      const forged = `${other.token.split('.')[0]}.${original.token.split('.')[1]}`;

      expectFailure(
        () => verifyResourceDownloadToken(forged),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });

    it('rejects an extended expiry re-signed with the wrong secret', () => {
      const expiry = Math.floor(Date.now() / 1000) + 86_400;
      const message = `v1:${RESOURCE_A}:${STUDENT_A}:${expiry}`;
      const signature = createHmac('sha256', 'attacker-guessed-secret')
        .update(message, 'utf8')
        .digest();

      const forged = `${Buffer.from(message, 'utf8').toString('base64url')}.${signature.toString(
        'base64url'
      )}`;

      expectFailure(
        () => verifyResourceDownloadToken(forged),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });

    it('rejects a signature of the wrong length without throwing', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      const truncated = `${token.split('.')[0]}.${token.split('.')[1].slice(0, 8)}`;

      expectFailure(
        () => verifyResourceDownloadToken(truncated),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });

    it.each([
      ['an empty string', ''],
      ['a token with no signature segment', 'abc'],
      ['a token with too many segments', 'a.b.c'],
      ['a payload that is not a v1 message', `${Buffer.from('hello', 'utf8').toString('base64url')}.sig`],
    ])('rejects %s as malformed', (_label, token) => {
      expectFailure(
        () => verifyResourceDownloadToken(token),
        SignedUrlFailure.MALFORMED
      );
    });

    it('does not accept a token signed under a rotated-away secret', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      process.env.RESOURCE_URL_SECRET = 'rotated-secret';

      expectFailure(
        () => verifyResourceDownloadToken(token),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });
  });

  describe('expiry', () => {
    it('rejects a token past its expiry with the EXPIRED reason', () => {
      const issuedAt = new Date('2024-01-15T10:00:00.000Z');
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
        ttlSeconds: 300,
        now: issuedAt,
      });

      // One second past the 5 minute window
      const later = new Date(issuedAt.getTime() + 301_000);

      expectFailure(
        () => verifyResourceDownloadToken(token, { now: later }),
        SignedUrlFailure.EXPIRED
      );
    });

    it('rejects a token exactly at its expiry', () => {
      const issuedAt = new Date('2024-01-15T10:00:00.000Z');
      const signed = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
        ttlSeconds: 60,
        now: issuedAt,
      });

      expectFailure(
        () => verifyResourceDownloadToken(signed.token, { now: signed.expiresAt }),
        SignedUrlFailure.EXPIRED
      );
    });

    it('accepts a token one second before its expiry', () => {
      const issuedAt = new Date('2024-01-15T10:00:00.000Z');
      const signed = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
        ttlSeconds: 60,
        now: issuedAt,
      });

      const justBefore = new Date(signed.expiresAt.getTime() - 1000);

      expect(
        verifyResourceDownloadToken(signed.token, { now: justBefore }).resourceId
      ).toBe(RESOURCE_A);
    });

    it('checks the signature before the expiry', () => {
      const issuedAt = new Date('2024-01-15T10:00:00.000Z');
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
        ttlSeconds: 60,
        now: issuedAt,
      });

      const later = new Date(issuedAt.getTime() + 600_000);

      // Expired *and* tampered reports the tampering, not the expiry
      expectFailure(
        () => verifyResourceDownloadToken(tamperSignature(token), { now: later }),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });
  });

  describe('student binding', () => {
    it('rejects a token issued to student A when redeemed by student B', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      expectFailure(
        () => verifyResourceDownloadToken(token, { expectedStudentId: STUDENT_B }),
        SignedUrlFailure.STUDENT_MISMATCH
      );
    });

    it('cannot have its student id rewritten', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      const [encodedPayload, signature] = token.split('.');
      const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const forgedPayload = payload.replace(STUDENT_A, STUDENT_B);

      const forged = `${Buffer.from(forgedPayload, 'utf8').toString('base64url')}.${signature}`;

      expectFailure(
        () => verifyResourceDownloadToken(forged),
        SignedUrlFailure.INVALID_SIGNATURE
      );
    });

    it('reports the embedded student when no expectation is supplied', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      expect(verifyResourceDownloadToken(token).studentId).toBe(STUDENT_A);
    });
  });

  describe('secret resolution', () => {
    it('falls back to JWT_SECRET when no dedicated secret is configured', () => {
      delete process.env.RESOURCE_URL_SECRET;
      process.env.JWT_SECRET = 'fallback-jwt-secret';

      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      expect(verifyResourceDownloadToken(token).resourceId).toBe(RESOURCE_A);
    });

    it('fails loudly when neither secret is configured', () => {
      delete process.env.RESOURCE_URL_SECRET;
      const jwtSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      try {
        expect(() =>
          signResourceDownload({ resourceId: RESOURCE_A, studentId: STUDENT_A })
        ).toThrow(/neither RESOURCE_URL_SECRET nor JWT_SECRET is set/);
      } finally {
        process.env.JWT_SECRET = jwtSecret;
      }
    });
  });

  describe('URL construction', () => {
    it('returns a relative path when no public base URL is configured', () => {
      expect(buildSignedDownloadUrl('abc.def')).toBe(
        '/api/resources/download/abc.def'
      );
    });

    it('uses the configured public base URL without doubling the slash', () => {
      process.env.RESOURCE_DOWNLOAD_BASE_URL = 'https://api.example.com/';

      expect(buildSignedDownloadUrl('abc.def')).toBe(
        'https://api.example.com/api/resources/download/abc.def'
      );
    });

    it('reads the TTL from the environment and clamps it', () => {
      process.env.RESOURCE_URL_TTL_SECONDS = '120';
      expect(resolveDefaultTtlSeconds()).toBe(120);

      process.env.RESOURCE_URL_TTL_SECONDS = '999999';
      expect(resolveDefaultTtlSeconds()).toBe(MAX_DOWNLOAD_TTL_SECONDS);

      process.env.RESOURCE_URL_TTL_SECONDS = 'not-a-number';
      expect(resolveDefaultTtlSeconds()).toBe(DEFAULT_DOWNLOAD_TTL_SECONDS);
    });

    it('produces a path that survives being placed in a URL', () => {
      const { token } = signResourceDownload({
        resourceId: RESOURCE_A,
        studentId: STUDENT_A,
      });

      const path = signedDownloadPath(token);
      const roundTripped = decodeURIComponent(
        path.replace('/api/resources/download/', '')
      );

      expect(roundTripped).toBe(token);
    });
  });

  describe('properties', () => {
    it('round trips for any resource and student pair', () => {
      fc.assert(
        fc.property(uuidArb, uuidArb, (resourceId, studentId) => {
          const { token } = signResourceDownload({ resourceId, studentId });
          const verified = verifyResourceDownloadToken(token, {
            expectedStudentId: studentId,
          });

          expect(verified.resourceId).toBe(resourceId);
          expect(verified.studentId).toBe(studentId);
        })
      );
    });

    it('never accepts a token for a student it was not issued to', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          uuidArb,
          (resourceId, issuedTo, redeemedBy) => {
            fc.pre(issuedTo !== redeemedBy);

            const { token } = signResourceDownload({
              resourceId,
              studentId: issuedTo,
            });

            expectFailure(
              () =>
                verifyResourceDownloadToken(token, {
                  expectedStudentId: redeemedBy,
                }),
              SignedUrlFailure.STUDENT_MISMATCH
            );
          }
        )
      );
    });

    it('never accepts a token once its lifetime has elapsed', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          fc.integer({ min: 1, max: MAX_DOWNLOAD_TTL_SECONDS }),
          fc.integer({ min: 0, max: 86_400 }),
          (resourceId, studentId, ttlSeconds, extraSeconds) => {
            const now = new Date('2024-06-01T00:00:00.000Z');
            const signed = signResourceDownload({
              resourceId,
              studentId,
              ttlSeconds,
              now,
            });

            const after = new Date(
              signed.expiresAt.getTime() + extraSeconds * 1000
            );

            expectFailure(
              () => verifyResourceDownloadToken(signed.token, { now: after }),
              SignedUrlFailure.EXPIRED
            );
          }
        )
      );
    });

    it('never accepts a token whose signature byte has been changed', () => {
      fc.assert(
        fc.property(uuidArb, uuidArb, (resourceId, studentId) => {
          const { token } = signResourceDownload({ resourceId, studentId });

          expectFailure(
            () => verifyResourceDownloadToken(tamperSignature(token)),
            SignedUrlFailure.INVALID_SIGNATURE
          );
        })
      );
    });
  });
});
