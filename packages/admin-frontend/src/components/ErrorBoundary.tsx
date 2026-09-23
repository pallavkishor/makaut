'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Replaces the default recovery UI. Receives a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a broken view shows a recoverable message
 * instead of a blank page (Requirement 10.5).
 *
 * The rendered message is generic; component stacks and error details go to the
 * console only (Requirement 10.6).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Timestamped so a report can be matched against server logs (design 8.2)
    console.error('[ErrorBoundary]', {
      timestamp: new Date().toISOString(),
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) {
      return children;
    }

    if (fallback) {
      return fallback(error, this.reset);
    }

    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-800">
            Something went wrong
          </p>
          <p className="mt-1 text-sm text-red-700">
            This screen failed to load. Try again, or reload the page if the
            problem continues.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={this.reset}>
              Try again
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
