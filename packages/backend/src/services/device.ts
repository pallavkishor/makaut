import { PrismaClient } from '@prisma/client';
import { getDatabaseClient } from '../config/database';
import * as crypto from 'crypto';
import { Request } from 'express';

/**
 * Device Management Service
 * Handles device fingerprinting, registration, revocation, and tracking
 */

// Allow injecting a Prisma client for testing
let prismaClientOverride: PrismaClient | null = null;

export function setPrismaClient(client: PrismaClient): void {
  prismaClientOverride = client;
}

export function resetPrismaClient(): void {
  prismaClientOverride = null;
}

function getPrisma(): PrismaClient {
  return prismaClientOverride || getDatabaseClient();
}

/**
 * Maximum number of devices that may be registered to one student account.
 *
 * This is a product rule, not a technical constraint: an account is usable on
 * one device at a time, and moving to a new device means revoking the old one
 * (see revokeDevice). Change the rule here - everything else reads this
 * constant.
 *
 * Requirements: 2.2, 2.3
 */
export const DEVICE_LIMIT = 1;

/**
 * Message returned when a login is blocked by the device limit.
 * Phrased for the single-device rule above.
 *
 * Requirements: 2.4
 */
export const DEVICE_LIMIT_MESSAGE =
  'This account is already active on another device. Revoke that device to continue.';

export interface RegisteredDeviceInfo {
  id: string;
  studentId: string;
  fingerprint: string;
  registeredAt: Date;
  lastAccessedAt: Date;
}

/**
 * Generate a device fingerprint from request headers
 * Creates a one-way hash combining User-Agent and other identifying information
 * 
 * @param request - Express request object containing headers
 * @returns Device fingerprint string (SHA-256 hash)
 */
export function identifyDevice(request: Request): string {
  // Extract device characteristics
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  // Get client IP address (considering proxy headers)
  const ipAddress = 
    (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (request.headers['x-real-ip'] as string) ||
    request.socket.remoteAddress ||
    'unknown';
  
  // Combine characteristics into a unique identifier
  const deviceString = `${userAgent}|${ipAddress}`;
  
  // Create one-way hash
  const fingerprint = crypto
    .createHash('sha256')
    .update(deviceString)
    .digest('hex');
  
  return fingerprint;
}

/**
 * Get all registered devices for a student
 * 
 * @param studentId - Student's UUID
 * @returns Promise resolving to array of registered devices
 */
export async function getRegisteredDevices(
  studentId: string
): Promise<RegisteredDeviceInfo[]> {
  const prisma = getPrisma();
  
  const devices = await prisma.registeredDevice.findMany({
    where: { studentId },
    orderBy: { registeredAt: 'desc' },
  });
  
  return devices.map(device => ({
    id: device.id,
    studentId: device.studentId,
    fingerprint: device.fingerprint,
    registeredAt: device.registeredAt,
    lastAccessedAt: device.lastAccessedAt,
  }));
}

/**
 * Check if a student can login from a specific device
 * Returns true if:
 * - Device is already registered, OR
 * - Student has fewer than DEVICE_LIMIT devices registered
 * 
 * @param studentId - Student's UUID
 * @param fingerprint - Device fingerprint
 * @returns Promise resolving to boolean indicating if login is allowed
 */
export async function canLoginFromDevice(
  studentId: string,
  fingerprint: string
): Promise<boolean> {
  const prisma = getPrisma();
  
  // Check if device is already registered
  const existingDevice = await prisma.registeredDevice.findFirst({
    where: {
      studentId,
      fingerprint,
    },
  });
  
  if (existingDevice) {
    return true; // Device already registered
  }
  
  // Check how many devices are registered
  const deviceCount = await prisma.registeredDevice.count({
    where: { studentId },
  });
  
  // Allow only while the account is below the device limit
  return deviceCount < DEVICE_LIMIT;
}

/**
 * Register a new device for a student
 * Automatically called during login if under device limit
 * 
 * @param studentId - Student's UUID
 * @param fingerprint - Device fingerprint
 * @returns Promise resolving to registered device info
 * @throws Error if the DEVICE_LIMIT is already reached by another device
 */
export async function registerDevice(
  studentId: string,
  fingerprint: string
): Promise<RegisteredDeviceInfo> {
  const prisma = getPrisma();
  
  // Check if device is already registered
  const existingDevice = await prisma.registeredDevice.findFirst({
    where: {
      studentId,
      fingerprint,
    },
  });
  
  if (existingDevice) {
    // Update last accessed time and return existing device
    const updatedDevice = await prisma.registeredDevice.update({
      where: { id: existingDevice.id },
      data: { lastAccessedAt: new Date() },
    });
    
    return {
      id: updatedDevice.id,
      studentId: updatedDevice.studentId,
      fingerprint: updatedDevice.fingerprint,
      registeredAt: updatedDevice.registeredAt,
      lastAccessedAt: updatedDevice.lastAccessedAt,
    };
  }
  
  // Check device limit
  const deviceCount = await prisma.registeredDevice.count({
    where: { studentId },
  });
  
  if (deviceCount >= DEVICE_LIMIT) {
    throw new Error(DEVICE_LIMIT_MESSAGE);
  }
  
  // Register new device
  const device = await prisma.registeredDevice.create({
    data: {
      studentId,
      fingerprint,
    },
  });
  
  return {
    id: device.id,
    studentId: device.studentId,
    fingerprint: device.fingerprint,
    registeredAt: device.registeredAt,
    lastAccessedAt: device.lastAccessedAt,
  };
}

/**
 * Update the last accessed time for a device
 * Called during each login to track device usage
 * 
 * @param studentId - Student's UUID
 * @param fingerprint - Device fingerprint
 * @returns Promise resolving when update is complete
 */
export async function updateDeviceLastAccessed(
  studentId: string,
  fingerprint: string
): Promise<void> {
  const prisma = getPrisma();
  
  // Find the device
  const device = await prisma.registeredDevice.findFirst({
    where: {
      studentId,
      fingerprint,
    },
  });
  
  if (device) {
    await prisma.registeredDevice.update({
      where: { id: device.id },
      data: { lastAccessedAt: new Date() },
    });
  }
}

/**
 * Revoke (remove) a registered device from a student's account
 * Also terminates all active sessions associated with the device
 * 
 * @param studentId - Student's UUID (for authorization check)
 * @param deviceId - Device UUID to revoke
 * @returns Promise resolving when device is revoked
 * @throws Error if device not found or doesn't belong to student
 */
export async function revokeDevice(
  studentId: string,
  deviceId: string
): Promise<void> {
  const prisma = getPrisma();
  
  // Verify device belongs to student
  const device = await prisma.registeredDevice.findFirst({
    where: {
      id: deviceId,
      studentId,
    },
  });
  
  if (!device) {
    throw new Error('Device not found or does not belong to this student');
  }
  
  // Delete device (cascade will automatically delete sessions)
  await prisma.registeredDevice.delete({
    where: { id: deviceId },
  });
}

/**
 * Terminate all active sessions for a specific device
 * Called when a device is revoked
 * 
 * @param deviceId - Device UUID
 * @returns Promise resolving when sessions are terminated
 */
export async function terminateDeviceSessions(deviceId: string): Promise<void> {
  const prisma = getPrisma();
  
  // Delete all sessions for this device
  await prisma.session.deleteMany({
    where: { deviceId },
  });
}
