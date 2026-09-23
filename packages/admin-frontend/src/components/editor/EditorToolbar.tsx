'use client';

import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';

/** Toolbar button. `aria-pressed` exposes the active mark to screen readers. */
export function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-700 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-primary-700 text-white'
          : 'bg-background-surface text-foreground ring-1 ring-inset ring-border-strong hover:bg-primary-50'
      }`}
    >
      {children}
    </button>
  );
}

export function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 border-r border-border pr-2 last:border-r-0 last:pr-0"
    >
      {children}
    </div>
  );
}

export interface EditorToolbarProps {
  editor: Editor;
  onRequestLink: () => void;
  onRequestImage: () => void;
  uploadingImage: boolean;
}

/**
 * Formatting controls (Requirements 6.6, 6.7): headings, bold, italic, ordered
 * and unordered lists, links, images, tables, and code blocks.
 */
export function EditorToolbar({
  editor,
  onRequestLink,
  onRequestImage,
  uploadingImage,
}: EditorToolbarProps) {
  const inTable = editor.isActive('table');

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-tertiary px-2 py-1.5">
      <ToolbarGroup label="Headings">
        {([1, 2, 3] as const).map((level) => (
          <ToolbarButton
            key={level}
            label={`Heading ${level}`}
            active={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          >
            H{level}
          </ToolbarButton>
        ))}
        <ToolbarButton
          label="Paragraph"
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          ¶
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Text style">
        <ToolbarButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <span className="font-mono">{'<>'}</span>
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Lists">
        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •≡
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1≡
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          &ldquo;
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Blocks">
        <ToolbarButton
          label="Code block"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          {'{ }'}
        </ToolbarButton>
        <ToolbarButton
          label="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          —
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Insert">
        <ToolbarButton
          label={editor.isActive('link') ? 'Edit link' : 'Insert link'}
          active={editor.isActive('link')}
          onClick={onRequestLink}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          label="Remove link"
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          Unlink
        </ToolbarButton>
        <ToolbarButton
          label="Upload image"
          disabled={uploadingImage}
          onClick={onRequestImage}
        >
          {uploadingImage ? 'Uploading…' : 'Image'}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Table">
        <ToolbarButton
          label="Insert table"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          Table
        </ToolbarButton>
        <ToolbarButton
          label="Add row below"
          disabled={!inTable}
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          +Row
        </ToolbarButton>
        <ToolbarButton
          label="Add column after"
          disabled={!inTable}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          +Col
        </ToolbarButton>
        <ToolbarButton
          label="Delete row"
          disabled={!inTable}
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          −Row
        </ToolbarButton>
        <ToolbarButton
          label="Delete column"
          disabled={!inTable}
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          −Col
        </ToolbarButton>
        <ToolbarButton
          label="Delete table"
          disabled={!inTable}
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          ✕Table
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="History">
        <ToolbarButton
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  );
}
