import Link from 'next/link';

interface UpgradePromptProps {
  /**
   * What the student was trying to reach, e.g. "the notes in this chapter".
   * Used in the explanation so the prompt reads as an upgrade, not a failure.
   */
  target?: string;
  /** Where "keep browsing" should go. Defaults to the catalogue root. */
  browseHref?: string;
  /** Heading level, so the prompt can stand in for a whole page. */
  headingAs?: 'h1' | 'h2';
}

/**
 * Shown when the API answers 403 NO_ACTIVE_SUBSCRIPTION.
 *
 * Everything down to chapter level is browsable without a subscription, so a
 * student reaching this point has already seen what is on offer. That makes this
 * an upgrade prompt rather than an error: it explains where the boundary sits,
 * confirms that browsing stays open, and points at the account page where the
 * subscription lives.
 */
export function UpgradePrompt({
  target = 'the notes in this chapter',
  browseHref = '/browse',
  headingAs: Heading = 'h2',
}: UpgradePromptProps) {
  return (
    <section
      aria-labelledby="upgrade-prompt-heading"
      className="mx-auto max-w-xl rounded-xl border border-primary-200 bg-primary-50 px-6 py-10 text-center"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>

      <Heading
        id="upgrade-prompt-heading"
        className="text-lg font-semibold text-primary-900"
      >
        A subscription unlocks this
      </Heading>

      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-foreground">
        Your account does not have an active subscription, so {target} are not
        available yet. One subscription covers the whole catalogue - every
        university, program and subject you can see while browsing.
      </p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 sm:w-auto"
        >
          See subscription status
        </Link>

        <Link
          href={browseHref}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-primary-200 bg-background-surface px-4 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 sm:w-auto"
        >
          Keep browsing
        </Link>
      </div>
    </section>
  );
}
