import Link from 'next/link';
import { Logo } from '@/components/Logo';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Link shown below the card, e.g. "Already have an account?". */
  footer: React.ReactNode;
}

/** Centered single-column layout shared by /login and /register. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#auth-form"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-700 focus:shadow-lg"
      >
        Skip to the form
      </a>

      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          aria-label="NotesHub home"
        >
          <Logo />
        </Link>
      </header>

      <main
        id="auth-form"
        className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6"
      >
        <div className="w-full max-w-md">
          <div className="mb-6 text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background-surface p-6 shadow-sm sm:p-8">
            {children}
          </div>

          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
