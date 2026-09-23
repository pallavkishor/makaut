import { Fragment } from 'react';
import { parseHighlightedSnippet } from '@/lib/highlight';

interface HighlightedSnippetProps {
  /** The `headline` value from a search result. */
  headline: string;
  className?: string;
}

/**
 * Renders a search snippet with its matched terms highlighted.
 *
 * The headline is derived from Markdown note content and is NOT escaped by the
 * database, so it is never injected as HTML. It is split into plain text runs
 * (see `lib/highlight.ts`) and rendered as React text nodes plus real `<mark>`
 * elements, which means React escapes every character of note content and the
 * only element this can ever produce is `<mark>`.
 */
export function HighlightedSnippet({
  headline,
  className = '',
}: HighlightedSnippetProps) {
  const segments = parseHighlightedSnippet(headline);

  if (segments.length === 0) return null;

  return (
    <p className={`text-sm leading-relaxed text-muted ${className}`}>
      {segments.map((segment, index) =>
        segment.marked ? (
          <mark
            key={index}
            className="rounded bg-secondary-200 px-0.5 text-foreground"
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </p>
  );
}
