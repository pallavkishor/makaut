import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Admin sign in - Educational Notes Platform',
};

/** Administrator login (Requirement 5.1). Deliberately outside the admin shell. */
export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <span className="inline-block rounded bg-background-surface/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
            Admin
          </span>
          <h1 className="mt-3 text-xl font-semibold">Educational Notes Platform</h1>
          <p className="mt-1 text-sm text-primary-200">
            Sign in with your administrator account
          </p>
        </div>

        <div className="rounded-lg bg-background-surface p-6 shadow-xl">
          <Suspense fallback={<LoadingState />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-xs text-primary-300">
          Administrator accounts are separate from student accounts.
        </p>
      </div>
    </main>
  );
}
