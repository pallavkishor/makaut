interface SkeletonProps {
  className?: string;
}

/** Decorative shimmer block used while content loads. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-tertiary-200 ${className}`}
    />
  );
}

interface SkeletonListProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Announced to assistive technology while the real content is fetched. */
  label?: string;
  className?: string;
}

/** A vertical stack of card-shaped skeletons. */
export function SkeletonList({
  rows = 3,
  label = 'Loading content',
  className = '',
}: SkeletonListProps) {
  return (
    <div role="status" aria-live="polite" className={`space-y-3 ${className}`}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-background-surface p-5"
        >
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
