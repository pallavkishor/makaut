'use client';

import dynamic from 'next/dynamic';

/**
 * TipTap constructs its editor against a live DOM, so it must not run during
 * server rendering.
 */
export const RichTextEditor = dynamic(
  () => import('./RichTextEditor').then((mod) => mod.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border-strong bg-background-surface px-4 py-10 text-sm text-muted">
        Loading editor…
      </div>
    ),
  }
);
