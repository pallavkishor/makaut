/**
 * Inactivity timeout rules for the admin session.
 *
 * Requirement 5.5: terminate the session after 30 minutes of inactivity.
 * Design 3.6: warn with a modal at the 25 minute mark.
 *
 * The maths lives here as a pure function so it can be unit tested without
 * driving timers through React.
 */

export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
export const WARNING_AFTER_MS = 25 * 60 * 1000;

/** How often the watcher re-evaluates the session. */
export const TIMEOUT_TICK_MS = 1000;

export type SessionPhase = 'active' | 'warning' | 'expired';

export interface SessionTimeoutState {
  phase: SessionPhase;
  /** Milliseconds of inactivity so far, never negative. */
  idleMs: number;
  /** Milliseconds left before the session is terminated, never negative. */
  msUntilLogout: number;
}

export function evaluateSessionTimeout(
  lastActivityAt: number,
  now: number,
  limits: { warningAfterMs?: number; inactivityLimitMs?: number } = {}
): SessionTimeoutState {
  const warningAfterMs = limits.warningAfterMs ?? WARNING_AFTER_MS;
  const inactivityLimitMs = limits.inactivityLimitMs ?? INACTIVITY_LIMIT_MS;

  // Clock skew or a future timestamp must not look like a long idle period.
  const idleMs = Math.max(0, now - lastActivityAt);
  const msUntilLogout = Math.max(0, inactivityLimitMs - idleMs);

  if (idleMs >= inactivityLimitMs) {
    return { phase: 'expired', idleMs, msUntilLogout: 0 };
  }

  if (idleMs >= warningAfterMs) {
    return { phase: 'warning', idleMs, msUntilLogout };
  }

  return { phase: 'active', idleMs, msUntilLogout };
}

/** Formats a remaining duration as `m:ss` for the warning countdown. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
