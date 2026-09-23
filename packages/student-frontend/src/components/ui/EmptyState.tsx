interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional call to action, usually a Button or Link. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /**
   * Heading level for the title. Use 'h1' when the empty state replaces the
   * whole page, so the document still has a top-level heading.
   */
  titleAs?: 'h1' | 'h2' | 'h3';
}

/** Placeholder shown when a collection has nothing to display. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  titleAs: Heading = 'h2',
}: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-background-surface px-6 py-12 text-center">
      {icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-200 text-muted">
          {icon}
        </div>
      ) : null}

      <Heading className="text-base font-semibold text-foreground">
        {title}
      </Heading>

      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
