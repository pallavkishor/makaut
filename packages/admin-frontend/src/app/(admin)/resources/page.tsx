import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResourcesView } from '@/features/resources/ResourcesView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'PDF resources - Admin Panel',
};

export default function ResourcesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading resources…" />}>
      <ResourcesView />
    </Suspense>
  );
}
