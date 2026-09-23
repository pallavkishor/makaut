'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isApiError } from '@/lib/api';
import {
  loginSchema,
  validate,
  type FieldErrors,
  type LoginValues,
} from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { TextField } from '@/components/ui/TextField';
import { DeviceLimitNotice } from './DeviceLimitNotice';

/**
 * Sign-in form.
 *
 * Requirements 1.5 and 1.7: accepts email and password, and displays an error
 * when the credentials are rejected. Requirement 2.4: a login blocked by the
 * device limit gets its own explanation instead of a generic failure.
 */
export function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginValues>>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only allow same-origin relative redirects
  const nextParam = searchParams.get('next');
  const redirectTo =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/dashboard';

  // Already signed in (or just signed in): leave the auth pages
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(redirectTo);
    }
  }, [status, router, redirectTo]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = validate(loginSchema, { email, password });
    if (!result.success) {
      setFieldErrors(result.errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      await login(result.data.email, result.data.password);
      // Clear the password from component state as soon as it is no longer needed
      setPassword('');
      router.replace(redirectTo);
    } catch (error) {
      // Field-level validation rejected by the server gets attached to the field
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        const field = (error.details as { field?: string } | undefined)?.field;
        if (field === 'email' || field === 'password') {
          setFieldErrors({ [field]: error.message });
          setSubmitting(false);
          return;
        }
      }

      setFormError(error);
    } finally {
      setSubmitting(false);
    }
  }

  const errorCode = isApiError(formError) ? formError.code : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {errorCode === 'DEVICE_LIMIT_REACHED' ? <DeviceLimitNotice /> : null}

      {formError && errorCode !== 'DEVICE_LIMIT_REACHED' ? (
        <Alert
          tone="error"
          title={
            errorCode === 'AUTHENTICATION_FAILED'
              ? 'We could not sign you in'
              : errorCode === 'RATE_LIMIT_EXCEEDED'
                ? 'Too many attempts'
                : 'Sign in failed'
          }
        >
          <p>
            {errorCode === 'AUTHENTICATION_FAILED'
              ? 'That email and password combination does not match an account. Check both and try again.'
              : errorCode === 'RATE_LIMIT_EXCEEDED'
                ? 'Too many sign-in attempts from this connection. Wait a few minutes before trying again.'
                : isApiError(formError)
                  ? formError.message
                  : 'Something went wrong. Please try again.'}
          </p>
        </Alert>
      ) : null}

      <TextField
        label="Email address"
        type="email"
        name="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        autoFocus
      />

      <PasswordField
        label="Password"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        autoComplete="current-password"
        required
      />

      <Button type="submit" size="lg" fullWidth isLoading={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
