import fc from 'fast-check';
import { isSafeUrl, markdownToPlainText, parseInline, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('returns nothing for empty content', () => {
    expect(parseMarkdown('')).toEqual([]);
  });

  it('reads ATX headings with their level', () => {
    expect(parseMarkdown('### Cell structure')).toEqual([
      {
        type: 'heading',
        level: 3,
        children: [{ type: 'text', value: 'Cell structure' }],
      },
    ]);
  });

  it('joins wrapped lines into one paragraph', () => {
    const blocks = parseMarkdown('first line\nsecond line\n\nnext paragraph');

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: 'first line second line' }],
    });
  });

  it('keeps fenced code verbatim, including its language', () => {
    expect(parseMarkdown('```ts\nconst a = 1;\n```')).toEqual([
      { type: 'codeBlock', value: 'const a = 1;', language: 'ts' },
    ]);
  });

  it('does not parse Markdown inside a code fence', () => {
    const blocks = parseMarkdown('```\n# not a heading\n```');

    expect(blocks).toEqual([
      { type: 'codeBlock', value: '# not a heading' },
    ]);
  });

  it('reads bullet and ordered lists', () => {
    const bullets = parseMarkdown('- one\n- two');
    const ordered = parseMarkdown('1. one\n2. two');

    expect(bullets[0]).toMatchObject({ type: 'list', ordered: false });
    expect(ordered[0]).toMatchObject({ type: 'list', ordered: true });
    expect(bullets[0]).toMatchObject({
      items: [
        [{ type: 'text', value: 'one' }],
        [{ type: 'text', value: 'two' }],
      ],
    });
  });

  it('parses blockquote contents as blocks', () => {
    expect(parseMarkdown('> quoted text')).toEqual([
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'quoted text' }],
          },
        ],
      },
    ]);
  });

  it('reads thematic breaks', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'thematicBreak' }]);
  });

  it('carries raw HTML through as text, never as markup', () => {
    // The renderer emits React elements only, so this shows up as characters
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '<img src=x onerror=alert(1)>' }],
      },
    ]);
  });
});

describe('parseInline', () => {
  it('reads bold, italic and code spans', () => {
    expect(parseInline('**bold** _italic_ `code`')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
      { type: 'text', value: ' ' },
      { type: 'emphasis', children: [{ type: 'text', value: 'italic' }] },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'code' },
    ]);
  });

  it('does not parse emphasis inside a code span', () => {
    expect(parseInline('`**not bold**`')).toEqual([
      { type: 'code', value: '**not bold**' },
    ]);
  });

  it('reads links and images', () => {
    expect(parseInline('[docs](https://example.com)')).toEqual([
      {
        type: 'link',
        href: 'https://example.com',
        children: [{ type: 'text', value: 'docs' }],
      },
    ]);

    expect(parseInline('![diagram](/uploads/images/a.png)')).toEqual([
      { type: 'image', src: '/uploads/images/a.png', alt: 'diagram' },
    ]);
  });

  it('refuses a javascript: link and shows the source text instead', () => {
    expect(parseInline('[tap](javascript:alert(1))')).toEqual([
      { type: 'text', value: '[tap](javascript:alert(1))' },
    ]);
  });
});

describe('isSafeUrl', () => {
  it.each([
    'https://example.com/a',
    'http://example.com',
    'mailto:teacher@example.com',
    '/uploads/images/a.png',
    'images/a.png',
    '#section',
  ])('allows %s', (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'java\nscript:alert(1)',
    '',
  ])('refuses %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});

describe('markdown parsing properties', () => {
  it('never produces a link or image with an unsafe URL', () => {
    const urlArbitrary = fc.oneof(
      fc.constant('javascript:alert(1)'),
      fc.constant('data:text/html,<script>'),
      fc.constant('https://example.com'),
      fc.constant('/local/path'),
      fc.webUrl(),
      fc.string({ minLength: 1 }).filter((value) => !/[\s()]/.test(value))
    );

    fc.assert(
      fc.property(urlArbitrary, (url) => {
        for (const node of parseInline(`[text](${url}) ![alt](${url})`)) {
          if (node.type === 'link') {
            expect(isSafeUrl(node.href)).toBe(true);
          }
          if (node.type === 'image') {
            expect(isSafeUrl(node.src)).toBe(true);
          }
        }
      })
    );
  });

  it('never throws, whatever the content', () => {
    fc.assert(
      fc.property(fc.string(), (markdown) => {
        expect(() => parseMarkdown(markdown)).not.toThrow();
        expect(() => markdownToPlainText(markdown)).not.toThrow();
      })
    );
  });
});
