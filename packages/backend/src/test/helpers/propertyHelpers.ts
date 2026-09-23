/**
 * Property-based testing helpers using fast-check
 */

import * as fc from 'fast-check';

/**
 * Generate arbitrary valid email addresses
 */
export const arbitraryEmail = (): fc.Arbitrary<string> => {
  return fc
    .tuple(
      fc.stringMatching(/^[a-z0-9._-]+$/),
      fc.stringMatching(/^[a-z0-9.-]+$/),
      fc.stringMatching(/^[a-z]{2,}$/)
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => {
      // Ensure valid email format
      const parts = email.split('@');
      return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.');
    });
};

/**
 * Generate arbitrary passwords (minimum 8 characters)
 */
export const arbitraryPassword = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 8, maxLength: 100 });
};

/**
 * Generate arbitrary short passwords (less than 8 characters - invalid)
 */
export const arbitraryShortPassword = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 0, maxLength: 7 });
};

/**
 * Generate arbitrary invalid email addresses
 */
export const arbitraryInvalidEmail = (): fc.Arbitrary<string> => {
  return fc.oneof(
    fc.string().filter((s) => !s.includes('@')),
    fc.string().filter((s) => s.includes('@') && !s.includes('.')),
    fc.constant(''),
    fc.constant('@'),
    fc.constant('test@'),
    fc.constant('@test.com'),
    fc.constant('test..test@test.com')
  );
};

/**
 * Generate arbitrary subject names
 */
export const arbitrarySubjectName = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 1, maxLength: 255 });
};

/**
 * Generate arbitrary note titles
 */
export const arbitraryNoteTitle = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 1, maxLength: 500 });
};

/**
 * Generate arbitrary note content
 */
export const arbitraryNoteContent = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 0, maxLength: 10000 });
};

/**
 * Generate arbitrary device fingerprints
 */
export const arbitraryDeviceFingerprint = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 32, maxLength: 512 });
};

/**
 * Generate arbitrary date ranges for subscriptions
 */
export const arbitraryDateRange = (): fc.Arbitrary<{ startDate: Date; endDate: Date }> => {
  return fc
    .tuple(fc.date(), fc.integer({ min: 1, max: 365 }))
    .map(([start, daysToAdd]) => {
      const end = new Date(start);
      end.setDate(end.getDate() + daysToAdd);
      return { startDate: start, endDate: end };
    });
};

/**
 * Generate arbitrary invalid date ranges (end before start)
 */
export const arbitraryInvalidDateRange = (): fc.Arbitrary<{ startDate: Date; endDate: Date }> => {
  return fc
    .tuple(fc.date(), fc.integer({ min: 1, max: 365 }))
    .map(([end, daysToSubtract]) => {
      const start = new Date(end);
      start.setDate(start.getDate() - daysToSubtract);
      return { startDate: end, endDate: start };
    });
};

/**
 * Generate arbitrary UUIDs (v4 format)
 */
export const arbitraryUUID = (): fc.Arbitrary<string> => {
  return fc.uuid();
};

/**
 * Property test configuration with reasonable defaults
 */
export const propertyTestConfig: fc.Parameters<unknown[]> = {
  numRuns: 100, // Number of test cases to generate
  endOnFailure: true,
  verbose: false,
};

/**
 * Run a property test with standard configuration
 */
export async function runPropertyTest<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
  options?: Partial<fc.Parameters<[T]>>
): Promise<void> {
  await fc.assert(
    fc.asyncProperty(arbitrary, async (value: T) => {
      return await predicate(value);
    }),
    {
      ...(propertyTestConfig as unknown as fc.Parameters<[T]>),
      ...options,
    }
  );
}
