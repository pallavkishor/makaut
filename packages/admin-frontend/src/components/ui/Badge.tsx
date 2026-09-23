import {
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from '@/types';

/**
 * Status chips.
 *
 * Semantic states keep semantic colours (green for live, red for failed) rather
 * than brand sage, so a subscription state is never mistaken for a
 * secondary-styled control. Informational states use the brand indigo. Every
 * chip pairs dark text on a light fill - white on sage would be 2.39:1.
 */

type Tone = 'positive' | 'info' | 'neutral' | 'warning' | 'critical';

const TONES: Record<Tone, string> = {
  positive: 'bg-green-100 text-green-800 ring-green-200',
  info: 'bg-primary-100 text-primary-800 ring-primary-200',
  neutral: 'bg-tertiary-200 text-foreground ring-border-strong',
  warning: 'bg-amber-100 text-amber-900 ring-amber-200',
  critical: 'bg-red-100 text-red-800 ring-red-200',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const SUBSCRIPTION_TONES: Record<SubscriptionStatus, Tone> = {
  ACTIVE: 'positive',
  PENDING: 'info',
  EXPIRED: 'neutral',
  CANCELLED: 'warning',
  FAILED: 'critical',
};

/** Renders the stored subscription status enum. */
export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const tone = SUBSCRIPTION_TONES[status] ?? 'neutral';

  return <Badge tone={tone}>{SUBSCRIPTION_STATUS_LABELS[status] ?? status}</Badge>;
}

/** Published / draft state of a note or PDF resource. */
export function PublishedBadge({ published }: { published: boolean }) {
  return (
    <Badge tone={published ? 'positive' : 'neutral'}>
      {published ? 'Published' : 'Draft'}
    </Badge>
  );
}

/** Whether a plan is currently on sale. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'positive' : 'neutral'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/** Neutral count chip. Brand sage tag, always with `foreground` text. */
export function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}
