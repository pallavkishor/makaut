/**
 * Search snippet handling.
 *
 * `GET /api/catalog/search` returns a `headline` produced by Postgres
 * `ts_headline` over the note's MARKDOWN content, with matched terms wrapped in
 * literal `<mark>` / `</mark>`. Everything around those delimiters is raw note
 * content: it is not HTML-escaped, and it can contain anything a note author
 * typed, including angle brackets.
 *
 * So the snippet is never injected as HTML. This module splits it into plain
 * text segments plus a flag for the highlighted ones; the renderer emits React
 * text nodes and real `<mark>` elements, which means React escapes every
 * character of note content for us. No sanitizer, no `dangerouslySetInnerHTML`,
 * and no other tag can ever be produced - an author's `<script>` renders as the
 * five visible characters they typed.
 */

/** One run of snippet text, highlighted or not. */
export interface HighlightSegment {
  text: string;
  marked: boolean;
}

/** Matches the exact delimiters ts_headline is configured with. */
const MARK_TAG = /<\/?mark>/gi;

const OPEN_TAG = '<mark>';

/**
 * Splits a `ts_headline` snippet into text segments.
 *
 * Unbalanced delimiters are tolerated: a second `<mark>` before a close is
 * treated as still-open, and a stray `</mark>` simply ends the highlight. Empty
 * runs are dropped so the output never contains blank segments.
 *
 * @param headline - Raw `headline` value from the search response
 * @returns Segments in document order; `[]` for an empty snippet
 */
export function parseHighlightedSnippet(headline: string): HighlightSegment[] {
  if (!headline) return [];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let marked = false;

  // Reset because the regex is module-level and stateful with /g
  MARK_TAG.lastIndex = 0;

  let match = MARK_TAG.exec(headline);

  while (match !== null) {
    const text = headline.slice(cursor, match.index);

    if (text.length > 0) {
      segments.push({ text, marked });
    }

    marked = match[0].toLowerCase() === OPEN_TAG;
    cursor = match.index + match[0].length;
    match = MARK_TAG.exec(headline);
  }

  const tail = headline.slice(cursor);
  if (tail.length > 0) {
    segments.push({ text: tail, marked });
  }

  return segments;
}

/** The snippet as plain text, with the highlight delimiters removed. */
export function snippetToPlainText(headline: string): string {
  return parseHighlightedSnippet(headline)
    .map((segment) => segment.text)
    .join('');
}
