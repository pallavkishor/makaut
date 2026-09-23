import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlansView } from '@/features/plans/PlansView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Plans - Admin Panel',
};

export default function PlansPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading plans…" />}>
      <PlansView />
    </Suspense>
  );
}
