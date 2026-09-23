import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardView } from '@/components/dashboard/DashboardView';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Your subscription status, the program you selected, and its subjects.',
};

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <DashboardView />
      </AppShell>
    </ProtectedRoute>
  );
}
