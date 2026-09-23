import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { NoteView } from '@/components/note/NoteView';

export const metadata: Metadata = {
  title: 'Note',
  description: 'Read a note from one of your subscribed subjects.',
};

export default function NotePage({ params }: { params: { id: string } }) {
  return (
    <ProtectedRoute>
      {/* Narrower column: a comfortable measure for long-form reading */}
      <AppShell width="reading">
        <NoteView noteId={params.id} />
      </AppShell>
    </ProtectedRoute>
  );
}
