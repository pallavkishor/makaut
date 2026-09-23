import type { AdminUser } from '@/types';

/**
 * Persistence for the admin session.
 *
 * Deliberately uses a dedicated storage key prefix so the admin session can
 * never be confused with a student session (Requirement 5.4).
 */

const TOKEN_KEY = 'admin.session.token';
const USER_KEY = 'admin.session.user';

export interface StoredAdminSession {
  token: string;
  admin: AdminUser;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    // Storage can throw when blocked by browser privacy settings.
    return null;
  }
}

export function loadStoredSession(): StoredAdminSession | null {
  const store = storage();

  if (!store) {
    return null;
  }

  const token = store.getItem(TOKEN_KEY);
  const rawUser = store.getItem(USER_KEY);

  if (!token || !rawUser) {
    return null;
  }

  try {
    const admin = JSON.parse(rawUser) as AdminUser;

    if (!admin || typeof admin.id !== 'string' || typeof admin.email !== 'string') {
      return null;
    }

    return { token, admin };
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredAdminSession): void {
  const store = storage();

  if (!store) {
    return;
  }

  store.setItem(TOKEN_KEY, session.token);
  store.setItem(USER_KEY, JSON.stringify(session.admin));
}

export function clearStoredSession(): void {
  const store = storage();

  if (!store) {
    return;
  }

  store.removeItem(TOKEN_KEY);
  store.removeItem(USER_KEY);
}
