'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useAdminAuth } from './AdminAuthProvider';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';

/**
 * Administrator credentials form (Requirements 5.1, 5.2, 5.3).
 *
 * Talks only to the admin auth context, which in turn only calls
 * /api/admin/auth/login - no student authentication code is involved.
 */

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const SESSION_NOTICES: Record<string, string> = {
  timeout: 'Your session ended after 30 minutes of inactivity. Please sign in again.',
  expired: 'Your session is no longer valid. Please sign in again.',
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, status } = useAdminAuth();

  const nextPath = searchParams.get('next');
  const notice = SESSION_NOTICES[searchParams.get('reason') ?? ''];
  const destination = nextPath && nextPath.startsWith('/') ? nextPath : '/students';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: skip the form.
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(destination);
    }
  }, [destination, router, status]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const parsed = credentialsSchema.safeParse({ email, password });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      await login(parsed.data.email, parsed.data.password);
      router.replace(destination);
    } catch (error) {
      // Requirement 5.3: surface the rejection, keep the email so the
      // administrator only has to retype the password.
      setSubmitError(error);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {notice ? (
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <FormError error={submitError} />

      <TextField
        label="Email address"
        type="email"
        name="email"
        autoComplete="username"
        autoFocus
        required
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <Button type="submit" loading={submitting} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
