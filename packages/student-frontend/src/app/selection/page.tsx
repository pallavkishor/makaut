import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SelectionForm } from '@/components/selection/SelectionForm';

export const metadata: Metadata = {
  title: 'Your program',
  description:
    'Choose the university, program, stream and semester you are studying.',
};

export default function SelectionPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mx-auto max-w-2xl space-y-8">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Your program
            </h1>
            <p className="text-sm text-muted">
              Pick where you study and your dashboard will open on that
              semester&apos;s subjects. You can change it whenever you like, and{' '}
              <Link
                href="/browse"
                className="font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600"
              >
                browsing the full catalogue
              </Link>{' '}
              is always available.
            </p>
          </header>

          <SelectionForm />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
