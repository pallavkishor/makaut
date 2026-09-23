import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HierarchyView } from '@/features/hierarchy/HierarchyView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Hierarchy - Admin Panel',
};

export default function HierarchyPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading hierarchy…" />}>
      <HierarchyView />
    </Suspense>
  );
}
