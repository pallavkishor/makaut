import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SessionTimeoutModal } from '@/components/auth/SessionTimeoutModal';
import { AdminShell } from '@/components/layout/AdminShell';

/**
 * Layout for every authenticated admin route. Everything under this route group
 * is wrapped in ProtectedRoute, so no admin page can render without a session
 * (Requirements 5.4, 5.6).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminShell>{children}</AdminShell>
      <SessionTimeoutModal />
    </ProtectedRoute>
  );
}
