'use client';

import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import TableExtension from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { EditorToolbar } from './EditorToolbar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';

/**
 * TipTap rich text editor for note content (Requirements 6.5, 6.6, 6.7).
 *
 * Loaded through next/dynamic with `ssr: false` (see RichTextEditorLoader) because
 * the TipTap editor needs a DOM at construction time.
 */

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** Uploads a file and resolves to the URL to embed. */
  onUploadImage: (file: File) => Promise<string>;
  label?: string;
}

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  // Block javascript: and other script-bearing schemes (Requirement 9.7).
  if (/^(https?:|mailto:|\/)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^[^\s:]+\.[^\s:]+/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  label = 'Note content',
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks HTML this component emitted so external updates can be told apart.
  const lastEmittedRef = useRef(value);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      ImageExtension.configure({ inline: false, allowBase64: false }),
      TableExtension.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'note-content min-h-[20rem] px-4 py-3 focus:outline-none',
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // Adopt content loaded after mount (e.g. an existing note arriving from the API)
  // without clobbering what is being typed.
  useEffect(() => {
    if (!editor || value === lastEmittedRef.current) {
      return;
    }

    lastEmittedRef.current = value;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  const openLinkDialog = () => {
    if (!editor) {
      return;
    }

    setLinkError(undefined);
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkDialogOpen(true);
  };

  const applyLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editor) {
      return;
    }

    const url = normalizeUrl(linkUrl);

    if (!url) {
      setLinkError('Enter an http(s) or mailto URL');
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkDialogOpen(false);
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so the same file can be picked twice in a row.
    event.target.value = '';

    if (!file || !editor) {
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const url = await onUploadImage(file);
      editor
        .chain()
        .focus()
        .setImage({ src: url, alt: file.name })
        .run();
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploading(false);
    }
  };

  if (!editor) {
    return (
      <div className="rounded-md border border-border-strong bg-background-surface px-4 py-10 text-sm text-muted">
        Preparing editor…
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-border-strong bg-background-surface focus-within:ring-2 focus-within:ring-primary-600">
        <EditorToolbar
          editor={editor}
          onRequestLink={openLinkDialog}
          onRequestImage={() => fileInputRef.current?.click()}
          uploadingImage={uploading}
        />
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => void handleFileSelected(event)}
      />

      {uploadError ? (
        <div className="mt-2">
          <FormError error={uploadError} />
        </div>
      ) : null}

      <Modal
        open={linkDialogOpen}
        title="Insert link"
        size="sm"
        onClose={() => setLinkDialogOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="editor-link-form">
              Apply link
            </Button>
          </>
        }
      >
        <form id="editor-link-form" onSubmit={applyLink}>
          <TextField
            label="URL"
            value={linkUrl}
            placeholder="https://example.com"
            error={linkError}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
}
