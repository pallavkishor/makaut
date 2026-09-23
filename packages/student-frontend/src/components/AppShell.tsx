'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from './Logo';
import { Button } from './ui/Button';

/**
 * Shared chrome for signed-in pages: skip link, sticky header with navigation,
 * and a centered content column.
 *
 * On small screens the navigation collapses behind a disclosure button that
 * reports its state through aria-expanded / aria-controls.
 */

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/browse', label: 'Browse' },
  { href: '/search', label: 'Search' },
  { href: '/settings', label: 'Settings' },
] as const;

interface AppShellProps {
  children: React.ReactNode;
  /** Constrains the content column. Note pages use a narrower measure. */
  width?: 'default' | 'reading';
}

export function AppShell({ children, width = 'default' }: AppShellProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Close the mobile menu whenever navigation happens
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  }

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-700 focus:shadow-lg focus:ring-2 focus:ring-primary-600"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
            aria-label="NotesHub dashboard"
          >
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={[
                      'inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                      isActive(item.href)
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-muted hover:bg-tertiary-200 hover:text-foreground',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <span
                className="max-w-[16rem] truncate text-sm text-muted"
                title={user.email}
              >
                {user.email}
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSignOut}
              isLoading={signingOut}
            >
              Sign out
            </Button>
          </div>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-tertiary-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 md:hidden"
          >
            <span className="sr-only">
              {menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>

        {menuOpen ? (
          <nav
            id="mobile-navigation"
            aria-label="Main"
            className="border-t border-border bg-background-surface px-4 py-3 md:hidden"
          >
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={[
                      'block rounded-lg px-3 py-2.5 text-sm font-medium',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                      isActive(item.href)
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-foreground hover:bg-tertiary-200',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-border pt-3">
              {user ? (
                <p className="mb-2 truncate px-3 text-xs text-muted">
                  Signed in as {user.email}
                </p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={handleSignOut}
                isLoading={signingOut}
              >
                Sign out
              </Button>
            </div>
          </nav>
        ) : null}
      </header>

      <main
        id="main-content"
        className={[
          'mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8',
          width === 'reading' ? 'max-w-3xl' : 'max-w-6xl',
        ].join(' ')}
      >
        {children}
      </main>

      <footer className="border-t border-border bg-background-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6 lg:px-8">
          NotesHub · Your subscriptions give you access for as long as they are
          active.
        </div>
      </footer>
    </div>
  );
}
