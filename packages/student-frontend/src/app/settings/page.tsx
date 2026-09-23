import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SettingsView } from '@/components/settings/SettingsView';

export const metadata: Metadata = {
  title: 'Account settings',
  description: 'Review and revoke the devices registered to your account.',
};

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SettingsView />
      </AppShell>
    </ProtectedRoute>
  );
}
