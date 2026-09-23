import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { BrowseView } from '@/components/browse/BrowseView';

export const metadata: Metadata = {
  title: 'Browse',
  description:
    'Browse the catalogue: universities, programs, streams, semesters, subjects and chapters.',
};

/**
 * One catch-all route for the whole browse hierarchy.
 *
 * The path segments are the ids of each level in order, so every page can render
 * a complete breadcrumb without the API having to resolve ancestry. See
 * `lib/browsePaths.ts` for the URL shape.
 */
export default function BrowsePage({
  params,
}: {
  params: { path?: string[] };
}) {
  return (
    <ProtectedRoute>
      <AppShell>
        <BrowseView segments={params.path} />
      </AppShell>
    </ProtectedRoute>
  );
}
