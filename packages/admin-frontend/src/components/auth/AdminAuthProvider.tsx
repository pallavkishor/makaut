'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loginAdmin, logoutAdmin } from '@/lib/api/adminAuth';
import { setAuthToken, setSessionExpiredHandler } from '@/lib/apiClient';
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from '@/lib/sessionStorage';
import {
  evaluateSessionTimeout,
  TIMEOUT_TICK_MS,
  type SessionPhase,
  type SessionTimeoutState,
} from '@/lib/sessionTimeout';
import type { AdminUser } from '@/types';

/**
 * Admin authentication state (design 3.6 "State Management").
 *
 * Kept deliberately separate from any student session: it reads its own storage
 * keys and only ever talks to `/api/admin/auth/*` (Requirement 5.4).
 *
 * Also owns the 30-minute inactivity timeout with a warning at 25 minutes
 * (Requirements 5.5, 5.6).
 */

export type AdminAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type LogoutReason = 'manual' | 'timeout' | 'expired';

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: LogoutReason) => Promise<void>;
  /** Current inactivity phase; `warning` drives the countdown modal. */
  sessionPhase: SessionPhase;
  msUntilLogout: number;
  /** Resets the inactivity timer ("Stay signed in"). */
  keepAlive: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

const INITIAL_TIMEOUT_STATE: SessionTimeoutState = {
  phase: 'active',
  idleMs: 0,
  msUntilLogout: 0,
};

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [timeoutState, setTimeoutState] =
    useState<SessionTimeoutState>(INITIAL_TIMEOUT_STATE);

  const lastActivityRef = useRef<number>(Date.now());
  const phaseRef = useRef<SessionPhase>('active');
  // Guards against a timeout and a manual logout racing each other.
  const loggingOutRef = useRef(false);

  phaseRef.current = timeoutState.phase;

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setTimeoutState(INITIAL_TIMEOUT_STATE);
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    clearStoredSession();
    setAdmin(null);
    setStatus('unauthenticated');
    setTimeoutState(INITIAL_TIMEOUT_STATE);
    queryClient.clear();
  }, [queryClient]);

  const logout = useCallback(
    async (reason: LogoutReason = 'manual') => {
      if (loggingOutRef.current) {
        return;
      }

      loggingOutRef.current = true;

      try {
        // Best effort: the local session is dropped even if the call fails.
        if (reason !== 'expired') {
          await logoutAdmin().catch(() => undefined);
        }
      } finally {
        clearSession();
        loggingOutRef.current = false;

        const query = reason === 'manual' ? '' : `?reason=${reason}`;
        router.replace(`/login${query}`);
      }
    },
    [clearSession, router]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginAdmin(email, password);

      setAuthToken(result.session.token);
      saveStoredSession({ token: result.session.token, admin: result.admin });
      lastActivityRef.current = Date.now();
      setTimeoutState(INITIAL_TIMEOUT_STATE);
      setAdmin(result.admin);
      setStatus('authenticated');
    },
    []
  );

  // Restore a persisted session on first paint.
  useEffect(() => {
    const stored = loadStoredSession();

    if (stored) {
      setAuthToken(stored.token);
      setAdmin(stored.admin);
      lastActivityRef.current = Date.now();
      setStatus('authenticated');
    } else {
      setStatus('unauthenticated');
    }
  }, []);

  // A token the server rejects means the session is already gone.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void logout('expired');
    });

    return () => setSessionExpiredHandler(null);
  }, [logout]);

  // Track activity. While the warning modal is up we stop auto-resetting so the
  // countdown stays truthful and the administrator has to acknowledge it.
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    const handleActivity = () => {
      if (phaseRef.current !== 'active') {
        return;
      }

      lastActivityRef.current = Date.now();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [status]);

  // Inactivity watcher (Requirement 5.5).
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    const intervalId = window.setInterval(() => {
      const next = evaluateSessionTimeout(lastActivityRef.current, Date.now());

      setTimeoutState((previous) => {
        if (previous.phase === 'active' && next.phase === 'active') {
          // Nothing visible changes while idle time is still comfortable.
          return previous;
        }

        if (
          previous.phase === next.phase &&
          Math.ceil(previous.msUntilLogout / 1000) ===
            Math.ceil(next.msUntilLogout / 1000)
        ) {
          return previous;
        }

        return next;
      });
    }, TIMEOUT_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [status]);

  // Requirement 5.6: terminate and redirect once the limit is reached.
  useEffect(() => {
    if (status === 'authenticated' && timeoutState.phase === 'expired') {
      void logout('timeout');
    }
  }, [logout, status, timeoutState.phase]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      status,
      admin,
      login,
      logout,
      sessionPhase: timeoutState.phase,
      msUntilLogout: timeoutState.msUntilLogout,
      keepAlive: resetActivity,
    }),
    [
      admin,
      login,
      logout,
      resetActivity,
      status,
      timeoutState.msUntilLogout,
      timeoutState.phase,
    ]
  );

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error('useAdminAuth must be used inside an AdminAuthProvider');
  }

  return context;
}
