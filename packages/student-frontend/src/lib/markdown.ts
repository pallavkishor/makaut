/**
 * Markdown parser for note bodies.
 *
 * Note content is Markdown after the schema redesign (it used to be sanitized
 * HTML). Rather than convert it to an HTML string and inject that, this parser
 * produces a small node tree that the renderer turns into React elements, so
 * note content can only ever become text or one of the elements listed below.
 * Nothing an author writes - raw HTML included - can introduce an element or an
 * attribute the renderer does not create itself.
 *
 * Supported subset: ATX headings, paragraphs, fenced code blocks, blockquotes,
 * bullet and ordered lists, thematic breaks, and inline code, bold, italic,
 * links and images. Anything else is carried through as literal text, which is
 * the safe failure mode: an unsupported construct is shown, never executed.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'emphasis'; children: InlineNode[] }
  | { type: 'link'; href: string; title?: string; children: InlineNode[] }
  | { type: 'image'; src: string; alt: string; title?: string };

export type BlockNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'codeBlock'; value: string; language?: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'blockquote'; children: BlockNode[] }
  | { type: 'thematicBreak' };

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

/** Schemes a note author may link to. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * True when the value contains a C0 control character or DEL.
 *
 * Checked by code point rather than by regex: an embedded newline or tab is the
 * classic way to smuggle `java&#10;script:` past a scheme check.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }

  return false;
}

/**
 * Decides whether a URL from note content may be used as an `href` or `src`.
 *
 * Relative URLs, fragments and the three schemes above are allowed. Anything
 * else - `javascript:`, `data:`, `vbscript:`, an unknown app scheme - is
 * refused, and the caller renders the construct as plain text instead.
 *
 * @param url - Raw URL as written in the Markdown
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();

  if (trimmed.length === 0) return false;
  // Control characters are how `java\nscript:` style bypasses are smuggled in
  if (hasControlCharacter(trimmed)) return false;

  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;

  // A scheme is everything before the first colon, when it comes first
  const colon = trimmed.indexOf(':');
  const slash = trimmed.indexOf('/');

  if (colon === -1 || (slash !== -1 && slash < colon)) {
    // No scheme at all: a relative path such as `notes/intro.md`
    return true;
  }

  return SAFE_SCHEMES.has(trimmed.slice(0, colon + 1).toLowerCase());
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

/**
 * One pass over the inline constructs. Order matters: code spans win over
 * everything, and images are tried before links so `![a](b)` is not read as a
 * link preceded by a `!`.
 */
const INLINE_PATTERN = new RegExp(
  [
    '(`+)([\\s\\S]+?)\\1', // 1-2 code span
    '!\\[([^\\]]*)\\]\\(\\s*([^\\s)]+)(?:\\s+"([^"]*)")?\\s*\\)', // 3-5 image
    '\\[([^\\]]+)\\]\\(\\s*([^\\s)]+)(?:\\s+"([^"]*)")?\\s*\\)', // 6-8 link
    '\\*\\*([\\s\\S]+?)\\*\\*', // 9 strong (*)
    '__([\\s\\S]+?)__', // 10 strong (_)
    '\\*([^\\s*][\\s\\S]*?)\\*', // 11 emphasis (*)
    '_([^\\s_][\\s\\S]*?)_', // 12 emphasis (_)
  ].join('|'),
  'g'
);

function pushText(nodes: InlineNode[], value: string): void {
  if (value.length === 0) return;

  const last = nodes[nodes.length - 1];
  if (last && last.type === 'text') {
    last.value += value;
    return;
  }

  nodes.push({ type: 'text', value });
}

/**
 * Parses the inline content of one block.
 *
 * @param source - Block text with newlines already normalized to spaces
 * @returns Inline nodes in document order
 */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match = INLINE_PATTERN.exec(source);

  while (match !== null) {
    pushText(nodes, source.slice(cursor, match.index));

    const [raw, , codeValue, imageAlt, imageSrc, imageTitle, linkText, linkHref, linkTitle, strongStar, strongUnderscore, emStar, emUnderscore] =
      match;

    if (codeValue !== undefined) {
      nodes.push({ type: 'code', value: codeValue.trim() });
    } else if (imageSrc !== undefined) {
      if (isSafeUrl(imageSrc)) {
        nodes.push({
          type: 'image',
          src: imageSrc.trim(),
          alt: imageAlt ?? '',
          ...(imageTitle ? { title: imageTitle } : {}),
        });
      } else {
        // Refused URL: show what was written rather than silently dropping it
        pushText(nodes, raw);
      }
    } else if (linkHref !== undefined) {
      if (isSafeUrl(linkHref)) {
        nodes.push({
          type: 'link',
          href: linkHref.trim(),
          ...(linkTitle ? { title: linkTitle } : {}),
          children: parseInline(linkText ?? ''),
        });
      } else {
        pushText(nodes, raw);
      }
    } else if (strongStar !== undefined || strongUnderscore !== undefined) {
      nodes.push({
        type: 'strong',
        children: parseInline(strongStar ?? strongUnderscore ?? ''),
      });
    } else if (emStar !== undefined || emUnderscore !== undefined) {
      nodes.push({
        type: 'emphasis',
        children: parseInline(emStar ?? emUnderscore ?? ''),
      });
    }

    cursor = match.index + raw.length;
    match = INLINE_PATTERN.exec(source);
  }

  pushText(nodes, source.slice(cursor));

  return nodes;
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const FENCE = /^ {0,3}(```|~~~)\s*([^\s`~]*)/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BLOCKQUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET_ITEM = /^ {0,3}[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^ {0,3}\d{1,9}[.)]\s+(.*)$/;
const BLANK = /^\s*$/;

