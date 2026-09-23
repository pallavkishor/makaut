'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { getStudent, listStudentDevices, revokeStudentDevice } from '@/lib/api/students';
import { formatDateTime } from '@/lib/dates';
import { queryKeys } from '@/lib/queryKeys';
import { SubscriptionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHeader, Panel } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/Spinner';
import {
  Table,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui/Table';
import type { RegisteredDevice } from '@/types';

/**
 * Student detail: registration info, subscriptions, and registered devices with
 * administrator revocation (Requirements 7.2, 7.5, 7.6, 7.7, 7.8).
 */
export function StudentDetailView({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [deviceToRevoke, setDeviceToRevoke] = useState<RegisteredDevice | null>(null);

  const detailQuery = useQuery({
    queryKey: queryKeys.students.detail(studentId),
    queryFn: () => getStudent(studentId),
  });

  const devicesQuery = useQuery({
    queryKey: queryKeys.students.devices(studentId),
    queryFn: () => listStudentDevices(studentId),
  });

  const revokeMutation = useMutation({
    mutationFn: (deviceId: string) => revokeStudentDevice(studentId, deviceId),
    onSuccess: async () => {
      setDeviceToRevoke(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.students.devices(studentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.students.detail(studentId),
        }),
      ]);
    },
  });

  const student = detailQuery.data?.student;
  const subscriptions = detailQuery.data?.subscriptions ?? [];
  const devices = devicesQuery.data ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/students" className="text-primary-700 hover:underline">
            ← All students
          </Link>
        }
        title={student?.email ?? 'Student'}
        description={
          student
            ? `Registered ${formatDateTime(student.registeredAt)}`
            : 'Loading student account…'
        }
      />

      {detailQuery.isError ? (
        <div className="mb-4">
          <ErrorState
            error={detailQuery.error}
            title="Could not load this student"
            onRetry={() => void detailQuery.refetch()}
          />
        </div>
      ) : null}

      {detailQuery.isPending ? <LoadingState label="Loading student…" /> : null}

      {student ? (
        <div className="space-y-4">
          <Panel title="Account" description="Registration details">
            <dl className="grid grid-cols-1 gap-4 px-4 py-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  Email
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">{student.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  Registered
                </dt>
                <dd className="mt-0.5 text-foreground">
                  {formatDateTime(student.registeredAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  Student ID
                </dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-muted">
                  {student.id}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel
            title="Subscriptions"
            description="Every subscription on this account with its current status"
            actions={
              <Link
                href={`/subscriptions?studentId=${student.id}`}
                className="text-sm font-medium text-primary-700 hover:underline"
              >
                Manage subscriptions
              </Link>
            }
          >
            <TableScroll>
              <Table caption="Subscriptions for this student">
                <Thead>
                  <tr>
                    <Th>Plan</Th>
                    <Th>Period start</Th>
                    <Th>Period end</Th>
                    <Th>Status</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {subscriptions.map((subscription) => (
                    <Tr key={subscription.id}>
                      <Td className="font-medium text-foreground">
                        {subscription.planName ?? subscription.planId}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDateTime(subscription.currentPeriodStart)}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDateTime(subscription.currentPeriodEnd)}
                      </Td>
                      <Td>
                        <SubscriptionStatusBadge status={subscription.status} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableScroll>
            {subscriptions.length === 0 ? (
              <EmptyState
                title="No subscriptions"
                description="This student has no subscriptions yet."
              />
            ) : null}
          </Panel>

          <Panel
            title="Registered devices"
            description="Maximum one device per account. Revoking frees the slot and ends that device's sessions."
          >
            {devicesQuery.isError ? (
              <div className="px-4 py-3">
                <ErrorState
                  error={devicesQuery.error}
                  title="Could not load devices"
                  onRetry={() => void devicesQuery.refetch()}
                />
              </div>
            ) : null}

            <TableScroll>
              <Table caption="Registered devices for this student">
                <Thead>
                  <tr>
                    <Th>Device ID</Th>
                    <Th>Registered</Th>
                    <Th>Last accessed</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </Thead>
                <Tbody>
                  {devices.map((device) => (
                    <Tr key={device.id}>
                      <Td className="break-all font-mono text-xs text-muted">
                        {device.id}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDateTime(device.registeredAt)}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDateTime(device.lastAccessedAt)}
                      </Td>
                      <Td className="text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeviceToRevoke(device)}
                        >
                          Revoke
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableScroll>

            {devicesQuery.isPending ? <LoadingState label="Loading devices…" /> : null}

            {!devicesQuery.isPending && devices.length === 0 ? (
              <EmptyState
                title="No registered devices"
                description="This student has not signed in from any device yet."
              />
            ) : null}
          </Panel>
        </div>
      ) : null}

      <ConfirmDialog
        open={deviceToRevoke !== null}
        title="Revoke this device?"
        description="The student will be signed out on this device and will need to sign in again to re-register it."
        confirmLabel="Revoke device"
        pending={revokeMutation.isPending}
        error={revokeMutation.error}
        onCancel={() => {
          revokeMutation.reset();
          setDeviceToRevoke(null);
        }}
        onConfirm={() => {
          if (deviceToRevoke) {
            revokeMutation.mutate(deviceToRevoke.id);
          }
        }}
      >
        {deviceToRevoke ? (
          <p className="text-sm text-foreground">
            Device{' '}
            <span className="break-all font-mono text-xs">{deviceToRevoke.id}</span>,
            registered {formatDateTime(deviceToRevoke.registeredAt)}.
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
