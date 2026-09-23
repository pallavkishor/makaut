import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NotesView } from '@/features/notes/NotesView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Notes - Admin Panel',
};

export default function NotesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading notes…" />}>
      <NotesView />
    </Suspense>
  );
}
