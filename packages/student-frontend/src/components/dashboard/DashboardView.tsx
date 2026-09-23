'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { browseHref } from '@/lib/browsePaths';
import { isExpiringSoon } from '@/lib/format';
import { useSelection, useSemesterSubjects, useSubscriptions } from '@/lib/queries';
import { ErrorState } from '@/components/ErrorState';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SelectionCard } from './SelectionCard';
import { SubjectCard } from './SubjectCard';
import { SubscriptionCard } from './SubscriptionCard';
import type { Subscription } from '@/types/api';

/**
 * Dashboard contents.
 *
 * Three things, in the order a student needs them: whether the account has
 * access and until when (account-level subscription, Requirements 3.4 and 3.7),
 * where they study with a way to change it, and the subjects of that semester.
 * With no selection stored, the subject list is replaced by a prompt to choose
 * one.
 */
export function DashboardView() {
  const { user } = useAuth();
  const subscriptionsQuery = useSubscriptions();
  const selectionQuery = useSelection();

  const selection = selectionQuery.data?.selection;
  const semesterId = selection?.semester?.id ?? '';
  const subjectsQuery = useSemesterSubjects(semesterId);

  /** The subscription whose period reaches furthest into the future. */
  const subscription = useMemo<Subscription | null>(() => {
    const active = subscriptionsQuery.data?.subscriptions ?? [];

    return active.reduce<Subscription | null>(
      (furthest, candidate) =>
        !furthest ||
        new Date(candidate.expiresAt) > new Date(furthest.expiresAt)
          ? candidate
          : furthest,
      null
    );
  }, [subscriptionsQuery.data]);

  const hasSelection = Boolean(
    selection?.university ||
      selection?.program ||
      selection?.stream ||
      selection?.semester
  );

  const subjects = subjectsQuery.data?.subjects ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Your dashboard
        </h1>
        <p className="text-sm text-muted">
          {user?.email ? `Signed in as ${user.email}.` : ''}
        </p>
      </header>

      {subscriptionsQuery.isError ? (
        <ErrorState
          error={subscriptionsQuery.error}
          title="We could not load your subscription"
          onRetry={() => void subscriptionsQuery.refetch()}
        />
      ) : null}

      {subscription && isExpiringSoon(subscription.expiresAt) ? (
        <Alert tone="warning" title="Your subscription ends soon">
          <p>
            Access to note titles, note content and search stops automatically on
            the expiry date. Browsing the catalogue stays available.
          </p>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {subscriptionsQuery.isPending ? (
          <SkeletonList rows={1} label="Loading your subscription" />
        ) : (
          <SubscriptionCard subscription={subscription} />
        )}

        {selectionQuery.isPending ? (
          <SkeletonList rows={1} label="Loading your program" />
        ) : hasSelection && selection ? (
          <SelectionCard selection={selection} />
        ) : (
          <EmptyState
            title="Choose your program"
            description="Tell us the university, program, stream and semester you study, and this dashboard will open on that semester's subjects."
            action={
              <Link
                href="/selection"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
              >
                Choose your program
              </Link>
            }
          />
        )}
      </div>

      {selectionQuery.isError ? (
        <ErrorState
          error={selectionQuery.error}
          title="We could not load your program"
          onRetry={() => void selectionQuery.refetch()}
        />
      ) : null}

      {semesterId ? (
        <section aria-labelledby="semester-subjects-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="semester-subjects-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Subjects in {selection?.semester?.label ?? 'your semester'}
            </h2>

            <Link
              href="/search"
              className="rounded text-sm font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
            >
              Search notes
            </Link>
          </div>

          {subjectsQuery.isError ? (
            <ErrorState
              error={subjectsQuery.error}
              title="We could not load the subjects for your semester"
              onRetry={() => void subjectsQuery.refetch()}
            />
          ) : null}

          {subjectsQuery.isPending ? (
            <SkeletonList rows={3} label="Loading your subjects" />
          ) : subjects.length === 0 ? (
            <EmptyState
              title="No subjects yet"
              description="This semester has no subjects published yet. Check back soon, or browse another semester."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  name={subject.name}
                  code={subject.code}
                  href={browseHref({
                    universityId: selection?.university?.id,
                    programId: selection?.program?.id,
                    streamId: selection?.stream?.id,
                    semesterId: selection?.semester?.id,
                    subjectId: subject.id,
                  })}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
