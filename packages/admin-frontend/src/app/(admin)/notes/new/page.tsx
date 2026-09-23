import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NoteEditorView } from '@/features/notes/NoteEditorView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'New note - Admin Panel',
};

export default function NewNotePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading editor…" />}>
      <NoteEditorView />
    </Suspense>
  );
}
