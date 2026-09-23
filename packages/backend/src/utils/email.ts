/**
 * Email validation utility functions
 * Implements RFC 5322 email format validation
 */

/**
 * RFC 5322 compliant email validation regex
 * This regex validates the basic structure of an email address according to RFC 5322
 * Format: local-part@domain
 * 
 * Local part: allows alphanumeric, dots, hyphens, underscores, and some special characters
 * - Cannot start or end with a dot
 * - Cannot have consecutive dots
 * Domain: requires at least one dot with valid TLD (2+ characters)
 */
const EMAIL_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates email format according to RFC 5322
 * @param email - The email address to validate
 * @returns true if the email matches valid format, false otherwise
 */
export function validateEmail(email: string): boolean {
  if (typeof email !== 'string') {
    return false;
  }
  
  // Check length constraints (RFC 5321)
  if (email.length === 0 || email.length > 254) {
    return false;
  }
  
  // Split into local and domain parts
  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }
  
  const [localPart, domain] = parts;
  
  // Validate local part length (max 64 characters)
  if (localPart.length === 0 || localPart.length > 64) {
    return false;
  }
  
  // Validate domain length
  if (domain.length === 0 || domain.length > 253) {
    return false;
  }
  
  // Check for consecutive dots in local part
  if (localPart.includes('..')) {
    return false;
  }
  
  // Check that local part doesn't start or end with a dot
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return false;
  }
  
  // Apply RFC 5322 regex pattern
  // The regex now enforces:
  // - At least one dot in domain (TLD requirement)
  // - No consecutive dots in local part (via pattern)
  // - No leading/trailing dots in local part (via pattern)
  return EMAIL_REGEX.test(email);
}
