import { apiRequest } from '../apiClient';
import type { AdminSession, AdminUser } from '@/types';

/**
 * Admin authentication calls (Requirements 5.1, 5.2, 5.3, 5.4).
 * These hit `/api/admin/auth/*`, entirely separate from the student endpoints.
 */

interface LoginResponseBody {
  admin?: Partial<AdminUser>;
  user?: Partial<AdminUser>;
  session: AdminSession;
}

export interface AdminLoginResult {
  admin: AdminUser;
  session: AdminSession;
}

export async function loginAdmin(
  email: string,
  password: string
): Promise<AdminLoginResult> {
  const body = await apiRequest<LoginResponseBody>('/api/admin/auth/login', {
    method: 'POST',
    body: { email, password },
    // A failed login must render inline, not trigger the session-expired flow.
    skipSessionHandler: true,
  });

  const source = body.admin ?? body.user ?? {};

  return {
    admin: {
      id: String(source.id ?? ''),
      email: String(source.email ?? email),
      userType: 'admin',
      createdAt: source.createdAt,
    },
    session: body.session,
  };
}

export async function logoutAdmin(): Promise<void> {
  await apiRequest<{ message?: string }>('/api/admin/auth/logout', {
    method: 'POST',
    skipSessionHandler: true,
  });
}
