'use client';

import { useEffect, useState } from 'react';
import { errorCodeOf } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  EMPTY_HIERARCHY,
  toSearchFilters,
  type HierarchySelection,
} from '@/lib/hierarchy';
import { useCatalogSearch, useSelection } from '@/lib/queries';
import { ErrorState } from '@/components/ErrorState';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { HierarchySelects } from '@/components/hierarchy/HierarchySelects';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SearchField } from './SearchField';
import { SearchResultCard } from './SearchResultCard';

/**
 * Note search across the catalogue (Requirements 4.7, 4.8).
 *
 * Filters are the same chained hierarchy selects used to pick a program, plus a
 * subject, and they are seeded from the student's stored selection so the common
 * case - searching your own semester - needs no setup. Search is behind an active
 * subscription, so a 403 renders the upgrade prompt rather than an error.
 *
 * Snippets come back as `headline` strings containing `<mark>` delimiters around
 * matched terms. They are derived from Markdown note content and are rendered as
 * text plus real `<mark>` elements - never injected as HTML. See
 * `lib/highlight.ts`.
 */
export function SearchView() {
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<HierarchySelection>(EMPTY_HIERARCHY);
  const [page, setPage] = useState(1);
  const [seeded, setSeeded] = useState(false);

  const query = useDebouncedValue(input.trim(), 300);
  const selectionQuery = useSelection();

  // Start from where the student studies; they can widen or narrow from there
  useEffect(() => {
    if (seeded || !selectionQuery.data) return;

    const { selection } = selectionQuery.data;

    setFilters({
      universityId: selection.university?.id ?? '',
      programId: selection.program?.id ?? '',
      streamId: selection.stream?.id ?? '',
      semesterId: selection.semester?.id ?? '',
      subjectId: '',
    });
    setSeeded(true);
  }, [selectionQuery.data, seeded]);

  // Any change to the query or the filters restarts paging
  useEffect(() => {
    setPage(1);
  }, [query, filters]);

  const search = useCatalogSearch({
    query,
    filters: toSearchFilters(filters),
    page,
  });

  const isSearching = query.length > 0;
  const busy = isSearching && (search.isPending || search.isFetching);
  const results = search.data?.results ?? [];
  const pagination = search.data?.pagination;

  if (errorCodeOf(search.error) === 'NO_ACTIVE_SUBSCRIPTION') {
    return (
      <div className="space-y-6">
        <Header />
        <UpgradePrompt target="search results" />
      </div>
    );
  }

  const resultSummary = !isSearching
    ? undefined
    : busy
      ? 'Searching…'
      : search.isError
        ? 'Search is unavailable right now.'
        : pagination
          ? pagination.total === 1
            ? `1 note matches “${query}”.`
            : `${pagination.total} notes match “${query}”.`
          : undefined;

  return (
    <div className="space-y-8">
      <Header />

      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="space-y-6"
      >
        <SearchField
          value={input}
          onChange={setInput}
          busy={busy}
          resultSummary={resultSummary}
        />

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground">
            Narrow the search
          </legend>

          <HierarchySelects
            value={filters}
            onChange={setFilters}
            includeSubject
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilters(EMPTY_HIERARCHY)}
          >
            Clear filters
          </Button>
        </fieldset>
      </form>

      {isSearching && search.isError ? (
        <ErrorState
          error={search.error}
          title="Search failed"
          onRetry={() => void search.refetch()}
        />
      ) : null}

      {!isSearching ? (
        <EmptyState
          title="Search the catalogue"
          description="Type at least one word to search note titles and content. Subject and chapter names are matched too, so searching for a subject surfaces its notes."
        />
      ) : busy && results.length === 0 ? (
        <SkeletonList rows={3} label="Searching notes" />
      ) : !search.isError && results.length === 0 ? (
        <EmptyState
          title="No matching notes"
          description={`Nothing matches “${query}” with the current filters. Try a different word, or clear the filters to search the whole catalogue.`}
        />
      ) : results.length > 0 ? (
        <section aria-labelledby="search-results-heading" className="space-y-4">
          <h2 id="search-results-heading" className="sr-only">
            Search results
          </h2>

          <ul className="space-y-3">
            {results.map((result) => (
              <SearchResultCard key={result.noteId} result={result} />
            ))}
          </ul>

          {pagination && pagination.totalPages > 1 ? (
            <nav
              aria-label="Search result pages"
              className="flex items-center justify-between gap-3 border-t border-border pt-4"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1 || busy}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>

              <p aria-live="polite" className="text-sm text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </p>

              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || busy}
                onClick={() =>
                  setPage((current) =>
                    Math.min(pagination.totalPages, current + 1)
                  )
                }
              >
                Next
              </Button>
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Search notes
      </h1>
      <p className="text-sm text-muted">
        Full-text search across every published note you have access to. Title
        matches rank above body matches.
      </p>
    </header>
  );
}
