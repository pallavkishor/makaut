import bcrypt from 'bcrypt';

/**
 * Password utility functions for hashing and verification
 * using bcrypt with cost factor 12
 */

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates password length requirement
 * @param password - The password to validate
 * @returns true if password meets minimum length requirement, false otherwise
 */
export function validatePasswordLength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Hashes a password using bcrypt with automatic salt generation
 * @param password - The plain text password to hash
 * @returns Promise resolving to the hashed password
 * @throws Error if password is too short
 */
export async function hashPassword(password: string): Promise<string> {
  if (!validatePasswordLength(password)) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a password against a hash
 * @param password - The plain text password to verify
 * @param hash - The hash to compare against
 * @returns Promise resolving to true if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
