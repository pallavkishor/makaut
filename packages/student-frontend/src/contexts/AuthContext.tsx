'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, apiRequest, type ApiRequestOptions } from '@/lib/api';
import type {
  AuthUser,
  LoginResponse,
  RegisterResponse,
} from '@/types/api';

/**
 * Authentication state for the student platform.
 *
 * The session token is persisted in localStorage so a refresh keeps the student
 * signed in. Passwords are never stored and the token is never logged; it only
 * ever travels to the API client as an Authorization header.
 */

const STORAGE_KEY = 'educational-notes.student-session';

export interface StoredSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Issues an API request with the current session token attached. */
  authRequest: <TResponse>(
    path: string,
    options?: Omit<ApiRequestOptions, 'token'>
  ) => Promise<TResponse>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isExpired(expiresAt: string): boolean {
  const expiry = new Date(expiresAt).getTime();
  return Number.isNaN(expiry) ? false : expiry <= Date.now();
}

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed?.token !== 'string' ||
      typeof parsed?.expiresAt !== 'string' ||
      typeof parsed?.user?.email !== 'string' ||
      typeof parsed?.user?.id !== 'string'
    ) {
      return null;
    }

    if (isExpired(parsed.expiresAt)) return null;

    return parsed as StoredSession;
  } catch {
    // Corrupt or unreadable storage is treated as "no session"
    return null;
  }
}

function writeStoredSession(session: StoredSession | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory session
    // still works for the current page lifetime.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Kept in a ref so `authRequest` stays referentially stable across renders
  const sessionRef = useRef<StoredSession | null>(null);

  const applySession = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSession(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
    writeStoredSession(next);
  }, []);

  // Restore the persisted session on mount (client-only)
  useEffect(() => {
    const restored = readStoredSession();
    sessionRef.current = restored;
    setSession(restored);
    setStatus(restored ? 'authenticated' : 'unauthenticated');
  }, []);

  // Keep tabs in sync: signing out in one tab signs out the others
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      const restored = readStoredSession();
      sessionRef.current = restored;
      setSession(restored);
      setStatus(restored ? 'authenticated' : 'unauthenticated');
    }

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Drop the session the moment it expires while the tab is open
  useEffect(() => {
    if (!session) return;

    const msRemaining = new Date(session.expiresAt).getTime() - Date.now();
    if (Number.isNaN(msRemaining)) return;

    if (msRemaining <= 0) {
      applySession(null);
      return;
    }

    const timer = window.setTimeout(() => applySession(null), msRemaining);
    return () => window.clearTimeout(timer);
  }, [session, applySession]);

  const authRequest = useCallback(
    async <TResponse,>(
      path: string,
      options: Omit<ApiRequestOptions, 'token'> = {}
    ): Promise<TResponse> => {
      try {
        return await apiRequest<TResponse>(path, {
          ...options,
          token: sessionRef.current?.token ?? null,
        });
      } catch (error) {
        // A rejected token means the session is gone server-side (expired,
        // logged out elsewhere, or its device was revoked).
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          applySession(null);
        }
        throw error;
      }
    },
    [applySession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiRequest<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      applySession({
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        user: result.user,
      });
    },
    [applySession]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const result = await apiRequest<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: { email, password },
      });

      applySession({
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        user: {
          id: result.student.id,
          email: result.student.email,
          userType: 'student',
          registeredAt: result.student.registeredAt,
        },
      });
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    const token = sessionRef.current?.token;

    // Clear locally first so the UI never appears signed in after the click
    applySession(null);

    if (!token) return;

    try {
      await apiRequest('/api/auth/logout', { method: 'POST', token });
    } catch {
      // Best effort: the local session is already gone either way
    }
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      authRequest,
      login,
      register,
      logout,
    }),
    [status, session, authRequest, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
