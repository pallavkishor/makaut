type Tone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<Tone, { container: string; icon: string; path: string }> = {
  error: {
    container: 'border-red-200 bg-red-50 text-red-900',
    icon: 'text-red-600',
    path: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: 'text-amber-600',
    path: 'M12 8v4m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  },
  info: {
    container: 'border-primary-200 bg-primary-50 text-primary-900',
    icon: 'text-primary-600',
    path: 'M12 16v-5m0-3h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  },
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: 'text-emerald-600',
    path: 'm9 12 2 2 4-4m-1-8a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  },
};

interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Inline message block.
 *
 * Errors and warnings use `role="alert"` so assistive technology announces them
 * as soon as they appear; softer tones use a polite live region.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: AlertProps) {
  const { container, icon, path } = TONES[tone];
  const assertive = tone === 'error' || tone === 'warning';

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${container} ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`mt-0.5 h-5 w-5 flex-shrink-0 ${icon}`}
      >
        <path d={path} />
      </svg>

      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
