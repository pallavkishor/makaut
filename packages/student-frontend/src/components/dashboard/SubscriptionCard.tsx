import Link from 'next/link';
import {
  describeTimeRemaining,
  formatDate,
  isExpiringSoon,
  toDateTimeAttribute,
} from '@/lib/format';
import type { Subscription } from '@/types/api';

interface SubscriptionCardProps {
  /** The account's furthest-reaching active subscription, if any. */
  subscription: Subscription | null;
}

/**
 * Account-level subscription status (Requirements 3.4, 3.7).
 *
 * Subscriptions are no longer per subject: one covers the whole catalogue, so
 * this card reports a single status, plan and expiry for the account. The
 * endpoint only returns subscriptions that grant access right now, which is why
 * `null` means "no access" rather than "none on record".
 */
export function SubscriptionCard({ subscription }: SubscriptionCardProps) {
  if (!subscription) {
    return (
      <section
        aria-labelledby="subscription-heading"
        className="rounded-xl border border-border bg-background-surface p-5 shadow-sm"
      >
        <h2
          id="subscription-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted"
        >
          Subscription
        </h2>

        <p className="mt-2 text-lg font-semibold text-foreground">
          No active subscription
        </p>

        <p className="mt-1 text-sm text-muted">
          You can browse every university, program and subject in the catalogue.
          Note titles and search open up once a subscription is active on your
          account.
        </p>

        <Link
          href="/browse"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
        >
          Browse the catalogue
        </Link>
      </section>
    );
  }

  const expiringSoon = isExpiringSoon(subscription.expiresAt);

  return (
    <section
      aria-labelledby="subscription-heading"
      className="rounded-xl border border-border bg-background-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="subscription-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            Subscription
          </h2>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {subscription.plan?.name ?? 'Full catalogue access'}
          </p>
        </div>

        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            expiringSoon
              ? 'bg-amber-50 text-amber-800'
              : 'bg-emerald-50 text-emerald-800',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              expiringSoon ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          {subscription.status === 'ACTIVE' ? 'Active' : subscription.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Access until</dt>
          <dd className="font-medium text-foreground">
            <time dateTime={toDateTimeAttribute(subscription.expiresAt)}>
              {formatDate(subscription.expiresAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Current period started</dt>
          <dd className="font-medium text-foreground">
            <time dateTime={toDateTimeAttribute(subscription.currentPeriodStart)}>
              {formatDate(subscription.currentPeriodStart)}
            </time>
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-muted">
        {describeTimeRemaining(subscription.expiresAt)}
        {subscription.plan?.billingInterval
          ? ` · billed ${subscription.plan.billingInterval.toLowerCase()}`
          : ''}
      </p>
    </section>
  );
}
