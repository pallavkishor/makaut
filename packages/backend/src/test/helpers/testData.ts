/**
 * Test data helpers using faker for generating realistic test data
 */

import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';

/**
 * Generate a valid test email address
 */
export function generateTestEmail(): string {
  return faker.internet.email().toLowerCase();
}

/**
 * Generate a valid test password (minimum 8 characters)
 */
export function generateTestPassword(): string {
  return faker.internet.password({ length: 12 });
}

/**
 * Hash a password for testing (using bcrypt)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Generate test student data
 */
export function generateStudentData() {
  return {
    email: generateTestEmail(),
    password: generateTestPassword(),
  };
}

/**
 * Generate test administrator data
 */
export function generateAdminData() {
  return {
    email: generateTestEmail(),
    password: generateTestPassword(),
  };
}

/**
 * Generate test subject data
 */
export function generateSubjectData() {
  return {
    name: faker.lorem.words(3),
  };
}

/**
 * Generate test note data
 */
export function generateNoteData() {
  return {
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(3),
  };
}

/**
 * Generate test device fingerprint
 */
export function generateDeviceFingerprint(): string {
  return faker.string.alphanumeric(64);
}

/**
 * Generate test subscription date range
 * @param daysFromNow - Start date offset from today (default: -7 days)
 * @param durationDays - Duration in days (default: 30 days)
 */
export function generateSubscriptionDates(daysFromNow: number = -7, durationDays: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + daysFromNow);
  
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationDays);
  
  return { startDate, endDate };
}

/**
 * Generate an active subscription date range (currently valid)
 */
export function generateActiveSubscriptionDates() {
  return generateSubscriptionDates(-7, 30);
}

/**
 * Generate an expired subscription date range
 */
export function generateExpiredSubscriptionDates() {
  return generateSubscriptionDates(-60, 30);
}

/**
 * Generate a future subscription date range (not yet started)
 */
export function generateFutureSubscriptionDates() {
  return generateSubscriptionDates(7, 30);
}
