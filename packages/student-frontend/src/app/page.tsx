'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Entry point. Sends signed-in students to their dashboard and everyone else to
 * the login page, once the persisted session has been restored.
 */
export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    router.replace(status === 'authenticated' ? '/dashboard' : '/login');
  }, [status, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo className="scale-125" />
      <Spinner label="Loading NotesHub" className="text-primary-600" />
    </main>
  );
}
