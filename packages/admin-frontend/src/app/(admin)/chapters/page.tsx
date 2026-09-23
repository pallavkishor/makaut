import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChaptersView } from '@/features/chapters/ChaptersView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Chapters - Admin Panel',
};

export default function ChaptersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading chapters…" />}>
      <ChaptersView />
    </Suspense>
  );
}
