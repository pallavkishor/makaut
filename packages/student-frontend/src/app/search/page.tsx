import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SearchView } from '@/components/search/SearchView';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search published notes across the catalogue.',
};

export default function SearchPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SearchView />
      </AppShell>
    </ProtectedRoute>
  );
}
