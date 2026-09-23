'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from './ui/Spinner';

/**
 * Gate for authenticated pages.
 *
 * While the persisted session is being restored nothing is rendered but a
 * loading state, so protected content never flashes. Unauthenticated visitors
 * are redirected to /login with a `next` parameter so they land back here after
 * signing in.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'unauthenticated') return;

    // Read the location directly: this effect is client-only, and it keeps the
    // component out of the useSearchParams suspense requirement.
    const target = `${window.location.pathname}${window.location.search}`;
    const next =
      target && target !== '/' ? `?next=${encodeURIComponent(target)}` : '';

    router.replace(`/login${next}`);
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        <Spinner size="lg" label="Checking your session" />
      </div>
    );
  }

  return <>{children}</>;
}
