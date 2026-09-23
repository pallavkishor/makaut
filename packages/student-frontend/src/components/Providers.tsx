'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { mutationRetry, retryDelayMs, shouldRetryQuery } from '@/lib/retry';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Client-side providers for the whole app: server state (React Query) wrapped by
 * authentication state, so query hooks can read the session token.
 *
 * Retry behaviour lives in `lib/retry`: transient failures (network, 5xx) are
 * retried up to 3 attempts with exponential backoff, 4xx responses are final,
 * and mutations are never replayed automatically.
 */

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
        retryDelay: retryDelayMs,
      },
      mutations: {
        retry: mutationRetry,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session, created lazily so it is never shared
  // between requests during server rendering
  const [queryClient] = useState(createQueryClient);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
