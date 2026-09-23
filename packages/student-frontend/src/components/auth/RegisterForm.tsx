'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isApiError } from '@/lib/api';
import {
  MIN_PASSWORD_LENGTH,
  registerSchema,
  validate,
  type FieldErrors,
  type RegisterValues,
} from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { TextField } from '@/components/ui/TextField';

/**
 * Registration form.
 *
 * Requirements 1.1, 1.2 and 1.4: collects email and password, validates the
 * email format and the minimum password length before submitting, and shows an
 * error when the email is already registered.
 */
export function RegisterForm() {
  const { register, status } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterValues>>(
    {}
  );
  const [formError, setFormError] = useState<unknown>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setEmailTaken(false);

    const result = validate(registerSchema, { email, password });
    if (!result.success) {
      setFieldErrors(result.errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      await register(result.data.email, result.data.password);
      setPassword('');
      router.replace('/dashboard');
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        // 409 with field "email" is the duplicate-account case (Requirement 1.4)
        if (error.status === 409) {
          setEmailTaken(true);
          setFieldErrors({ email: 'This email is already registered' });
          setSubmitting(false);
          return;
        }

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
      {emailTaken ? (
        <Alert tone="warning" title="That email already has an account">
          <p>
            Try{' '}
            <Link
              href="/login"
              className="font-medium underline decoration-amber-400 underline-offset-2"
            >
              signing in
            </Link>{' '}
            instead, or register with a different email address.
          </p>
        </Alert>
      ) : null}

      {formError ? (
        <Alert
          tone="error"
          title={
            errorCode === 'RATE_LIMIT_EXCEEDED'
              ? 'Too many attempts'
              : 'Registration failed'
          }
        >
          <p>
            {errorCode === 'RATE_LIMIT_EXCEEDED'
              ? 'Too many accounts have been created from this connection recently. Wait a few minutes and try again.'
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
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />

      <Button type="submit" size="lg" fullWidth isLoading={submitting}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </Button>

      <p className="text-xs leading-relaxed text-muted">
        Your account can be used on up to two devices at a time. You can change
        which devices those are from Settings.
      </p>
    </form>
  );
}
