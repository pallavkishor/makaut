import type { ReactNode } from 'react';

/**
 * Dense table primitives tuned for scanning many rows at once.
 */

export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background-surface shadow-sm">
      {children}
    </div>
  );
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Table({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: string;
}) {
  return (
    <table className="min-w-full divide-y divide-border text-sm">
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      {children}
    </table>
  );
}

export function Th({
  children,
  className = '',
  scope = 'col',
}: {
  children: ReactNode;
  className?: string;
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-middle text-foreground ${className}`}>{children}</td>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border-subtle">{children}</tbody>;
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-tertiary">{children}</thead>;
}

export function Tr({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <tr className={`hover:bg-primary-50/40 ${className}`}>{children}</tr>;
}
