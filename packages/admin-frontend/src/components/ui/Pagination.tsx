'use client';

import { Button } from './Button';
import type { PageMeta } from '@/types';

export function Pagination({
  pagination,
  onPageChange,
  disabled = false,
}: {
  pagination: PageMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const { page, pageSize, total, totalPages } = pagination;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background-surface px-3 py-2"
    >
      <p className="text-xs text-muted" aria-live="polite">
        Showing <span className="font-medium">{from}</span>–
        <span className="font-medium">{to}</span> of{' '}
        <span className="font-medium">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
