'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert } from './ui/Alert';
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
 * Catches render-time exceptions so a single broken component shows a
 * recoverable message instead of a blank page (Requirement 10.5).
 *
 * The message is deliberately generic: React errors carry component stacks and
 * internal detail that must not be shown to a student (Requirement 10.6). The
 * detail goes to the console for developers.
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
        <Alert tone="error" title="Something went wrong">
          <p>
            This part of the page failed to load. You can try again, or reload
            if the problem continues.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={this.reset}>
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
}
