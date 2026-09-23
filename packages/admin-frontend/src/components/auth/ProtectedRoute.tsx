'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminAuth } from './AdminAuthProvider';
import { FullPageLoader } from '@/components/ui/Spinner';

/**
 * Gate for every authenticated admin route (Requirement 5.6).
 * Unauthenticated visitors are redirected to /login with the path they wanted
 * so they land back where they intended after signing in.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [pathname, router, status]);

  if (status !== 'authenticated') {
    return <FullPageLoader label="Checking your session…" />;
  }

  return <>{children}</>;
}
