'use client';

import { errorMessageOf, isApiError } from '@/lib/api';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';

interface ErrorStateProps {
  error: unknown;
  /** Heading shown above the message. */
  title?: string;
  /** When provided, renders a retry control. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Renders a failed request in a consistent way, translating the few error codes
 * that deserve a bespoke explanation into plain language.
 */
export function ErrorState({
  error,
  title,
  onRetry,
  className = '',
}: ErrorStateProps) {
  const code = isApiError(error) ? error.code : null;

  const heading =
    title ??
    (code === 'NETWORK_ERROR'
      ? 'Cannot reach the server'
      : code === 'RATE_LIMIT_EXCEEDED'
        ? 'Too many requests'
        : 'Something went wrong');

  const message =
    code === 'RATE_LIMIT_EXCEEDED'
      ? 'You have made a lot of requests in a short time. Wait a moment and try again.'
      : errorMessageOf(error);

  return (
    <Alert tone="error" title={heading} className={className}>
      <p>{message}</p>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </Alert>
  );
}
