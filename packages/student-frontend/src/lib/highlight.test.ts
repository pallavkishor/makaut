import fc from 'fast-check';
import { parseHighlightedSnippet, snippetToPlainText } from './highlight';

/**
 * Search snippets arrive as `ts_headline` output: note content with matched
 * terms wrapped in `<mark>`. The content around the delimiters is unescaped, so
 * the parser's job is to hand the renderer plain text only.
 */
describe('parseHighlightedSnippet', () => {
  it('returns nothing for an empty snippet', () => {
    expect(parseHighlightedSnippet('')).toEqual([]);
  });

  it('returns a single unmarked segment when there is no highlight', () => {
    expect(parseHighlightedSnippet('plain text')).toEqual([
      { text: 'plain text', marked: false },
    ]);
  });

  it('splits a highlight out of the surrounding text', () => {
    expect(
      parseHighlightedSnippet('the <mark>mitochondrion</mark> is an organelle')
    ).toEqual([
      { text: 'the ', marked: false },
      { text: 'mitochondrion', marked: true },
      { text: ' is an organelle', marked: false },
    ]);
  });

  it('handles several highlights and adjacent delimiters', () => {
    expect(
      parseHighlightedSnippet('<mark>one</mark><mark>two</mark> three')
    ).toEqual([
      { text: 'one', marked: true },
      { text: 'two', marked: true },
      { text: ' three', marked: false },
    ]);
  });

  it('keeps markup from note content as literal text', () => {
    // A note author can type anything; none of it may become markup
    const segments = parseHighlightedSnippet(
      'before <script>alert(1)</script> <mark>after</mark>'
    );

    expect(segments[0]).toEqual({
      text: 'before <script>alert(1)</script> ',
      marked: false,
    });
    expect(segments[1]).toEqual({ text: 'after', marked: true });
  });

  it('tolerates an unclosed highlight', () => {
    expect(parseHighlightedSnippet('start <mark>rest')).toEqual([
      { text: 'start ', marked: false },
      { text: 'rest', marked: true },
    ]);
  });

  it('tolerates a stray closing delimiter', () => {
    expect(parseHighlightedSnippet('start</mark> rest')).toEqual([
      { text: 'start', marked: false },
      { text: ' rest', marked: false },
    ]);
  });

  it('is repeatable, despite the module-level regex', () => {
    const headline = 'a <mark>b</mark> c';
    expect(parseHighlightedSnippet(headline)).toEqual(
      parseHighlightedSnippet(headline)
    );
  });
});

describe('snippet parsing properties', () => {
  /** Snippet-shaped input: arbitrary text with delimiters sprinkled through. */
  const snippetArbitrary = fc
    .array(
      fc.oneof(
        fc.string(),
        fc.constant('<mark>'),
        fc.constant('</mark>'),
        fc.constant('<MARK>'),
        fc.constant('<script>'),
        fc.constant('&amp;')
      ),
      { maxLength: 24 }
    )
    .map((parts) => parts.join(''));

  it('preserves every character except the delimiters themselves', () => {
    fc.assert(
      fc.property(snippetArbitrary, (headline) => {
        const expected = headline.replace(/<\/?mark>/gi, '');
        expect(snippetToPlainText(headline)).toBe(expected);
      })
    );
  });

  it('never emits a delimiter or an empty segment', () => {
    fc.assert(
      fc.property(snippetArbitrary, (headline) => {
        for (const segment of parseHighlightedSnippet(headline)) {
          expect(segment.text.length).toBeGreaterThan(0);
          expect(segment.text.toLowerCase()).not.toContain('<mark>');
          expect(segment.text.toLowerCase()).not.toContain('</mark>');
        }
      })
    );
  });
});
