import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NoteEditorView } from '@/features/notes/NoteEditorView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Edit note - Admin Panel',
};

export default function EditNotePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<LoadingState label="Loading editor…" />}>
      <NoteEditorView noteId={params.id} />
    </Suspense>
  );
}
