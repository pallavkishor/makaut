/**
 * Determinate progress bar for uploads.
 *
 * `fraction` is 0-1, or null when the browser cannot report progress - in that
 * case the bar shows an indeterminate sweep instead of pretending to know.
 */
export function ProgressBar({
  fraction,
  label,
}: {
  fraction: number | null;
  label: string;
}) {
  const percent =
    fraction === null ? null : Math.min(100, Math.max(0, Math.round(fraction * 100)));

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {percent === null ? <span>Working…</span> : <span>{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tertiary-200"
      >
        <div
          className={`h-full rounded-full bg-primary-500 transition-[width] duration-150 ${
            percent === null ? 'w-1/3 animate-pulse' : ''
          }`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
