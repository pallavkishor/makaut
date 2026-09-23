import {
  DEVICE_LIMIT,
  DEVICE_LIMIT_MESSAGE,
  identifyDevice,
  getRegisteredDevices,
  canLoginFromDevice,
  registerDevice,
  updateDeviceLastAccessed,
  revokeDevice,
  terminateDeviceSessions,
  setPrismaClient,
  resetPrismaClient,
} from './device';
import { getTestDatabaseClient, beforeEachTest, afterAllTests } from '../test/config/database';
import { hashPassword } from '../utils/password';
import { Request } from 'express';

/**
 * Device Management Service Unit Tests
 * Tests device fingerprinting, registration, revocation, and tracking functionality
 */

describe('Device Management Service', () => {
  let prisma: ReturnType<typeof getTestDatabaseClient>;
  let testStudentId: string;

  beforeAll(() => {
    prisma = getTestDatabaseClient();
    setPrismaClient(prisma);
  });

  beforeEach(async () => {
    await beforeEachTest();
    
    // Create a test student for device operations
    const passwordHash = await hashPassword('password123');
    const student = await prisma.student.create({
      data: {
        email: 'devicetest@example.com',
        passwordHash,
      },
    });
    testStudentId = student.id;
  });

  afterAll(async () => {
    await afterAllTests();
    resetPrismaClient();
  });

  describe('identifyDevice', () => {
    it('should generate a fingerprint from User-Agent and IP', () => {
      const mockRequest = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as unknown as Request;

      const fingerprint = identifyDevice(mockRequest);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBe(64); // SHA-256 produces 64-character hex string
    });

    it('should generate consistent fingerprint for same device characteristics', () => {
      const mockRequest = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as unknown as Request;

      const fingerprint1 = identifyDevice(mockRequest);
      const fingerprint2 = identifyDevice(mockRequest);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should generate different fingerprints for different User-Agents', () => {
      const mockRequest1 = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as unknown as Request;

      const mockRequest2 = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as unknown as Request;

      const fingerprint1 = identifyDevice(mockRequest1);
      const fingerprint2 = identifyDevice(mockRequest2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should generate different fingerprints for different IPs', () => {
      const mockRequest1 = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as unknown as Request;

      const mockRequest2 = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        socket: {
          remoteAddress: '192.168.1.2',
        },
      } as unknown as Request;

      const fingerprint1 = identifyDevice(mockRequest1);
      const fingerprint2 = identifyDevice(mockRequest2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should handle x-forwarded-for header for proxy scenarios', () => {
      const mockRequest = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'x-forwarded-for': '203.0.113.1, 192.168.1.1',
        },
        socket: {
          remoteAddress: '10.0.0.1',
        },
      } as unknown as Request;

      const fingerprint = identifyDevice(mockRequest);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
    });

    it('should handle missing User-Agent gracefully', () => {
      const mockRequest = {
        headers: {},
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as unknown as Request;

      const fingerprint = identifyDevice(mockRequest);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
    });
  });

  describe('getRegisteredDevices', () => {
    it('should return empty array when student has no devices', async () => {
      const devices = await getRegisteredDevices(testStudentId);

      expect(devices).toEqual([]);
    });

    it('should return all registered devices for a student', async () => {
      // Register two devices
      const device1 = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'fingerprint1',
        },
      });

      const device2 = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'fingerprint2',
        },
      });

      const devices = await getRegisteredDevices(testStudentId);

      expect(devices).toHaveLength(2);
      expect(devices.find(d => d.id === device1.id)).toBeDefined();
      expect(devices.find(d => d.id === device2.id)).toBeDefined();
    });

    it('should return devices ordered by registration date (newest first)', async () => {
      // Create devices with slight time gaps
      const device1 = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'fingerprint1',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const device2 = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'fingerprint2',
        },
      });

      const devices = await getRegisteredDevices(testStudentId);

      expect(devices[0].id).toBe(device2.id); // Newest first
      expect(devices[1].id).toBe(device1.id);
    });
  });

  describe('canLoginFromDevice', () => {
    it('should return true when device is already registered', async () => {
      const fingerprint = 'test-fingerprint';
      
      await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint,
        },
      });

      const canLogin = await canLoginFromDevice(testStudentId, fingerprint);

      expect(canLogin).toBe(true);
    });

    it('should return true when student has 0 devices and device is new', async () => {
      const canLogin = await canLoginFromDevice(testStudentId, 'new-device');

      expect(canLogin).toBe(true);
    });

    it('should return false when student already has an active device', async () => {
      // One device is the whole allowance (DEVICE_LIMIT)
      await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'device1',
        },
      });

      const canLogin = await canLoginFromDevice(testStudentId, 'new-device');

      expect(canLogin).toBe(false);
    });
  });

  describe('registerDevice', () => {
    it('should register a new device when under limit', async () => {
      const fingerprint = 'new-device-fingerprint';

      const device = await registerDevice(testStudentId, fingerprint);

      expect(device.id).toBeDefined();
      expect(device.studentId).toBe(testStudentId);
      expect(device.fingerprint).toBe(fingerprint);
      expect(device.registeredAt).toBeInstanceOf(Date);
      expect(device.lastAccessedAt).toBeInstanceOf(Date);

      // Verify in database
      const dbDevice = await prisma.registeredDevice.findFirst({
        where: { studentId: testStudentId, fingerprint },
      });
      expect(dbDevice).toBeDefined();
    });

    it('should update lastAccessedAt when registering existing device', async () => {
      const fingerprint = 'existing-device';
      
      // Register device initially
      const initialDevice = await registerDevice(testStudentId, fingerprint);
      const initialAccessTime = initialDevice.lastAccessedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      // Register again (should update)
      const updatedDevice = await registerDevice(testStudentId, fingerprint);

      expect(updatedDevice.id).toBe(initialDevice.id);
      expect(updatedDevice.lastAccessedAt.getTime()).toBeGreaterThan(initialAccessTime.getTime());
    });

    it('should throw error when trying to register a 2nd device', async () => {
      await registerDevice(testStudentId, 'device1');

      await expect(registerDevice(testStudentId, 'device2')).rejects.toThrow(
        DEVICE_LIMIT_MESSAGE
      );
    });

    it('should allow registering exactly one device', async () => {
      await registerDevice(testStudentId, 'device1');

      const devices = await getRegisteredDevices(testStudentId);
      expect(devices).toHaveLength(DEVICE_LIMIT);
      expect(DEVICE_LIMIT).toBe(1);
    });
  });

  describe('updateDeviceLastAccessed', () => {
    it('should update lastAccessedAt for existing device', async () => {
      const fingerprint = 'test-device';
      
      const device = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint,
          lastAccessedAt: new Date('2024-01-01'),
        },
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await updateDeviceLastAccessed(testStudentId, fingerprint);

      const updatedDevice = await prisma.registeredDevice.findUnique({
        where: { id: device.id },
      });

      expect(updatedDevice?.lastAccessedAt.getTime()).toBeGreaterThan(
        device.lastAccessedAt.getTime()
      );
    });

    it('should not throw error for non-existent device', async () => {
      await expect(
        updateDeviceLastAccessed(testStudentId, 'non-existent')
      ).resolves.not.toThrow();
    });
  });

  describe('revokeDevice', () => {
    it('should successfully revoke a registered device', async () => {
      const device = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'test-device',
        },
      });

      await revokeDevice(testStudentId, device.id);

      const dbDevice = await prisma.registeredDevice.findUnique({
        where: { id: device.id },
      });
      expect(dbDevice).toBeNull();
    });

    it('should throw error when device does not exist', async () => {
      // A well-formed but unused UUID - the column is uuid-typed, so a
      // non-UUID string fails in the driver rather than the ownership check
      await expect(
        revokeDevice(testStudentId, '3f1e6a8c-4a3f-4c4e-9b57-2a5c4d7e8f90')
      ).rejects.toThrow('Device not found or does not belong to this student');
    });

    it('should throw error when device belongs to different student', async () => {
      // Create another student
      const otherStudent = await prisma.student.create({
        data: {
          email: 'other@example.com',
          passwordHash: await hashPassword('password123'),
        },
      });

      // Register device to other student
      const device = await prisma.registeredDevice.create({
        data: {
          studentId: otherStudent.id,
          fingerprint: 'test-device',
        },
      });

      // Try to revoke using testStudentId
      await expect(revokeDevice(testStudentId, device.id)).rejects.toThrow(
        'Device not found or does not belong to this student'
      );
    });

    it('should automatically terminate sessions via cascade delete', async () => {
      // Create device
      const device = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'test-device',
        },
      });

      // Create session for device
      const session = await prisma.session.create({
        data: {
          userId: testStudentId,
          userType: 'student',
          token: 'test-token',
          deviceId: device.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Revoke device
      await revokeDevice(testStudentId, device.id);

      // Verify session was deleted via cascade
      const dbSession = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(dbSession).toBeNull();
    });

    it('should allow registering a new device after revocation', async () => {
      // The single allowed device is taken
      const device1 = await registerDevice(testStudentId, 'device1');
      await expect(registerDevice(testStudentId, 'device2')).rejects.toThrow(
        DEVICE_LIMIT_MESSAGE
      );

      // Revoking it frees the slot
      await revokeDevice(testStudentId, device1.id);

      const newDevice = await registerDevice(testStudentId, 'device2');
      expect(newDevice.id).toBeDefined();
    });
  });

  describe('terminateDeviceSessions', () => {
    it('should delete all sessions for a specific device', async () => {
      // Create device
      const device = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'test-device',
        },
      });

      // Create multiple sessions for device
      await prisma.session.create({
        data: {
          userId: testStudentId,
          userType: 'student',
          token: 'token1',
          deviceId: device.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await prisma.session.create({
        data: {
          userId: testStudentId,
          userType: 'student',
          token: 'token2',
          deviceId: device.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await terminateDeviceSessions(device.id);

      const sessions = await prisma.session.findMany({
        where: { deviceId: device.id },
      });
      expect(sessions).toHaveLength(0);
    });

    it('should not affect sessions for other devices', async () => {
      // Create two devices
      const device1 = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'device1',
        },
      });

      const device2 = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'device2',
        },
      });

      // Create sessions for both devices
      await prisma.session.create({
        data: {
          userId: testStudentId,
          userType: 'student',
          token: 'token1',
          deviceId: device1.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await prisma.session.create({
        data: {
          userId: testStudentId,
          userType: 'student',
          token: 'token2',
          deviceId: device2.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Terminate sessions for device1
      await terminateDeviceSessions(device1.id);

      // Verify device2 sessions are unaffected
      const device2Sessions = await prisma.session.findMany({
        where: { deviceId: device2.id },
      });
      expect(device2Sessions).toHaveLength(1);
    });

    it('should not throw error for device with no sessions', async () => {
      const device = await prisma.registeredDevice.create({
        data: {
          studentId: testStudentId,
          fingerprint: 'test-device',
        },
      });

      await expect(terminateDeviceSessions(device.id)).resolves.not.toThrow();
    });
  });

  describe('Integration: Complete device lifecycle', () => {
    it('should handle full device registration, usage, and revocation flow', async () => {
      // 1. Register the account's device
      const device1 = await registerDevice(testStudentId, 'device1');
      expect(device1.id).toBeDefined();

      // 2. The same device can keep logging in
      const canLogin1 = await canLoginFromDevice(testStudentId, 'device1');
      expect(canLogin1).toBe(true);

      // 3. A second, different device is blocked
      const canLogin2 = await canLoginFromDevice(testStudentId, 'device2');
      expect(canLogin2).toBe(false);
      await expect(registerDevice(testStudentId, 'device2')).rejects.toThrow(
        DEVICE_LIMIT_MESSAGE
      );

      // 4. Revoking the active device frees the account
      await revokeDevice(testStudentId, device1.id);
      expect(await canLoginFromDevice(testStudentId, 'device2')).toBe(true);

      // 5. The new device registers and becomes the only one
      const device2 = await registerDevice(testStudentId, 'device2');
      expect(device2.id).toBeDefined();

      const devices = await getRegisteredDevices(testStudentId);
      expect(devices).toHaveLength(1);
      expect(devices.find(d => d.id === device1.id)).toBeUndefined();
      expect(devices.find(d => d.id === device2.id)).toBeDefined();
    });
  });
});
