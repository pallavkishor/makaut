import type { ReactNode } from 'react';
import { toErrorMessage } from '@/lib/apiError';
import { Button } from './Button';

/**
 * Error and empty states. Errors always render the server's user-friendly
 * message rather than technical detail (Requirement 10.6).
 */

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3" role="alert">
      <p className="text-sm font-semibold text-red-800">{title}</p>
      <p className="mt-1 text-sm text-red-700">{toErrorMessage(error)}</p>
      {onRetry ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Inline form-level error, announced to screen readers. */
export function FormError({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      role="alert"
    >
      {toErrorMessage(error)}
    </p>
  );
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
      role="status"
    >
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