function startsNewBlock(line: string): boolean {
  return (
    BLANK.test(line) ||
    HEADING.test(line) ||
    FENCE.test(line) ||
    THEMATIC_BREAK.test(line) ||
    BLOCKQUOTE.test(line) ||
    BULLET_ITEM.test(line) ||
    ORDERED_ITEM.test(line)
  );
}

/** Joins the lines of one paragraph or list item into a single inline source. */
function joinLines(lines: string[]): string {
  return lines.map((line) => line.trim()).join(' ').trim();
}

/**
 * Parses a Markdown document into blocks.
 *
 * @param markdown - Note content exactly as returned by the API
 * @returns Block nodes in document order; `[]` for empty content
 */
export function parseMarkdown(markdown: string): BlockNode[] {
  if (!markdown) return [];

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (BLANK.test(line)) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const delimiter = fence[1];
      const language = fence[2];
      const body: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith(delimiter)) {
        body.push(lines[index]);
        index += 1;
      }

      // Skip the closing fence when there is one; an unclosed block just ends
      if (index < lines.length) index += 1;

      blocks.push({
        type: 'codeBlock',
        value: body.join('\n'),
        ...(language ? { language } : {}),
      });
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ type: 'thematicBreak' });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      // Trailing hashes are decoration in ATX headings
      const text = heading[2].replace(/\s+#+\s*$/, '').trim();
      blocks.push({ type: 'heading', level, children: parseInline(text) });
      index += 1;
      continue;
    }

    if (BLOCKQUOTE.test(line)) {
      const quoted: string[] = [];

      while (index < lines.length) {
        const quote = BLOCKQUOTE.exec(lines[index]);
        if (!quote) break;
        quoted.push(quote[1]);
        index += 1;
      }

      blocks.push({ type: 'blockquote', children: parseMarkdown(quoted.join('\n')) });
      continue;
    }

    const isOrdered = ORDERED_ITEM.test(line);
    if (isOrdered || BULLET_ITEM.test(line)) {
      const pattern = isOrdered ? ORDERED_ITEM : BULLET_ITEM;
      const items: string[][] = [];

      while (index < lines.length) {
        const item = pattern.exec(lines[index]);
        if (!item) break;

        const itemLines = [item[1]];
        index += 1;

        // Lazy continuation: plain lines belong to the item above them
        while (index < lines.length && !startsNewBlock(lines[index])) {
          itemLines.push(lines[index]);
          index += 1;
        }

        items.push(itemLines);
      }

      blocks.push({
        type: 'list',
        ordered: isOrdered,
        items: items.map((itemLines) => parseInline(joinLines(itemLines))),
      });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;

    while (index < lines.length && !startsNewBlock(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }

    blocks.push({ type: 'paragraph', children: parseInline(joinLines(paragraph)) });
  }

  return blocks;
}

/** Flattens a block tree to plain text, for previews and summaries. */
export function markdownToPlainText(markdown: string, maxLength = 160): string {
  const flattenInline = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case 'text':
          case 'code':
            return node.value;
          case 'image':
            return node.alt;
          default:
            return flattenInline(node.children);
        }
      })
      .join('');

  const flattenBlocks = (blocks: BlockNode[]): string =>
    blocks
      .map((block) => {
        switch (block.type) {
          case 'heading':
          case 'paragraph':
            return flattenInline(block.children);
          case 'codeBlock':
            return block.value;
          case 'list':
            return block.items.map(flattenInline).join(' ');
          case 'blockquote':
            return flattenBlocks(block.children);
          case 'thematicBreak':
            return '';
        }
      })
      .filter((text) => text.length > 0)
      .join(' ');

  const text = flattenBlocks(parseMarkdown(markdown)).replace(/\s+/g, ' ').trim();

  return text.length > maxLength
    ? `${text.slice(0, maxLength).trimEnd()}…`
    : text;
}
