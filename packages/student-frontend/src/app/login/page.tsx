import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';
import { SkeletonList } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to read the notes for your subscribed subjects.',
};

export default function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email and password you registered with."
      footer={
        <>
          New here?{' '}
          <Link
            href="/register"
            className="font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600"
          >
            Create an account
          </Link>
        </>
      }
    >
      {/* The form reads the `next` redirect from the query string */}
      <Suspense fallback={<SkeletonList rows={2} label="Loading sign-in form" />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
