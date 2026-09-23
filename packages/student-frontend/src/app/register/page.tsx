import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Register for NotesHub to access your subscribed subjects.',
};

export default function RegisterPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="All you need is an email address and a password."
      footer={
        <>
          Already registered?{' '}
          <Link
            href="/login"
            className="font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
