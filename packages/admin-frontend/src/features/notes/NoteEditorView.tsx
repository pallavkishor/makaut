'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  createNote,
  deleteNote,
  getNote,
  updateNote,
  uploadNoteImage,
} from '@/lib/api/notes';
import { getChapter } from '@/lib/api/chapters';
import { getSubject } from '@/lib/api/subjects';
import { resolvePathFromSemester } from '@/lib/api/hierarchy';
import { queryKeys } from '@/lib/queryKeys';
import {
  EMPTY_SELECTION,
  SubjectPicker,
  type ContentSelection,
} from '@/features/hierarchy/ContentPicker';
import { RichTextEditor } from '@/components/editor/RichTextEditorLoader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextField } from '@/components/ui/Field';
import { ErrorState, FormError, SuccessNotice } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/Spinner';

/**
 * Note create/edit screen (Requirements 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9).
 *
 * All form state is local, so a validation failure or a server error never
 * discards the administrator's work.
 */

const EMPTY_CONTENT_PATTERN = /^(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>)*$/i;

function isContentEmpty(html: string): boolean {
  return html.trim().length === 0 || EMPTY_CONTENT_PATTERN.test(html.trim());
}

interface FieldErrors {
  title?: string;
  chapterId?: string;
  content?: string;
}

/** Resolves the full hierarchy path for a chapter, so the picker can be pre-filled. */
async function resolveSelectionFromChapter(chapterId: string): Promise<ContentSelection> {
  const chapter = await getChapter(chapterId);
  const subject = await getSubject(chapter.subjectId);
  const path = await resolvePathFromSemester(subject.semesterId);

  return { ...path, subjectId: subject.id, chapterId: chapter.id };
}

export function NoteEditorView({ noteId }: { noteId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const isEditing = Boolean(noteId);
  const initialChapterId = searchParams.get('chapterId') ?? '';

  const [title, setTitle] = useState('');
  const [selection, setSelection] = useState<ContentSelection>(EMPTY_SELECTION);
  const [content, setContent] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hydratedRef = useRef(false);

  const noteQuery = useQuery({
    queryKey: queryKeys.notes.detail(noteId ?? ''),
    queryFn: () => getNote(noteId as string),
    enabled: isEditing,
  });

  // The chapter a new note should be pre-filed under, named on the query string.
  const prefillQuery = useQuery({
    queryKey: ['notes', 'prefill-chapter', initialChapterId],
    queryFn: () => resolveSelectionFromChapter(initialChapterId),
    enabled: !isEditing && Boolean(initialChapterId),
  });

  // The full chapter lineage of the note being edited, resolved once.
  const editLineageQuery = useQuery({
    queryKey: ['notes', 'edit-lineage', noteQuery.data?.chapterId],
    queryFn: () => resolveSelectionFromChapter(noteQuery.data!.chapterId),
    enabled: isEditing && Boolean(noteQuery.data),
  });

  // Populate the form once, the first time the note (and its lineage) arrives.
  useEffect(() => {
    if (!noteQuery.data || !editLineageQuery.data || hydratedRef.current) {
      return;
    }

    hydratedRef.current = true;
    setTitle(noteQuery.data.title);
    setSelection(editLineageQuery.data);
    setContent(noteQuery.data.content ?? '');
  }, [noteQuery.data, editLineageQuery.data]);

  // Pre-fill the chapter for a brand new note created from a chapter's page.
  useEffect(() => {
    if (isEditing || !prefillQuery.data || hydratedRef.current) {
      return;
    }

    hydratedRef.current = true;
    setSelection(prefillQuery.data);
  }, [isEditing, prefillQuery.data]);

  // Warn before a browser navigation would drop unsaved edits.
  useEffect(() => {
    if (!dirty) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);

    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const saveMutation = useMutation({
    mutationFn: async (input: { title: string; chapterId: string; content: string }) =>
      isEditing ? updateNote(noteId as string, input) : createNote(input),
    onSuccess: async (note) => {
      setDirty(false);
      setSavedAt(Date.now());
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });

      if (!isEditing && note?.id) {
        // Subsequent saves should update rather than create another note.
        router.replace(`/notes/${note.id}`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote(noteId as string),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
      router.replace('/notes');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadNoteImage(file),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      errors.title = 'Title is required';
    }

    if (!selection.chapterId) {
      errors.chapterId = 'Choose the chapter this note belongs to';
    }

    if (isContentEmpty(content)) {
      errors.content = 'Note content cannot be empty';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    saveMutation.mutate({ title: trimmedTitle, chapterId: selection.chapterId, content });
  };

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/notes" className="text-primary-700 hover:underline">
            ← All notes
          </Link>
        }
        title={isEditing ? 'Edit note' : 'New note'}
        description="Write the note, pick its chapter, and save."
        actions={
          <>
            {isEditing ? (
              <Button
                variant="danger"
                onClick={() => {
                  deleteMutation.reset();
                  setConfirmDelete(true);
                }}
              >
                Delete
              </Button>
            ) : null}
            <Button
              type="submit"
              form="note-form"
              loading={saveMutation.isPending}
            >
              {isEditing ? 'Save changes' : 'Create note'}
            </Button>
          </>
        }
      />

      {isEditing && noteQuery.isError ? (
        <div className="mb-4">
          <ErrorState
            error={noteQuery.error}
            title="Could not load this note"
            onRetry={() => void noteQuery.refetch()}
          />
        </div>
      ) : null}

      {isEditing && (noteQuery.isPending || editLineageQuery.isPending) ? (
        <LoadingState label="Loading note…" />
      ) : null}

      {(!isEditing || (noteQuery.data && editLineageQuery.data)) && (
        <form id="note-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {savedAt && !dirty ? <SuccessNotice>Note saved.</SuccessNotice> : null}
          <FormError error={saveMutation.error} />

          <TextField
            label="Title"
            value={title}
            required
            error={fieldErrors.title}
            placeholder="e.g. Alkene reactions"
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
          />

          <SubjectPicker
            value={selection}
            onChange={(next) => {
              setSelection(next);
              setDirty(true);
            }}
            errors={{ chapterId: fieldErrors.chapterId }}
            includeChapter
            chapterRequired
          />

          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              Content
              <span className="ml-0.5 text-red-600" aria-hidden="true">
                *
              </span>
            </p>
            <RichTextEditor
              value={content}
              label="Note content"
              onChange={(html) => {
                setContent(html);
                setDirty(true);
              }}
              onUploadImage={async (file) => {
                const uploaded = await uploadMutation.mutateAsync(file);
                return uploaded.url;
              }}
            />
            {fieldErrors.content ? (
              <p className="mt-1 text-xs font-medium text-red-600" role="alert">
                {fieldErrors.content}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={saveMutation.isPending}>
              {isEditing ? 'Save changes' : 'Create note'}
            </Button>
            <Button variant="ghost" onClick={() => router.push('/notes')}>
              Cancel
            </Button>
            {dirty ? (
              <span className="text-xs text-amber-700">Unsaved changes</span>
            ) : null}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this note?"
        confirmLabel="Delete note"
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      >
        <p className="text-sm text-foreground">
          <span className="font-semibold">{title || 'This note'}</span> will be
          permanently removed and will no longer be visible to students.
        </p>
      </ConfirmDialog>
    </>
  );
}
