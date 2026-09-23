'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';

/**
 * Markdown editor for note content.
 *
 * Note bodies are stored as Markdown, so this is a textarea with insert helpers
 * rather than a rich text surface - a WYSIWYG editor would have to round-trip
 * through HTML, and the server strips raw HTML constructs that can execute
 * script anyway.
 *
 * Every helper works on the current selection and keeps focus in the textarea, so
 * an admin can stay on the keyboard.
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
  onUploadImage,
  disabled = false,
  rows = 20,
}: {
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  /** Uploads and returns the URL to embed. */
  onUploadImage?: (file: File) => Promise<string>;
  disabled?: boolean;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  /** Wraps the selection, or inserts the markers and places the caret inside. */
  const wrap = (before: string, after = before, placeholder = '') => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || placeholder;
    const next =
      value.slice(0, selectionStart) +
      before +
      selected +
      after +
      value.slice(selectionEnd);

    onChange(next);

    // Restore a sensible selection after React re-renders the value.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart + before.length,
        selectionStart + before.length + selected.length
      );
    });
  };

  /** Prefixes the lines the selection touches, for headings and lists. */
  const prefixLines = (prefix: string) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd } = textarea;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEnd = value.indexOf('\n', selectionEnd);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, sliceEnd) || 'Heading';
    const prefixed = block
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join('\n');

    onChange(value.slice(0, lineStart) + prefixed + value.slice(sliceEnd));

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
    });
  };

  const insert = (snippet: string) => {
    const textarea = textareaRef.current;
    const at = textarea ? textarea.selectionStart : value.length;
    const next = value.slice(0, at) + snippet + value.slice(at);

    onChange(next);

    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(at + snippet.length, at + snippet.length);
    });
  };

  const handleUpload = async (file: File) => {
    if (!onUploadImage) {
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const url = await onUploadImage(file);
      insert(`\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n`);
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploading(false);
      setFileKey((key) => key + 1);
    }
  };

  return (
    <div className="rounded-md ring-1 ring-inset ring-border-strong">
      <div
        className="flex flex-wrap items-center gap-1 border-b border-border bg-tertiary px-2 py-1.5"
        role="toolbar"
        aria-label="Markdown formatting"
      >
        <ToolbarButton label="Heading" onClick={() => prefixLines('## ')} disabled={disabled}>
          H2
        </ToolbarButton>
        <ToolbarButton label="Bold" onClick={() => wrap('**', '**', 'bold')} disabled={disabled}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => wrap('_', '_', 'italic')} disabled={disabled}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton label="Inline code" onClick={() => wrap('`', '`', 'code')} disabled={disabled}>
          {'</>'}
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" onClick={() => prefixLines('- ')} disabled={disabled}>
          List
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          onClick={() => wrap('[', '](https://)', 'link text')}
          disabled={disabled}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          label="Table"
          onClick={() =>
            insert('\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n')
          }
          disabled={disabled}
        >
          Table
        </ToolbarButton>

        {onUploadImage ? (
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="rounded-md bg-secondary-100 px-2 py-1 ring-1 ring-inset ring-secondary-300 hover:bg-secondary-200">
              {uploading ? 'Uploading…' : 'Insert image'}
            </span>
            <input
              key={fileKey}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void handleUpload(file);
                }
              }}
            />
          </label>
        ) : null}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        aria-label={label}
        rows={rows}
        disabled={disabled}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        className="block w-full resize-y rounded-b-md border-0 px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus:ring-2 focus:ring-inset focus:ring-primary-600"
      />

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
        <p className="text-xs text-muted">
          Markdown. Raw HTML that can run script is stripped on save.
        </p>
        <p className="text-xs tabular-nums text-muted">
          {value.length.toLocaleString('en-IN')} characters
        </p>
      </div>

      {uploadError ? (
        <div className="px-3 pb-2">
          <FormError error={uploadError} />
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
