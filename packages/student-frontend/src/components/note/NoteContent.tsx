import { Fragment } from 'react';
import {
  parseMarkdown,
  type BlockNode,
  type InlineNode,
} from '@/lib/markdown';

interface NoteContentProps {
  /** Markdown body of the note, exactly as returned by GET /api/notes/:id. */
  markdown: string;
}

/**
 * Renders the Markdown body of a note (Requirements 4.5, 4.6).
 *
 * Note content is Markdown now, so the old `dangerouslySetInnerHTML` path is
 * gone: the content is parsed into a node tree and rendered as React elements.
 * The element set is fixed by this component, which means note content can only
 * become text or one of the elements below - a note containing raw HTML shows
 * that HTML as text instead of executing it. Link and image URLs are filtered
 * to http(s), mailto, and relative targets by the parser.
 *
 * The `.note-content` styles in globals.css carry the typography.
 */
export function NoteContent({ markdown }: NoteContentProps) {
  const blocks = parseMarkdown(markdown);

  return (
    <div className="note-content">
      {blocks.map((block, index) => (
        <Block key={index} node={block} />
      ))}
    </div>
  );
}

function Block({ node }: { node: BlockNode }) {
  switch (node.type) {
    case 'heading': {
      const Heading = `h${node.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Heading>
          <Inline nodes={node.children} />
        </Heading>
      );
    }

    case 'paragraph':
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      );

    case 'codeBlock':
      return (
        <pre>
          <code
            {...(node.language ? { 'data-language': node.language } : {})}
          >
            {node.value}
          </code>
        </pre>
      );

    case 'list': {
      const items = node.items.map((item, index) => (
        <li key={index}>
          <Inline nodes={item} />
        </li>
      ));

      return node.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }

    case 'blockquote':
      return (
        <blockquote>
          {node.children.map((child, index) => (
            <Block key={index} node={child} />
          ))}
        </blockquote>
      );

    case 'thematicBreak':
      return <hr className="border-border" />;
  }
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={index}>{node.value}</Fragment>;

          case 'code':
            return <code key={index}>{node.value}</code>;

          case 'strong':
            return (
              <strong key={index}>
                <Inline nodes={node.children} />
              </strong>
            );

          case 'emphasis':
            return (
              <em key={index}>
                <Inline nodes={node.children} />
              </em>
            );

          case 'link':
            return (
              <a
                key={index}
                href={node.href}
                title={node.title}
                // External content: never let it reach window.opener
                rel="noopener noreferrer nofollow"
                target={node.href.startsWith('#') ? undefined : '_blank'}
              >
                <Inline nodes={node.children} />
              </a>
            );

          case 'image':
            return (
              // eslint-disable-next-line @next/next/no-img-element -- note images are arbitrary API-hosted URLs, outside the next/image loader
              <img
                key={index}
                src={node.src}
                alt={node.alt}
                title={node.title}
                loading="lazy"
              />
            );
        }
      })}
    </>
  );
}
