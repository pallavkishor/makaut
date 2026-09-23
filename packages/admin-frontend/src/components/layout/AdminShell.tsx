'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from '@/components/auth/AdminAuthProvider';
import { Button } from '@/components/ui/Button';

const NAV_ITEMS = [
  { href: '/hierarchy', label: 'Hierarchy' },
  { href: '/subjects', label: 'Subjects' },
  { href: '/chapters', label: 'Chapters' },
  { href: '/notes', label: 'Notes' },
  { href: '/resources', label: 'Resources' },
  { href: '/students', label: 'Students' },
  { href: '/plans', label: 'Plans' },
  { href: '/subscriptions', label: 'Subscriptions' },
];

/** Chrome for the authenticated admin area: purple header + primary nav. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useAdminAuth();

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background-surface focus:px-3 focus:py-2 focus:text-sm focus:text-primary-800"
      >
        Skip to content
      </a>

      <header className="bg-primary-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="rounded bg-background-surface/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Admin
            </span>
            <span className="text-sm font-semibold">Educational Notes Platform</span>
          </div>
          <div className="flex items-center gap-3">
            {admin ? (
              <span className="text-xs text-primary-100">{admin.email}</span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void logout('manual')}
            >
              Sign out
            </Button>
          </div>
        </div>

        <nav aria-label="Admin sections" className="border-t border-primary-700/60">
          <ul className="mx-auto flex max-w-7xl gap-1 px-2">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-block border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-background-surface text-white'
                        : 'border-transparent text-primary-100 hover:border-primary-300 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main id="admin-main" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
