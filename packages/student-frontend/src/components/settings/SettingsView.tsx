'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDevices, useRevokeDevice } from '@/lib/queries';
import { ErrorState } from '@/components/ErrorState';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { DeviceRow } from './DeviceRow';

/**
 * Account settings.
 *
 * Requirement 2.5: lists every registered device with its registration date.
 * Requirements 2.6 and 2.7: each device has a revoke control that removes it
 * from the account.
 */
export function SettingsView() {
  const { user } = useAuth();
  const devicesQuery = useDevices();
  const revokeDevice = useRevokeDevice();

  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);

  const devices = devicesQuery.data?.devices ?? [];
  const deviceLimit = devicesQuery.data?.deviceLimit ?? 2;
  const slotsFree = Math.max(deviceLimit - devices.length, 0);

  function handleRevoke(deviceId: string) {
    setRevokedMessage(null);
    setPendingDeviceId(deviceId);

    revokeDevice.mutate(deviceId, {
      onSuccess: () => {
        setRevokedMessage(
          'Device revoked. Any session on it has been signed out.'
        );
      },
      onSettled: () => {
        setPendingDeviceId(null);
      },
    });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Account settings
        </h1>
        <p className="text-sm text-muted">
          {user?.email ? `${user.email} · ` : ''}Manage the devices that can use
          your account.
        </p>
      </header>

      <section aria-labelledby="devices-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="devices-heading"
            className="text-lg font-semibold text-foreground"
          >
            Registered devices
          </h2>
          <p className="text-sm text-muted">
            Your account works on up to {deviceLimit} devices at a time.
            {devices.length > 0
              ? ` ${devices.length} of ${deviceLimit} in use${
                  slotsFree > 0
                    ? `, ${slotsFree} slot${slotsFree === 1 ? '' : 's'} free`
                    : ''
                }.`
              : ''}
          </p>
        </div>

        {revokedMessage ? (
          <Alert tone="success">{revokedMessage}</Alert>
        ) : null}

        {revokeDevice.isError ? (
          <ErrorState
            error={revokeDevice.error}
            title="We could not revoke that device"
          />
        ) : null}

        {devicesQuery.isError ? (
          <ErrorState
            error={devicesQuery.error}
            title="We could not load your devices"
            onRetry={() => void devicesQuery.refetch()}
          />
        ) : null}

        {devicesQuery.isPending ? (
          <SkeletonList rows={2} label="Loading your devices" />
        ) : null}

        {!devicesQuery.isPending && !devicesQuery.isError ? (
          devices.length === 0 ? (
            <EmptyState
              title="No registered devices"
              description="Devices are registered automatically the first time you sign in from them."
            />
          ) : (
            <ul className="space-y-3">
              {devices.map((device, index) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  index={index}
                  onRevoke={handleRevoke}
                  revoking={
                    revokeDevice.isPending && pendingDeviceId === device.id
                  }
                />
              ))}
            </ul>
          )
        ) : null}

        {devices.length >= deviceLimit ? (
          <Alert tone="info" title="All device slots are in use">
            <p>
              To sign in somewhere new, revoke one of the devices above first.
              Otherwise the new sign-in will be blocked.
            </p>
          </Alert>
        ) : null}
      </section>
    </div>
  );
}
