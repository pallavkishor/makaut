import Link from 'next/link';

/**
 * Explanation for the DEVICE_LIMIT_REACHED error code (Requirement 2.4).
 *
 * The raw API message is terse ("Device limit reached. Maximum 2 devices
 * allowed per account."), so the login page renders this instead: it names the
 * cause and the one action that unblocks the student.
 */
export function DeviceLimitNotice() {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <div className="flex gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
        >
          <rect x="2" y="4" width="14" height="10" rx="2" />
          <rect x="16" y="9" width="6" height="11" rx="2" />
        </svg>

        <div className="space-y-2">
          <p className="font-semibold">
            This device cannot be added to your account
          </p>
          <p className="leading-relaxed">
            Your account is already active on two devices, which is the maximum.
            Your email and password were correct, but we cannot start a session
            on this device until you free up a slot.
          </p>
          <p className="leading-relaxed">
            Sign in on one of your existing devices, open{' '}
            <Link
              href="/settings"
              className="font-medium underline decoration-amber-400 underline-offset-2 hover:decoration-amber-700"
            >
              Settings
            </Link>{' '}
            and revoke the device you no longer use. Then come back and sign in
            here.
          </p>
        </div>
      </div>
    </div>
  );
}
