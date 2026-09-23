import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SubscriptionsView } from '@/features/subscriptions/SubscriptionsView';
import { LoadingState } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Subscriptions - Admin Panel',
};

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading subscriptions…" />}>
      <SubscriptionsView />
    </Suspense>
  );
}
