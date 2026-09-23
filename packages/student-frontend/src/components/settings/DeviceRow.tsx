'use client';

import { useState } from 'react';
import { formatDate, formatDateTime, toDateTimeAttribute } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import type { RegisteredDevice } from '@/types/api';

interface DeviceRowProps {
  device: RegisteredDevice;
  index: number;
  onRevoke: (deviceId: string) => void;
  revoking: boolean;
}

/**
 * One registered device with its registration date and a revoke control
 * (Requirements 2.5, 2.6).
 *
 * Revoking is a two-step action: the button swaps into an inline confirmation,
 * which also warns when the device being revoked is the one in use, because the
 * backend terminates that device's sessions (Requirement 2.8).
 */
export function DeviceRow({
  device,
  index,
  onRevoke,
  revoking,
}: DeviceRowProps) {
  const [confirming, setConfirming] = useState(false);

  const label = device.isCurrentDevice
    ? 'This device'
    : `Device ${index + 1}`;

  return (
    <li className="rounded-xl border border-border bg-background-surface p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-tertiary-200 text-muted"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <rect x="2" y="4" width="14" height="10" rx="2" />
              <rect x="16" y="9" width="6" height="11" rx="2" />
            </svg>
          </span>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">{label}</h3>
              {/* Brand secondary highlight. #263238 on #8FAF9D is 5.51:1;
                  white on sage would be 2.39:1 and is never used. */}
              {device.isCurrentDevice ? (
                <span className="rounded-full bg-secondary-500 px-2 py-0.5 text-xs font-medium text-foreground">
                  In use now
                </span>
              ) : null}
            </div>

            <dl className="space-y-0.5 text-sm text-muted">
              <div className="flex gap-1.5">
                <dt className="text-muted">Registered</dt>
                <dd>
                  <time dateTime={toDateTimeAttribute(device.registeredAt)}>
                    {formatDate(device.registeredAt)}
                  </time>
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Last used</dt>
                <dd>
                  <time dateTime={toDateTimeAttribute(device.lastAccessedAt)}>
                    {formatDateTime(device.lastAccessedAt)}
                  </time>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {!confirming ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirming(true)}
            className="sm:flex-shrink-0"
          >
            Revoke
            <span className="sr-only"> {label}</span>
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <div
          role="group"
          aria-label={`Confirm revoking ${label}`}
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm leading-relaxed text-red-900">
            {device.isCurrentDevice
              ? 'Revoking this device ends your current session and signs you out here. You can sign back in afterwards, which registers this device again.'
              : 'This device will be removed from your account and any session on it will be ended. It can be registered again the next time you sign in from it.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              isLoading={revoking}
              onClick={() => onRevoke(device.id)}
            >
              Yes, revoke {label.toLowerCase()}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={revoking}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
