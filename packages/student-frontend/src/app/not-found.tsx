import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          The page you are looking for does not exist. It may have moved, or the
          link may be out of date.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        Go to your dashboard
      </Link>
    </main>
  );
}
