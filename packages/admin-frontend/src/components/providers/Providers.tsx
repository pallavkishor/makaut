'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminAuthProvider } from '@/components/auth/AdminAuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { mutationRetry, retryDelayMs, shouldRetryQuery } from '@/lib/retry';

/**
 * React Query + admin auth wiring (design 3.6 "State Management").
 *
 * Retries are limited to transient failures: a 4xx from the API is a definitive
 * answer, so retrying it only delays the error the administrator needs to see.
 * Transient failures back off exponentially (see `lib/retry`), and mutations are
 * never replayed automatically because admin writes are not idempotent.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: shouldRetryQuery,
            retryDelay: retryDelayMs,
          },
          mutations: { retry: mutationRetry },
        },
      })
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
